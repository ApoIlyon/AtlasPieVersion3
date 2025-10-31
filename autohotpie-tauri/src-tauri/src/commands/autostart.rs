use tauri::{AppHandle, Runtime, State};

use super::{AppError, AppState, Result};
use crate::services::autostart::{AutostartInfo, AutostartService};

#[tauri::command]
pub fn get_autostart_status<R: Runtime>(app: AppHandle<R>) -> Result<AutostartInfo> {
    let service = AutostartService::new();
    Ok(service.status(&app))
}

#[tauri::command]
pub fn set_autostart_enabled<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    enable: bool,
) -> Result<AutostartInfo> {
    let service = AutostartService::new();
    service.enable(&app, enable)?;

    let message = if enable {
        "Autostart enabled"
    } else {
        "Autostart disabled"
    };
    state.audit().log("INFO", message).map_err(AppError::from)?;

    Ok(service.status(&app))
}

#[tauri::command]
pub fn open_autostart_location<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    let service = AutostartService::new();
    service.open_location(&app)
}
