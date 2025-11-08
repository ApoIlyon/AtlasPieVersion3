//! Hotkey management commands and conflict detection.

use super::{radial_overlay, AppError, Result};
use crate::services::profile_router;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Runtime, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

const HOTKEY_TRIGGER_EVENT: &str = "hotkeys://trigger";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyEventPayload {
    pub id: String,
    pub accelerator: String,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyConflictMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflicting_id: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyConflict {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<HotkeyConflictMeta>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyConflictSnapshot {
    pub id: String,
    pub accelerator: String,
    pub registered: bool,
    pub conflicts: Vec<HotkeyConflict>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyRegistrationStatus {
    pub registered: bool,
    pub conflicts: Vec<HotkeyConflict>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredHotkey {
    pub id: String,
    pub accelerator: String,
    pub event: String,
}

#[derive(Default)]
pub struct HotkeyState {
    registry: Mutex<HashMap<String, RegisteredHotkey>>, // id -> hotkey
}

impl HotkeyState {
    pub fn list(&self) -> Result<Vec<RegisteredHotkey>> {
        let guard = self.registry.lock().map_err(|_| AppError::StatePoisoned)?;
        Ok(guard.values().cloned().collect())
    }

    fn upsert(&self, hotkey: RegisteredHotkey) -> Result<()> {
        let mut guard = self.registry.lock().map_err(|_| AppError::StatePoisoned)?;
        guard.insert(hotkey.id.clone(), hotkey);
        Ok(())
    }

    fn remove_by_id(&self, id: &str) -> Result<Option<RegisteredHotkey>> {
        let mut guard = self.registry.lock().map_err(|_| AppError::StatePoisoned)?;
        Ok(guard.remove(id))
    }

    fn find_by_accelerator(&self, accelerator: &str) -> Result<Option<RegisteredHotkey>> {
        let guard = self.registry.lock().map_err(|_| AppError::StatePoisoned)?;
        Ok(guard
            .values()
            .find(|entry| entry.accelerator.eq_ignore_ascii_case(accelerator))
            .cloned())
    }

    fn find_by_id(&self, id: &str) -> Result<Option<RegisteredHotkey>> {
        let guard = self.registry.lock().map_err(|_| AppError::StatePoisoned)?;
        Ok(guard.get(id).cloned())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterHotkeyRequest {
    pub id: String,
    pub accelerator: String,
    #[serde(default = "default_emit_event")]
    pub event: String,
    #[serde(default)]
    pub allow_conflicts: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnregisterHotkeyRequest {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyCheckRequest {
    pub accelerator: String,
}

fn default_emit_event() -> String {
    HOTKEY_TRIGGER_EVENT.to_string()
}

#[tauri::command]
pub fn register_hotkey<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, HotkeyState>,
    request: RegisterHotkeyRequest,
) -> Result<HotkeyRegistrationStatus> {
    register_hotkey_impl(
        &app,
        state.inner(),
        request,
        |shortcut, payload, event| register_shortcut(&app, shortcut, event, payload.clone()),
        |accelerator| unregister_shortcut(&app, accelerator),
        |shortcut| Ok(app.global_shortcut().is_registered(shortcut.clone())),
        |shortcut, accelerator| probe_platform_conflicts(&app, shortcut, accelerator),
    )
}

fn register_hotkey_impl<R: Runtime, FRegister, FUnregister, FIsRegistered, FPlatformProbe>(
    app: &AppHandle<R>,
    state: &HotkeyState,
    request: RegisterHotkeyRequest,
    mut register_fn: FRegister,
    mut unregister_fn: FUnregister,
    mut is_registered_fn: FIsRegistered,
    mut platform_probe: FPlatformProbe,
) -> Result<HotkeyRegistrationStatus>
where
    FRegister: FnMut(Shortcut, HotkeyEventPayload, String) -> Result<()>,
    FUnregister: FnMut(&str) -> Result<()>,
    FIsRegistered: FnMut(&Shortcut) -> Result<bool>,
    FPlatformProbe: FnMut(Shortcut, &str) -> Result<Vec<HotkeyConflict>>,
{
    let RegisterHotkeyRequest {
        id,
        accelerator,
        event,
        allow_conflicts,
    } = request;

    let mut conflicts = evaluate_conflicts_internal(state, &accelerator, Some(&id), |shortcut| {
        is_registered_fn(shortcut)
    })?;

    let publish_status = |status: &HotkeyRegistrationStatus| {
        broadcast_conflicts(
            &app,
            &HotkeyConflictSnapshot {
                id: id.clone(),
                accelerator: accelerator.clone(),
                registered: status.registered,
                conflicts: status.conflicts.clone(),
            },
        );
    };

    let finalize = |registered: bool, conflicts: Vec<HotkeyConflict>| {
        let status = HotkeyRegistrationStatus {
            registered,
            conflicts,
        };
        publish_status(&status);
        status
    };

    if conflicts
        .iter()
        .any(|conflict| conflict.code == "invalidAccelerator")
    {
        return Ok(finalize(false, conflicts));
    }

    let existing_for_id = state.find_by_id(&id)?;
    let should_probe_platform = existing_for_id
        .as_ref()
        .map(|existing| !existing.accelerator.eq_ignore_ascii_case(&accelerator))
        .unwrap_or(true)
        && !conflicts.iter().any(|conflict| {
            matches!(
                conflict.code.as_str(),
                "duplicateInternal" | "alreadyRegistered" | "reservedByPlatform"
            )
        });

    let shortcut = Shortcut::from_str(&accelerator)
        .map_err(|err| AppError::Message(format!("Invalid accelerator: {err}")))?;

    if should_probe_platform {
        let mut platform_conflicts = platform_probe(shortcut.clone(), &accelerator)?;
        conflicts.append(&mut platform_conflicts);
    }

    let has_blocking = conflicts.iter().any(|conflict| {
        matches!(
            conflict.code.as_str(),
            "invalidAccelerator" | "reservedByPlatform" | "platformDenied"
        )
    });

    if has_blocking {
        return Ok(finalize(false, conflicts));
    }

    if !conflicts.is_empty() && !allow_conflicts {
        return Ok(finalize(false, conflicts));
    }

    if allow_conflicts {
        for conflict in &conflicts {
            match conflict.code.as_str() {
                "duplicateInternal" => {
                    if let Some(existing) = state.find_by_accelerator(&accelerator)? {
                        if existing.id != id {
                            let _ = state.remove_by_id(&existing.id)?;
                            let _ = unregister_fn(&existing.accelerator);
                        }
                    }
                }
                "alreadyRegistered" => {
                    unregister_fn(&accelerator)?;
                }
                _ => {}
            }
        }
    }

    if let Some(existing) = existing_for_id {
        if !existing.accelerator.eq_ignore_ascii_case(&accelerator) {
            unregister_fn(&existing.accelerator)?;
        }
    }

    let payload = HotkeyEventPayload {
        id: id.clone(),
        accelerator: accelerator.clone(),
    };

    register_fn(shortcut, payload, event.clone())?;

    state.upsert(RegisteredHotkey {
        id: id.clone(),
        accelerator: accelerator.clone(),
        event: event.clone(),
    })?;

    Ok(finalize(true, Vec::new()))
}

#[tauri::command]
pub fn unregister_hotkey<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, HotkeyState>,
    request: UnregisterHotkeyRequest,
) -> Result<()> {
    if let Some(previous) = state.remove_by_id(&request.id)? {
        unregister_shortcut(&app, &previous.accelerator)?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_hotkeys(state: State<'_, HotkeyState>) -> Result<Vec<RegisteredHotkey>> {
    state.list()
}

#[tauri::command]
pub fn check_hotkey<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, HotkeyState>,
    request: HotkeyCheckRequest,
) -> Result<HotkeyRegistrationStatus> {
    let mut conflicts = evaluate_conflicts(&app, &state, &request.accelerator, None)?;

    if conflicts
        .iter()
        .any(|conflict| conflict.code == "invalidAccelerator")
    {
        return Ok(HotkeyRegistrationStatus {
            registered: false,
            conflicts,
        });
    }

    if !conflicts.iter().any(|conflict| {
        matches!(
            conflict.code.as_str(),
            "duplicateInternal" | "alreadyRegistered" | "reservedByPlatform"
        )
    }) {
        if let Ok(shortcut) = Shortcut::from_str(&request.accelerator) {
            let mut platform_conflicts =
                probe_platform_conflicts(&app, shortcut, &request.accelerator)?;
            conflicts.append(&mut platform_conflicts);
        }
    }

    let accelerator = request.accelerator;
    let status = HotkeyRegistrationStatus {
        registered: conflicts.is_empty(),
        conflicts,
    };

    broadcast_conflicts(
        &app,
        &HotkeyConflictSnapshot {
            id: "check".into(),
            accelerator,
            registered: status.registered,
            conflicts: status.conflicts.clone(),
        },
    );

    Ok(status)
}

fn register_shortcut<R: Runtime>(
    app: &AppHandle<R>,
    shortcut: Shortcut,
    event: String,
    payload: HotkeyEventPayload,
) -> Result<()> {
    let event_for_emit = event.clone();
    let payload_for_emit = payload.clone();
    let should_toggle_overlay = event_for_emit == HOTKEY_TRIGGER_EVENT
        && payload_for_emit.id.starts_with("profile:");
    app.global_shortcut()
        .on_shortcut(shortcut, move |handle, _shortcut, shortcut_event| {
            if let Err(err) = profile_router::resolve_now(&handle) {
                eprintln!("failed to resolve active profile on hotkey: {err}");
            }
            let _ = handle.emit(&event_for_emit, payload_for_emit.clone());
            if should_toggle_overlay {
                radial_overlay::handle_shortcut_event(&handle, &shortcut_event);
            }
        })
        .map_err(|err| AppError::Message(format!("failed to register global shortcut: {err}")))
}

fn unregister_shortcut<R: Runtime>(app: &AppHandle<R>, accelerator: &str) -> Result<()> {
    if let Ok(shortcut) = Shortcut::from_str(accelerator) {
        if app.global_shortcut().is_registered(shortcut.clone()) {
            app.global_shortcut().unregister(shortcut).map_err(|err| {
                AppError::Message(format!("failed to unregister global shortcut: {err}"))
            })?;
        }
    }

    Ok(())
}

fn probe_platform_conflicts<R: Runtime>(
    app: &AppHandle<R>,
    shortcut: Shortcut,
    accelerator: &str,
) -> Result<Vec<HotkeyConflict>> {
    let mut conflicts = Vec::new();
    match app
        .global_shortcut()
        .on_shortcut(shortcut.clone(), |_handle, _shortcut, _event| {})
    {
        Ok(_) => {
            let _ = app.global_shortcut().unregister(shortcut);
        }
        Err(err) => {
            conflicts.push(HotkeyConflict {
                code: "platformDenied".into(),
                message: format!(
                    "Operating system rejected accelerator '{}': {}",
                    accelerator, err
                ),
                meta: None,
            });
        }
    }

    Ok(conflicts)
}

fn broadcast_conflicts<R: Runtime>(app: &AppHandle<R>, snapshot: &HotkeyConflictSnapshot) {
    let _ = app.emit("hotkeys://conflicts", snapshot);
}

fn evaluate_conflicts<R: Runtime>(
    app: &AppHandle<R>,
    state: &State<'_, HotkeyState>,
    accelerator: &str,
    ignore_id: Option<&str>,
) -> Result<Vec<HotkeyConflict>> {
    evaluate_conflicts_internal(state.inner(), accelerator, ignore_id, |shortcut| {
        Ok(app.global_shortcut().is_registered(shortcut.clone()))
    })
}

fn evaluate_conflicts_internal<F>(
    state: &HotkeyState,
    accelerator: &str,
    ignore_id: Option<&str>,
    mut is_registered: F,
) -> Result<Vec<HotkeyConflict>>
where
    F: FnMut(&Shortcut) -> Result<bool>,
{
    let mut conflicts = Vec::new();

    if let Some(existing) = state.find_by_accelerator(accelerator)? {
        let is_same = ignore_id.map(|id| id == existing.id).unwrap_or(false);
        if !is_same {
            conflicts.push(HotkeyConflict {
                code: "duplicateInternal".into(),
                message: format!("Accelerator already registered under id '{}'", existing.id),
                meta: Some(HotkeyConflictMeta {
                    conflicting_id: Some(existing.id.clone()),
                }),
            });
        }
    }

    if is_reserved_platform_shortcut(accelerator) {
        conflicts.push(HotkeyConflict {
            code: "reservedByPlatform".into(),
            message: format!(
                "Accelerator '{}' is reserved by the operating system",
                accelerator
            ),
            meta: None,
        });
    }

    let shortcut = match Shortcut::from_str(accelerator) {
        Ok(value) => value,
        Err(err) => {
            conflicts.push(HotkeyConflict {
                code: "invalidAccelerator".into(),
                message: format!("Invalid accelerator: {err}"),
                meta: None,
            });
            return Ok(conflicts);
        }
    };

    if is_registered(&shortcut)? {
        conflicts.push(HotkeyConflict {
            code: "alreadyRegistered".into(),
            message: format!("Accelerator '{}' is already registered", accelerator),
            meta: None,
        });
    }

    Ok(conflicts)
}

fn is_reserved_platform_shortcut(accelerator: &str) -> bool {
    let normalized = accelerator.to_ascii_uppercase();

    #[cfg(target_os = "windows")]
    const RESERVED: &[&str] = &["ALT+TAB", "CTRL+ALT+DEL", "ALT+F4", "WIN+L", "WIN+D"];
    #[cfg(target_os = "macos")]
    const RESERVED: &[&str] = &["CMD+TAB", "CMD+OPTION+ESC", "CTRL+CMD+Q"];
    #[cfg(target_os = "linux")]
    const RESERVED: &[&str] = &["CTRL+ALT+F1", "CTRL+ALT+F2", "CTRL+ALT+F3", "CTRL+ALT+F4"];
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    const RESERVED: &[&str] = &[];

    RESERVED.iter().any(|shortcut| normalized == *shortcut)
}
