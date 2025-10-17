pub mod settings;
pub mod system;

use crate::models::Settings;
use crate::services::audit_log::AuditLogger;
use crate::storage::StorageManager;
use std::sync::Mutex;
use tauri::{ipc::InvokeError, App, AppHandle, Manager};

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

    app.manage(AppState {
        storage,
        audit,
        settings: Mutex::new(settings),
    });

    Ok(())
}

pub fn current_version(app: &AppHandle) -> String {
    app.config()
        .version
        .as_deref()
        .unwrap_or("0.0.0")
        .to_string()
}
