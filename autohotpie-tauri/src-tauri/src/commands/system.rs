use super::{AppError, AppState, Result, SystemState};
use crate::services::profile_router::{ActiveProfileSnapshot, ProfileRouterState};
use crate::services::system_status::SystemStatus;
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::broadcast::error::RecvError;

#[tauri::command]
pub async fn subscribe_action_events(state: State<'_, AppState>, app: AppHandle) -> Result<()> {
    let mut rx = state.action_events_channel().subscribe();
    let emit_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(payload) => {
                    if let Err(err) = emit_handle.emit("actions://event", payload) {
                        eprintln!("failed to emit actions://event: {err}");
                    }
                }
                Err(RecvError::Closed) => break,
                Err(RecvError::Lagged(_)) => continue,
            }
        }
    });
    Ok(())
}
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn run_pie_menu(app: AppHandle, use_ahk: bool) -> Result<()> {
    let resource_name = if use_ahk {
        "PieMenu.ahk"
    } else {
        "PieMenu.exe"
    };
    let path = app
        .path()
        .resource_dir()
        .map_err(|err| AppError::Message(format!("resource directory not available: {err}")))?
        .join(resource_name);
    if !path.exists() {
        return Err(AppError::Message(format!(
            "resource '{resource_name}' not found"
        )));
    }
    Command::new(&path)
        .spawn()
        .map_err(|err| AppError::Message(format!("failed to launch {resource_name}: {err}")))?;
    Ok(())
}

#[tauri::command]
pub fn system_get_status(state: State<'_, SystemState>) -> Result<SystemStatus> {
    let guard = state.status.lock().map_err(|_| AppError::StatePoisoned)?;
    Ok(guard.clone())
}

#[tauri::command]
pub fn get_active_profile(
    state: State<'_, ProfileRouterState>,
) -> Result<Option<ActiveProfileSnapshot>> {
    Ok(state.current())
}

#[tauri::command]
pub fn get_version(app: AppHandle) -> Result<String> {
    Ok(super::current_version(&app))
}

#[tauri::command]
pub fn open_logs(app: AppHandle, state: State<'_, AppState>) -> Result<()> {
    let path: String = state
        .audit()
        .current_log_path()
        .map_err(AppError::from)?
        .to_string_lossy()
        .into_owned();
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|err| AppError::Message(format!("failed to open log file: {err}")))?;
    Ok(())
}
