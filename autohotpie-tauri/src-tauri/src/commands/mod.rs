#![allow(dead_code)]

pub mod actions;
pub mod hotkeys;
pub mod settings;
pub mod system;

use self::hotkeys::{HotkeyState, HotkeyRegistrationStatus, RegisterHotkeyRequest};
use crate::domain::{Action, ActionId};
use crate::models::Settings;
use crate::services::action_runner::{
    ActionProvider, ActionRunner, ACTION_EXECUTED_EVENT, ACTION_FAILED_EVENT,
};
use crate::services::{
    action_events::ActionEventsChannel,
    audit_log::AuditLogger,
    connectivity,
    profile_router::{self, ProfileRouterState},
    storage_guard,
    system_status::SystemStatus,
    window_info,
};
use crate::storage::StorageManager;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{ipc::InvokeError, App, AppHandle, Emitter, Manager};
use tokio::sync::broadcast::error::RecvError;

const DEFAULT_PIE_HOTKEY_ID: &str = "global-pie";
const DEFAULT_PIE_ACCELERATOR: &str = "Alt+Q";
const DEFAULT_PIE_EVENT: &str = "hotkeys://trigger";

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

pub fn init(app: &mut App) -> anyhow::Result<()> {
    let handle = app.handle();
    let storage = StorageManager::new(handle.clone())?;
    let mut settings = storage.load()?;
    let version = current_version(&handle);
    if settings.set_app_version(&version) {
        storage.save_with_backup(&settings)?;
    }
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

    app.manage(AppState {
        storage: storage.clone(),
        audit,
        settings: Mutex::new(settings),
        action_runner,
        action_events,
        actions: Mutex::new(actions_map),
    });

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

    app.manage(HotkeyState::default());
    app.manage(ProfileRouterState::default());

    connectivity::start_monitor(handle.clone(), shared_status.clone());
    storage_guard::start_monitor(handle.clone(), storage.clone(), shared_status.clone());
    window_info::start_monitor(handle.clone(), shared_status);
    #[cfg(not(target_os = "linux"))]
    if let Err(err) = crate::services::tray::setup_tray(&handle) {
        eprintln!("failed to set up tray icon: {err}");
    }
    profile_router::start_router(handle.clone());
    initialize_default_hotkey(&handle);

    Ok(())
}

pub fn current_version(app: &AppHandle) -> String {
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

fn initialize_default_hotkey(handle: &AppHandle) {
    let state = handle.state::<HotkeyState>();
    let request = RegisterHotkeyRequest {
        id: DEFAULT_PIE_HOTKEY_ID.to_string(),
        accelerator: DEFAULT_PIE_ACCELERATOR.to_string(),
        event: DEFAULT_PIE_EVENT.to_string(),
        allow_conflicts: false,
    };

    match hotkeys::register_hotkey(handle.clone(), state, request) {
        Ok(status) => log_registration_status(status),
        Err(err) => {
            eprintln!(
                "failed to register default pie hotkey '{}': {}",
                DEFAULT_PIE_ACCELERATOR,
                err
            );
        }
    }
}

fn log_registration_status(status: HotkeyRegistrationStatus) {
    if status.registered {
        return;
    }

    if status.conflicts.is_empty() {
        eprintln!(
            "default pie hotkey '{}' not registered and no conflict info available",
            DEFAULT_PIE_ACCELERATOR
        );
        return;
    }

    for conflict in status.conflicts {
        eprintln!(
            "default pie hotkey '{}' conflict: {} - {}",
            DEFAULT_PIE_ACCELERATOR, conflict.code, conflict.message
        );
    }
}

#[tauri::command]
pub fn resolve_active_profile(
    app: AppHandle,
) -> Result<Option<profile_router::ActiveProfileSnapshot>> {
    profile_router::resolve_now(&app).map_err(|err| AppError::Message(err.to_string()))
}
