use super::{AppError, Result};
use super::update_state::UpdatesState;
use crate::services::update_checker;
use crate::services::update_checker::UpdateStatus;
use crate::services::update_download::get_filename_from_url;
use std::path::PathBuf;
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

#[tauri::command]
pub fn set_update_channel(
    state: State<'_, UpdatesState>,
    _channel: String,
) -> Result<UpdateStatus> {
    // Update the channel in the cached status
    // Temporarily disabled due to compilation issues
    // let status = (*state.checker).set_update_channel(channel);
    // Ok(status)
    Ok(state.checker.cached_status())
}

#[tauri::command]
pub async fn download_update<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, UpdatesState>,
    url: String,
    filename: Option<String>,
) -> Result<String> {
    let downloader = state.downloader.as_ref()
        .ok_or_else(|| AppError::Message("Update downloader not initialized".to_string()))?;
    
    let filename = filename.unwrap_or_else(|| get_filename_from_url(&url));
    let download_path = downloader.download_update(app, &url, &filename).await
        .map_err(|err| AppError::Message(err.to_string()))?;
    
    Ok(download_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn cancel_download(state: State<'_, UpdatesState>) -> Result<()> {
    let downloader = state.downloader.as_ref()
        .ok_or_else(|| AppError::Message("Update downloader not initialized".to_string()))?;
    
    downloader.cancel_download()
        .map_err(|err| AppError::Message(err.to_string()))
}

#[tauri::command]
pub fn is_downloading(state: State<'_, UpdatesState>) -> Result<bool> {
    let downloader = state.downloader.as_ref()
        .ok_or_else(|| AppError::Message("Update downloader not initialized".to_string()))?;
    
    Ok(downloader.is_downloading())
}

#[tauri::command]
pub async fn install_update<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, UpdatesState>,
    update_path: String,
    require_consent: Option<bool>,
) -> Result<()> {
    let installer = state.installer.as_ref()
        .ok_or_else(|| AppError::Message("Update installer not initialized".to_string()))?;
    
    let path = PathBuf::from(update_path);
    installer.install_update(app, &path, require_consent.unwrap_or(true)).await
        .map_err(|err| AppError::Message(err.to_string()))
}

#[tauri::command]
pub async fn cleanup_old_downloads(state: State<'_, UpdatesState>, keep_days: Option<u64>) -> Result<()> {
    let downloader = state.downloader.as_ref()
        .ok_or_else(|| AppError::Message("Update downloader not initialized".to_string()))?;
    
    downloader.cleanup_old_downloads(keep_days.unwrap_or(7))
        .map_err(|err| AppError::Message(err.to_string()))
}
