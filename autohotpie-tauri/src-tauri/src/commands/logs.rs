use super::{AppError, AppState, Result};
use crate::services::audit_log::AuditLogSnapshot;
use tauri::{State, Runtime};

const DEFAULT_LIMIT: usize = 500;

#[tauri::command]
pub fn read_logs<R: Runtime>(state: State<'_, AppState>, limit: Option<usize>) -> Result<AuditLogSnapshot> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).max(1);
    state
        .audit()
        .read_recent(limit)
        .map_err(AppError::from)
}
