use super::{AppError, AppState, Result};
use crate::services::audit_log::AuditLogSnapshot;
use std::fs::File;
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_opener::OpenerExt;

const DEFAULT_LIMIT: usize = 500;

#[tauri::command]
pub fn read_logs<R: Runtime>(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<AuditLogSnapshot> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).max(1);
    state.audit().read_recent(limit).map_err(AppError::from)
}

#[tauri::command]
pub fn open_latest_log<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>) -> Result<()> {
    let path = state.audit().current_log_path().map_err(AppError::from)?;

    if !path.exists() {
        File::create(&path).map_err(AppError::from)?;
    }

    let display_path = path.to_string_lossy().to_string();
    app.opener()
        .open_path(display_path, None::<&str>)
        .map_err(|err| AppError::Message(format!("failed to open log file: {err}")))?;

    Ok(())
}
