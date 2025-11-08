use super::{AppError, Result};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime, State, WebviewWindow};
use tauri_plugin_global_shortcut::{ShortcutEvent, ShortcutState};
use tauri_plugin_shell::ShellExt;

const OVERLAY_LABEL: &str = "radial-overlay";
const MAIN_LABEL: &str = "main";
const TOGGLE_THROTTLE: Duration = Duration::from_millis(350);

static LAST_TOGGLE: Lazy<Mutex<Option<Instant>>> = Lazy::new(|| Mutex::new(None));
static SHORTCUT_HELD: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));

fn overlay_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>> {
    app.get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| AppError::Message("radial overlay window not initialized".into()))
}

impl Default for RadialOverlayState {
    fn default() -> Self {
        Self {
            config: Mutex::new(default_config()),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ActivationMode {
    Toggle,
    Hold,
}

impl Default for ActivationMode {
    fn default() -> Self {
        ActivationMode::Toggle
    }
}

fn default_activation_mode() -> ActivationMode {
    ActivationMode::Toggle
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RadialMenuItem {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RadialMenuConfig {
    pub radius: f32,
    pub item_size: f32,
    pub spacing: f32,
    pub shortcut: String,
    #[serde(default = "default_activation_mode")]
    pub activation_mode: ActivationMode,
    pub items: Vec<RadialMenuItem>,
}

fn default_config() -> RadialMenuConfig {
    RadialMenuConfig {
        radius: 160.0,
        item_size: 62.0,
        spacing: 14.0,
        shortcut: "Alt+Q".into(),
        activation_mode: ActivationMode::Toggle,
        items: vec![
            RadialMenuItem {
                id: "radial-browser".into(),
                label: "Browser".into(),
                command: Some("https://www.example.com".into()),
                color: Some("#60a5fa".into()),
            },
            RadialMenuItem {
                id: "radial-mail".into(),
                label: "Mail".into(),
                command: Some("mailto:".into()),
                color: Some("#f472b6".into()),
            },
            RadialMenuItem {
                id: "radial-editor".into(),
                label: "Editor".into(),
                command: None,
                color: Some("#facc15".into()),
            },
            RadialMenuItem {
                id: "radial-terminal".into(),
                label: "Terminal".into(),
                command: None,
                color: Some("#34d399".into()),
            },
            RadialMenuItem {
                id: "radial-media".into(),
                label: "Media".into(),
                command: None,
                color: Some("#a855f7".into()),
            },
            RadialMenuItem {
                id: "radial-search".into(),
                label: "Search".into(),
                command: None,
                color: Some("#fb7185".into()),
            },
        ],
    }
}

pub struct RadialOverlayState {
    config: Mutex<RadialMenuConfig>,
}

impl RadialOverlayState {
    pub fn config(&self) -> Result<RadialMenuConfig> {
        self.config
            .lock()
            .map_err(|_| AppError::StatePoisoned)
            .map(|guard| guard.clone())
    }

    pub fn activation_mode(&self) -> ActivationMode {
        self.config
            .lock()
            .map(|guard| guard.activation_mode)
            .unwrap_or_default()
    }

    pub fn update_config<F>(&self, mut f: F) -> Result<RadialMenuConfig>
    where
        F: FnMut(&mut RadialMenuConfig) -> Result<()>,
    {
        let mut guard = self.config.lock().map_err(|_| AppError::StatePoisoned)?;
        f(&mut guard)?;
        Ok(guard.clone())
    }
}

fn emit_event<R: Runtime, P: serde::Serialize + Clone>(
    app: &AppHandle<R>,
    event: &str,
    payload: P,
) -> Result<()> {
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        main.emit(event, payload)
            .map_err(|err| AppError::Message(format!("failed to emit '{event}': {err}")))?;
    }
    Ok(())
}

fn show_overlay_internal<R: Runtime>(app: &AppHandle<R>) -> Result<bool> {
    let window = overlay_window(app)?;
    let is_visible = window.is_visible().unwrap_or(false);
    if is_visible {
        return Ok(false);
    }

    window
        .show()
        .map_err(|err| AppError::Message(format!("failed to show overlay: {err}")))?;
    window
        .set_focus()
        .map_err(|err| AppError::Message(format!("failed to focus overlay: {err}")))
        .ok();
    emit_event(app, "radial-overlay://shown", ())?;
    println!("[radial-overlay] window shown");
    Ok(true)
}

fn hide_overlay_internal<R: Runtime>(app: &AppHandle<R>) -> Result<bool> {
    let window = overlay_window(app)?;
    let is_visible = window.is_visible().unwrap_or(false);
    if !is_visible {
        return Ok(false);
    }

    window
        .hide()
        .map_err(|err| AppError::Message(format!("failed to hide overlay: {err}")))?;
    emit_event(app, "radial-overlay://hidden", ())?;
    println!("[radial-overlay] window hidden");
    Ok(true)
}

pub fn toggle_overlay_internal<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    let window = overlay_window(app)?;
    let is_visible = window.is_visible().unwrap_or(false);
    println!("[radial-overlay] toggle requested, currently visible: {is_visible}");

    let now = Instant::now();
    {
        let mut guard = LAST_TOGGLE.lock().map_err(|_| AppError::StatePoisoned)?;
        if let Some(last) = *guard {
            let since = now.saturating_duration_since(last);
            if since < TOGGLE_THROTTLE {
                println!(
                    "[radial-overlay] toggle ignored ({}ms since last)",
                    since.as_millis()
                );
                return Ok(());
            }
        }
        *guard = Some(now);
    }

    if is_visible {
        let _ = hide_overlay_internal(app)?;
    } else {
        let _ = show_overlay_internal(app)?;
    }

    Ok(())
}

#[tauri::command]
pub fn radial_overlay_toggle<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    toggle_overlay_internal(&app)
}

pub fn handle_shortcut_event<R: Runtime>(app: &AppHandle<R>, event: &ShortcutEvent) {
    let activation_mode = app
        .state::<RadialOverlayState>()
        .activation_mode();

    match event.state() {
        ShortcutState::Pressed => match activation_mode {
            ActivationMode::Toggle => {
                let already_pressed = SHORTCUT_HELD.swap(true, Ordering::SeqCst);
                if already_pressed {
                    println!("[radial-overlay] shortcut pressed again while held");
                    return;
                }
                if let Err(err) = toggle_overlay_internal(app) {
                    eprintln!("failed to toggle radial overlay: {err}");
                }
            }
            ActivationMode::Hold => {
                let already_active = SHORTCUT_HELD.swap(true, Ordering::SeqCst);
                if already_active {
                    println!("[radial-overlay] hold shortcut pressed while already active");
                    return;
                }
                if let Err(err) = show_overlay_internal(app) {
                    eprintln!("failed to show radial overlay (hold mode): {err}");
                }
            }
        },
        ShortcutState::Released => match activation_mode {
            ActivationMode::Toggle => {
                SHORTCUT_HELD.store(false, Ordering::SeqCst);
                println!("[radial-overlay] shortcut released");
            }
            ActivationMode::Hold => {
                let was_active = SHORTCUT_HELD.swap(false, Ordering::SeqCst);
                if !was_active {
                    return;
                }
                if let Err(err) = hide_overlay_internal(app) {
                    eprintln!("failed to hide radial overlay (hold mode): {err}");
                }
            }
        },
    }
}

#[tauri::command]
pub fn radial_overlay_select_item<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, RadialOverlayState>,
    item_id: String,
) -> Result<()> {
    let config = state.config()?;
    if let Some(item) = config
        .items
        .iter()
        .find(|candidate| candidate.id == item_id)
        .cloned()
    {
        if let Some(command) = item.command.as_deref() {
            if let Err(err) = app.shell().open(command.to_string(), None) {
                eprintln!("failed to execute radial overlay command: {err}");
            }
        }
        emit_event(&app, "radial-overlay://selected", item)
    } else {
        emit_event(&app, "radial-overlay://selected", item_id)
    }
}

#[tauri::command]
pub fn radial_overlay_notify_hidden<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    SHORTCUT_HELD.store(false, Ordering::SeqCst);
    emit_event(&app, "radial-overlay://hidden", ())
}

#[tauri::command]
pub fn radial_overlay_get_config(state: State<'_, RadialOverlayState>) -> Result<RadialMenuConfig> {
    state.config()
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RadialMenuConfigUpdate {
    #[serde(default)]
    pub activation_mode: Option<ActivationMode>,
}

#[tauri::command]
pub fn radial_overlay_update_config<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, RadialOverlayState>,
    update: RadialMenuConfigUpdate,
) -> Result<RadialMenuConfig> {
    let updated = state.update_config(|config| {
        if let Some(mode) = update.activation_mode {
            config.activation_mode = mode;
        }
        Ok(())
    })?;

    if let Ok(window) = overlay_window(&app) {
        let _ = window.emit("radial-overlay://config-updated", &updated);
    }

    let _ = emit_event(&app, "radial-overlay://config-updated", &updated);

    Ok(updated)
}
