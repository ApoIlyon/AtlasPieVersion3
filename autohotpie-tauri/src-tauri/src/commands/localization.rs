use crate::commands::{AppError, Result};
use crate::services::localization;

#[tauri::command]
pub fn list_localization_languages() -> Vec<String> {
    localization::available_languages()
}

#[tauri::command]
pub fn get_localization_pack(language: Option<String>) -> Result<localization::LocalizationPack> {
    let code = language.unwrap_or_default();
    localization::get_pack(&code)
        .ok_or_else(|| AppError::Message(format!("language '{code}' not available")))
}

#[tauri::command]
pub fn refresh_localization_packs() -> Result<()> {
    localization::refresh().map_err(|err| AppError::Message(err.to_string()))
}
