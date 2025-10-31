use super::{AppError, AppState, Result};
use crate::commands::profiles::emit_profiles_changed;
use crate::services::import_export::ImportExportService;
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPayload {
    pub data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    #[serde(default)]
    pub profile_ids: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResponse {
    pub data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveExportPayload {
    pub filename: String,
    pub contents: String,
}

fn lock_settings<'a>(
    state: &'a State<'_, AppState>,
) -> Result<std::sync::MutexGuard<'a, crate::models::Settings>> {
    state.settings.lock().map_err(|_| AppError::StatePoisoned)
}

#[tauri::command]
pub fn export_profiles(
    state: State<'_, AppState>,
    request: Option<ExportRequest>,
) -> Result<ExportResponse> {
    let profiles = state.profiles_snapshot()?;
    let settings = lock_settings(&state)?;
    let service = ImportExportService::new(state.storage(), state.audit());

    let requested_ids = request.and_then(|value| value.profile_ids);
    let parsed_ids = match requested_ids {
        Some(ref ids) if !ids.is_empty() => Some(ImportExportService::parse_profile_ids(ids)?),
        _ => None,
    };

    let bundle = service.build_export_bundle(
        &profiles,
        &settings,
        parsed_ids.as_ref().map(|ids| ids.as_slice()),
    )?;
    let encoded = service.encode_bundle(&bundle)?;

    Ok(ExportResponse { data: encoded })
}

#[tauri::command]
pub fn import_profiles<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    payload: ImportPayload,
) -> Result<crate::services::import_export::ImportResult> {
    let service = ImportExportService::new(state.storage(), state.audit());
    let bundle = service.decode_bundle(&payload.data)?;
    let (store, settings, result) = service.process_import_bundle(bundle)?;

    state.with_profiles_mut(|current| {
        *current = store.clone();
        Ok(())
    })?;

    state.storage.save_with_backup(&settings)?;
    {
        let mut guard = lock_settings(&state)?;
        *guard = settings;
    }

    emit_profiles_changed(&app, &state)?;

    Ok(result)
}

#[tauri::command]
pub async fn save_export_bundle<R: Runtime>(
    app: AppHandle<R>,
    payload: SaveExportPayload,
) -> Result<Option<String>> {
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(&payload.filename)
        .add_filter("JSON", &["json"]);

    if let Ok(downloads) = app.path().download_dir() {
        dialog = dialog.set_directory(downloads);
    }

    let Some(path) = dialog.blocking_save_file() else {
        return Ok(None);
    };

    let path_buf = file_path_to_pathbuf(path)?;

    fs::write(&path_buf, payload.contents)
        .map_err(|err| AppError::Message(format!("failed to save export bundle: {err}")))?;

    Ok(Some(path_buf.to_string_lossy().to_string()))
}

fn file_path_to_pathbuf(path: FilePath) -> Result<std::path::PathBuf> {
    path.into_path()
        .map_err(|err| AppError::Message(format!("failed to resolve save path: {err}")))
}
