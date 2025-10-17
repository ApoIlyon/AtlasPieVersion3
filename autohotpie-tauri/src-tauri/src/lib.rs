mod models;
mod storage;

use models::{AppProfile, Settings};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use storage::{load_settings, save_settings};
use tauri::{AppHandle, Manager, State};

struct AppState {
    settings: Mutex<Settings>,
    settings_path: PathBuf,
}

fn current_version(app: &AppHandle) -> &str {
    app.config().version.as_deref().unwrap_or("0.0.0")
}

#[tauri::command]
fn load_settings_cmd(state: State<'_, AppState>) -> Result<Settings, String> {
    let guard = state
        .settings
        .lock()
        .map_err(|_| "failed to lock settings state".to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn save_settings_cmd(app: AppHandle, state: State<AppState>, mut settings: Settings) -> Result<Settings, String> {
    let version = current_version(&app).to_string();
    settings.set_app_version(&version);
    save_settings(&state.settings_path, &settings).map_err(|err| err.to_string())?;
    let mut guard = state
        .settings
        .lock()
        .map_err(|_| "failed to lock settings state".to_string())?;
    *guard = settings.clone();
    Ok(settings)
}

#[tauri::command]
fn add_profile_cmd(state: State<AppState>, profile: AppProfile) -> Result<Settings, String> {
    let mut guard = state
        .settings
        .lock()
        .map_err(|_| "failed to lock settings state".to_string())?;
    guard.app_profiles.push(profile);
    save_settings(&state.settings_path, &guard).map_err(|err| err.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn reset_settings_cmd(app: AppHandle, state: State<AppState>) -> Result<Settings, String> {
    let mut settings = Settings::default();
    let version = current_version(&app).to_string();
    settings.set_app_version(&version);
    save_settings(&state.settings_path, &settings).map_err(|err| err.to_string())?;
    let mut guard = state
        .settings
        .lock()
        .map_err(|_| "failed to lock settings state".to_string())?;
    *guard = settings.clone();
    Ok(settings)
}

#[tauri::command]
fn run_pie_menu_cmd(app: AppHandle, use_ahk: bool) -> Result<(), String> {
    let resource_name = if use_ahk { "PieMenu.ahk" } else { "PieMenu.exe" };
    let path = app
        .path()
        .resource_dir()
        .map_err(|err| format!("resource directory not available: {err}"))?
        .join(resource_name);
    if !path.exists() {
        return Err(format!("resource '{resource_name}' not found"));
    }
    Command::new(path)
        .spawn()
        .map_err(|err| format!("failed to launch {resource_name}: {err}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle();
            let settings_path = storage::settings_path(&app_handle)?;
            let mut settings = load_settings(&settings_path)?;
            let version = current_version(&app_handle).to_string();
            if settings.set_app_version(&version) {
                save_settings(&settings_path, &settings)?;
            }
            app.manage(AppState {
                settings: Mutex::new(settings),
                settings_path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_settings_cmd,
            save_settings_cmd,
            add_profile_cmd,
            reset_settings_cmd,
            run_pie_menu_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
