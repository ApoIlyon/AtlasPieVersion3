use crate::models::{AppProfile, Settings};
use std::fs;
use std::io;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const SETTINGS_FILE_NAME: &str = "AHPSettings.json";

fn other_error(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::Other, message.into())
}

pub fn settings_dir(app: &AppHandle) -> io::Result<PathBuf> {
    let mut dir = app
        .path()
        .app_config_dir()
        .map_err(|err| other_error(format!("failed to resolve app config dir: {err}")))?;
    dir.push("autohotpie");
    Ok(dir)
}

pub fn ensure_settings_dir(app: &AppHandle) -> io::Result<PathBuf> {
    let dir = settings_dir(app)?;
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

pub fn settings_path(app: &AppHandle) -> io::Result<PathBuf> {
    let mut dir = ensure_settings_dir(app)?;
    dir.push(SETTINGS_FILE_NAME);
    Ok(dir)
}

pub fn load_settings(path: &PathBuf) -> io::Result<Settings> {
    if !path.exists() {
        return Ok(Settings::default());
    }
    let data = fs::read_to_string(path)?;
    let mut settings: Settings = serde_json::from_str(&data)
        .map_err(|err| other_error(format!("failed to parse settings: {err}")))?;
    if settings.app_profiles.is_empty() {
        settings
            .app_profiles
            .push(AppProfile::default_default_profile());
    }
    Ok(settings)
}

pub fn save_settings(path: &PathBuf, settings: &Settings) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    let serialized = serde_json::to_string_pretty(settings)
        .map_err(|err| other_error(format!("failed to serialize settings: {err}")))?;
    fs::write(path, serialized)?;
    Ok(())
}
