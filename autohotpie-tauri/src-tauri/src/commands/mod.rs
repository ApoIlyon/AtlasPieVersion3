pub mod settings;
pub mod system;
pub mod hotkeys;
pub mod actions;

use crate::domain::{Action, ActionId};
use crate::models::Settings;
use crate::services::{
    action_runner::ActionRunner,
    audit_log::AuditLogger,
    connectivity,
    profile_router::{self, ProfileRouterState},
    storage_guard,
    system_status::SystemStatus,
    window_info,
};
use crate::storage::StorageManager;
use crate::services::action_runner::ActionProvider;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{ipc::InvokeError, App, AppHandle, Manager};
use self::hotkeys::HotkeyState;

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

    pub fn request_action<R>(&self, f: impl FnOnce(&mut HashMap<ActionId, Action>) -> R) -> Result<R> {
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

    let storage_mode = storage_guard::detect_mode(&storage);
    let shared_status = Arc::new(Mutex::new(SystemStatus::new(storage_mode)));

    let actions = storage.load_actions().unwrap_or_default();
    let actions_map = collect_actions(&actions);

    let action_runner = ActionRunner::new(
        handle.clone(),
        storage.base_dir().to_path_buf(),
        audit.clone(),
    );

    app.manage(AppState {
        storage: storage.clone(),
        audit,
        settings: Mutex::new(settings),
        action_runner,
        actions: Mutex::new(actions_map),
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
