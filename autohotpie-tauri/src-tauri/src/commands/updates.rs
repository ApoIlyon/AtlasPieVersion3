use super::{AppError, Result, UpdatesState};
use crate::services::update_checker;
use crate::services::update_checker::UpdateStatus;
use tauri::{AppHandle, Runtime, State};

#[tauri::command]
pub fn get_update_status(state: State<'_, UpdatesState>) -> Result<UpdateStatus> {
    Ok(state.checker.cached_status())
}

#[tauri::command]
pub async fn check_updates<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, UpdatesState>,
    force: Option<bool>,
) -> Result<UpdateStatus> {
    let checker = state.checker.clone();
    let status = checker
        .check_for_updates(force.unwrap_or(false))
        .await
        .map_err(|err| AppError::Message(err.to_string()))?;
    update_checker::emit_status(&app, &status);
    Ok(status)
}
