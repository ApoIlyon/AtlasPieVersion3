#![allow(dead_code)]

pub mod actions;
pub mod autostart;
pub mod hotkeys;
pub mod import_export;
pub mod localization;
pub mod logs;
pub mod profiles;
pub mod radial_overlay;
pub mod settings;
pub mod system;
pub mod updates;

use self::{hotkeys::HotkeyState, radial_overlay::RadialOverlayState};
use crate::domain::{Action, ActionId};
use crate::models::Settings;
use crate::services::action_runner::{
    ActionProvider, ActionRunner, ACTION_EXECUTED_EVENT, ACTION_FAILED_EVENT,
};
#[cfg(feature = "tray-icon")]
use crate::services::tray;
use crate::services::{
    action_events::ActionEventsChannel,
    audit_log::AuditLogger,
    connectivity, localization as localization_service,
    profile_router::{self, ProfileRouterState},
    storage_guard,
    system_status::SystemStatus,
    update_checker::{self, UpdateChecker},
    window_info,
};
use crate::storage::profile_repository::{ProfileRecoveryInfo, ProfileStore};
use crate::storage::StorageManager;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::str::FromStr;
use tauri::{
    ipc::InvokeError, App, AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use tokio::sync::broadcast::error::RecvError;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("state poisoned")]
    StatePoisoned,
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Message(String),
}

impl From<AppError> for InvokeError {
    fn from(err: AppError) -> Self {
        InvokeError::from(err.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;

pub struct AppState {
    pub storage: StorageManager,
    pub audit: AuditLogger,
    pub settings: Mutex<Settings>,
    pub action_runner: ActionRunner,
    pub action_events: ActionEventsChannel,
    pub profiles: Mutex<ProfileStore>,
    profiles_recovery: Mutex<Option<ProfileRecoveryInfo>>,
    actions: Mutex<HashMap<ActionId, Action>>,
}

impl AppState {
    pub fn storage(&self) -> &StorageManager {
        &self.storage
    }

    pub fn audit(&self) -> &AuditLogger {
        &self.audit
    }

    pub fn lookup_action(&self, id: &ActionId) -> Option<Action> {
        self.actions
            .lock()
            .ok()
            .and_then(|guard| guard.get(id).cloned())
    }

    pub fn replace_actions(&self, actions: Vec<Action>) {
        if let Ok(mut guard) = self.actions.lock() {
            *guard = collect_actions(&actions);
        }
    }

    pub fn actions_snapshot(&self) -> Vec<Action> {
        self.actions
            .lock()
            .map(|guard| guard.values().cloned().collect())
            .unwrap_or_default()
    }

    pub fn action_events_channel(&self) -> ActionEventsChannel {
        self.action_events.clone()
    }

    pub fn with_profiles_mut<R>(
        &self,
        f: impl FnOnce(&mut ProfileStore) -> Result<R>,
    ) -> Result<R> {
        let mut guard = self.profiles.lock().map_err(|_| AppError::StatePoisoned)?;
        let output = f(&mut guard)?;
        self.storage.save_profiles(&guard).map_err(AppError::from)?;
        if let Ok(mut recovery) = self.profiles_recovery.lock() {
            *recovery = None;
        }
        Ok(output)
    }

    pub fn profiles_snapshot(&self) -> Result<ProfileStore> {
        self.profiles
            .lock()
            .map_err(|_| AppError::StatePoisoned)
            .map(|guard| guard.clone())
    }

    pub fn profile_recovery(&self) -> Option<ProfileRecoveryInfo> {
        self.profiles_recovery
            .lock()
            .ok()
            .and_then(|guard| guard.clone())
    }

    pub fn set_profile_recovery(&self, info: Option<ProfileRecoveryInfo>) {
        if let Ok(mut guard) = self.profiles_recovery.lock() {
            *guard = info;
        }
    }

    pub fn request_action<R>(
        &self,
        f: impl FnOnce(&mut HashMap<ActionId, Action>) -> R,
    ) -> Result<R> {
        let mut guard = self.actions.lock().map_err(|_| AppError::StatePoisoned)?;
        Ok(f(&mut guard))
    }
}

impl ActionProvider for AppState {
    fn get_action(&self, id: &ActionId) -> Option<Action> {
        self.lookup_action(id)
    }
}

pub struct SystemState {
    pub status: Arc<Mutex<SystemStatus>>,
}

pub struct UpdatesState {
    pub checker: Arc<UpdateChecker>,
}

const RADIAL_OVERLAY_LABEL: &str = "radial-overlay";

pub fn init<R: Runtime>(app: &mut App<R>) -> anyhow::Result<()> {
    let handle = app.handle();
    let storage = StorageManager::new(handle.clone())?;
    let mut settings = storage.load()?;
    let version = current_version(&handle);
    if settings.set_app_version(&version) {
        storage.save_with_backup(&settings)?;
    }
    let (profiles, recovery) = match storage.load_profiles_or_migrate(&settings) {
        Ok(store) => (store, None),
        Err(err) => {
            if let Some(info) = err.to_recovery() {
                eprintln!(
                    "profiles store corrupted at {}: {}",
                    info.file_path, info.message
                );
                (ProfileStore::default(), Some(info))
            } else {
                return Err(err.into());
            }
        }
    };
    let audit = AuditLogger::from_storage(&storage)?;
    let action_events = ActionEventsChannel::default();

    let storage_mode = storage_guard::detect_mode(&storage);
    let shared_status = Arc::new(Mutex::new(SystemStatus::new(storage_mode)));

    let actions = storage.load_actions().unwrap_or_default();
    let actions_map = collect_actions(&actions);

    let action_runner = ActionRunner::new(
        storage.base_dir().to_path_buf(),
        audit.clone(),
        action_events.clone(),
    );

    localization_service::init(&handle)?;

    let checker = Arc::new(UpdateChecker::new(version.clone())?);

    update_checker::emit_status(&handle, &checker.cached_status());
    update_checker::start_polling(handle.clone(), checker.clone());

    app.manage(AppState {
        storage: storage.clone(),
        audit,
        settings: Mutex::new(settings),
        action_runner,
        action_events,
        profiles: Mutex::new(profiles),
        profiles_recovery: Mutex::new(recovery.clone()),
        actions: Mutex::new(actions_map),
    });

    app.manage(UpdatesState { checker });

    if let Some(info) = recovery {
        if let Err(err) = handle.emit(
            "profiles://recovery-required",
            serde_json::json!({
                "message": info.message,
                "filePath": info.file_path,
                "backupsDir": info.backups_dir,
            }),
        ) {
            eprintln!("failed to emit profiles recovery event: {err}");
        }
    }

    let dispatch_handle = handle.clone();
    let dispatch_events = app.state::<AppState>().action_events_channel();
    tauri::async_runtime::spawn(async move {
        let mut rx = dispatch_events.subscribe();
        loop {
            match rx.recv().await {
                Ok(payload) => {
                    let event_name = match payload.status {
                        crate::domain::ActionEventStatus::Success
                        | crate::domain::ActionEventStatus::Skipped => ACTION_EXECUTED_EVENT,
                        crate::domain::ActionEventStatus::Failure => ACTION_FAILED_EVENT,
                    };
                    let cloned = payload.clone();
                    if let Err(err) = dispatch_handle.emit(event_name, cloned) {
                        eprintln!("failed to emit {event_name}: {err}");
                    }
                    if let Err(err) = dispatch_handle.emit("actions://event", payload) {
                        eprintln!("failed to emit actions://event: {err}");
                    }
                }
                Err(RecvError::Closed) => break,
                Err(RecvError::Lagged(_)) => continue,
            }
        }
    });

    app.manage(SystemState {
        status: shared_status.clone(),
    });

    app.manage(RadialOverlayState::default());
    app.manage(HotkeyState::default());
    app.manage(ProfileRouterState::default());

    connectivity::start_monitor(handle.clone(), shared_status.clone());
    storage_guard::start_monitor(handle.clone(), storage.clone(), shared_status.clone());
    window_info::start_monitor(handle.clone(), shared_status);
    #[cfg(all(feature = "tray-icon", not(target_os = "linux")))]
    if let Err(err) = crate::services::tray::setup_tray(&handle) {
        eprintln!("failed to set up tray icon: {err}");
    }
    profile_router::start_router(handle.clone());
    #[cfg(feature = "tray-icon")]
    tauri::async_runtime::block_on(tray::ensure_tray_state(&handle)).ok();

    setup_radial_overlay(&handle);

    Ok(())
}

pub fn shutdown() {
    localization_service::shutdown();
}

pub fn current_version<R: Runtime>(app: &AppHandle<R>) -> String {
    app.config()
        .version
        .as_deref()
        .unwrap_or("0.0.0")
        .to_string()
}

fn collect_actions(actions: &[Action]) -> HashMap<ActionId, Action> {
    let mut map = HashMap::with_capacity(actions.len());
    for action in actions {
        map.insert(action.id, action.clone());
    }
    map
}

fn setup_radial_overlay<R: Runtime>(handle: &AppHandle<R>) {
    if handle.get_webview_window(RADIAL_OVERLAY_LABEL).is_none() {
        match WebviewWindowBuilder::new(
            handle,
            RADIAL_OVERLAY_LABEL,
            WebviewUrl::App("overlay.html".into()),
        )
        .decorations(false)
        .visible(false)
        .resizable(false)
        .transparent(true)
        .always_on_top(true)
        .title("Radial Menu")
        .inner_size(520.0, 520.0)
        .build()
        {
            Ok(window) => {
                let _ = window.set_skip_taskbar(true);
                let _ = window.center();
                println!("[radial-overlay] window initialized");
            }
            Err(err) => {
                eprintln!("failed to create radial overlay window: {err}");
            }
        }
    }

    println!("[radial-overlay] awaiting profile hotkey trigger");
}

#[tauri::command]
pub fn resolve_active_profile<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<profile_router::ActiveProfileSnapshot>> {
    profile_router::resolve_now(&app).map_err(|err| AppError::Message(err.to_string()))
}
