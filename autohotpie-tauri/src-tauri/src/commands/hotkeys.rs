//! Hotkey management commands and conflict detection.
//! 
//! DEPRECATED: Hotkey registration has been disabled as per T021 - User Story 5.
//! All registration attempts will return a "registrationDisabled" conflict.

use super::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

pub const HOTKEY_TRIGGER_EVENT: &str = "hotkeys://trigger";

static LAST_PRESS_MODE: Lazy<Mutex<HashMap<String, bool>>> = Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyEventPayload {
    pub id: String,
    pub accelerator: String,
    pub state: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmitTriggerRequest {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub accelerator: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
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
    register_hotkey_impl(&app, state.inner(), request)
}

fn register_hotkey_impl<R: Runtime>(
    app: &AppHandle<R>,
    state: &HotkeyState,
    request: RegisterHotkeyRequest,
) -> Result<HotkeyRegistrationStatus> {
    let RegisterHotkeyRequest {
        id,
        accelerator,
        event,
        allow_conflicts,
    } = request;

    let mut conflicts = evaluate_conflicts_internal(state, &accelerator, Some(&id))?;

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

    let shortcut = Shortcut::from_str(&accelerator)
        .map_err(|err| AppError::Message(format!("Invalid accelerator: {err}")))?;

    let has_blocking = conflicts.iter().any(|conflict| {
        conflict.code == "invalidAccelerator"
    });

    if has_blocking {
        return Ok(finalize(false, conflicts));
    }

    if !conflicts.is_empty() && !allow_conflicts {
        return Ok(finalize(false, conflicts));
    }

    if allow_conflicts {
        loop {
            let duplicate = match state.find_by_accelerator(&accelerator)? {
                Some(existing) if existing.id != id => existing,
                _ => break,
            };

            if let Ok(prev_shortcut) = Shortcut::from_str(&duplicate.accelerator) {
                let _ = app.global_shortcut().unregister(prev_shortcut);
            }
            let _ = state.remove_by_id(&duplicate.id)?;
        }
        conflicts.retain(|conflict| conflict.code != "duplicateInternal");
    }

    if let Some(existing) = existing_for_id {
        if existing.accelerator.eq_ignore_ascii_case(&accelerator) {
            state.upsert(RegisteredHotkey {
                id: id.clone(),
                accelerator: existing.accelerator,
                event: event.clone(),
            })?;
            return Ok(finalize(true, Vec::new()));
        }

        if let Ok(prev_shortcut) = Shortcut::from_str(&existing.accelerator) {
            let _ = app.global_shortcut().unregister(prev_shortcut);
        }
        let _ = state.remove_by_id(&existing.id)?;
    }

    let event_name = event.clone();
    let shortcut_id = id.clone();
    let accelerator_for_event = accelerator.clone();

    app
        .global_shortcut()
        .on_shortcut(shortcut.clone(), move |app_handle, _shortcut, evt: ShortcutEvent| {
            let state_str = match evt.state {
                ShortcutState::Pressed => "pressed",
                ShortcutState::Released => "released",
            };

            let payload = HotkeyEventPayload {
                id: shortcut_id.clone(),
                accelerator: accelerator_for_event.clone(),
                state: state_str.to_string(),
            };

            let _ = app_handle.emit(&event_name, payload);

            // Backend safety: ensure overlay closes on release when overlay is in hold mode
            if matches!(evt.state, ShortcutState::Released) {
                let mut guard = LAST_PRESS_MODE.lock().unwrap_or_else(|e| e.into_inner());
                if guard.remove(&shortcut_id).unwrap_or(false) {
                    let store = app_handle.state::<crate::services::pie_overlay::PieOverlayStore>();
                    if store.snapshot().visible {
                        let _ = crate::services::pie_overlay::hide(&app_handle, &store);
                    }
                }
            } else {
                let router = app_handle.state::<crate::services::profile_router::ProfileRouterState>();
                let mut guard = LAST_PRESS_MODE.lock().unwrap_or_else(|e| e.into_inner());
                let mut is_hold = router
                    .current()
                    .map(|p| p.hold_to_open)
                    .unwrap_or(false);
                if !is_hold {
                    let store = app_handle.state::<crate::services::pie_overlay::PieOverlayStore>();
                    is_hold = store
                        .snapshot()
                        .activation_mode
                        .as_deref()
                        .map(|m| m.eq_ignore_ascii_case("hold"))
                        .unwrap_or(false);
                }
                guard.insert(shortcut_id.clone(), is_hold);
            }
        })
        .map_err(|err| AppError::Message(format!(
            "Failed to register global hotkey: {err}"
        )))?;

    state.upsert(RegisteredHotkey {
        id: id.clone(),
        accelerator: accelerator.clone(),
        event: event.clone(),
    })?;

    Ok(finalize(true, Vec::new()))
}

#[tauri::command]
pub fn unregister_hotkey<R: Runtime>(
    _app: AppHandle<R>,
    _state: State<'_, HotkeyState>,
    _request: UnregisterHotkeyRequest,
) -> Result<()> {
    // Hotkey registration disabled as per T021 - User Story 5
    // No-op since registration is disabled
    Ok(())
}

#[tauri::command]
pub fn emit_hotkey_trigger<R: Runtime>(
    app: AppHandle<R>,
    request: Option<EmitTriggerRequest>,
) -> Result<()> {
    let request = request.unwrap_or_default();
    let mut state = request.state.unwrap_or_else(|| "pressed".into());
    if !matches!(state.as_str(), "pressed" | "released") {
        state = "pressed".into();
    }

    let payload = HotkeyEventPayload {
        id: request
            .id
            .unwrap_or_else(|| "external-trigger".to_string()),
        accelerator: request.accelerator.unwrap_or_default(),
        state,
    };

    app.emit(HOTKEY_TRIGGER_EVENT, payload)
        .map_err(|err| AppError::Message(format!(
            "failed to emit hotkey trigger: {err}"
        )))
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
    let conflicts = evaluate_conflicts(&app, &state, &request.accelerator, None)?;

    if conflicts
        .iter()
        .any(|conflict| conflict.code == "invalidAccelerator")
    {
        return Ok(HotkeyRegistrationStatus {
            registered: false,
            conflicts,
        });
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

fn broadcast_conflicts<R: Runtime>(app: &AppHandle<R>, snapshot: &HotkeyConflictSnapshot) {
    let _ = app.emit("hotkeys://conflicts", snapshot);
}

fn evaluate_conflicts<R: Runtime>(
    _app: &AppHandle<R>,
    state: &State<'_, HotkeyState>,
    accelerator: &str,
    ignore_id: Option<&str>,
) -> Result<Vec<HotkeyConflict>> {
    evaluate_conflicts_internal(state.inner(), accelerator, ignore_id)
}

fn evaluate_conflicts_internal(
    state: &HotkeyState,
    accelerator: &str,
    ignore_id: Option<&str>,
    ) -> Result<Vec<HotkeyConflict>>
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
    let _ = shortcut;

    // Detect Windows-reserved combinations that are known to be intercepted by the OS
    // Alt+Space opens the window system menu and cannot be overridden reliably
    #[cfg(target_os = "windows")]
    {
        let lower = accelerator.to_ascii_lowercase();
        let parts: Vec<&str> = lower.split('+').map(|s| s.trim()).collect();
        let has_alt = parts.iter().any(|p| *p == "alt" || *p == "option");
        let has_space = parts.iter().any(|p| *p == "space" || *p == "spacebar" || *p == " ");
        if has_alt && has_space {
            conflicts.push(HotkeyConflict {
                code: "platformDenied".into(),
                message: "Alt+Space is reserved by Windows (opens window menu)".into(),
                meta: None,
            });
        }
    }

    Ok(conflicts)
}
