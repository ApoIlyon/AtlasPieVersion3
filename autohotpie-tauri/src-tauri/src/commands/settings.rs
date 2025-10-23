use super::{current_version, AppError, AppState, Result};
use crate::models::{AppProfile, Settings};
use tauri::{AppHandle, State, Runtime};

fn lock_settings<'a>(
    state: &'a State<'_, AppState>,
) -> Result<std::sync::MutexGuard<'a, Settings>> {
    state.settings.lock().map_err(|_| AppError::StatePoisoned)
}

#[tauri::command]
pub fn load_settings(state: State<'_, AppState>) -> Result<Settings> {
    let guard = lock_settings(&state)?;
    Ok(guard.clone())
}

#[tauri::command]
pub fn save_settings<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    mut settings: Settings,
) -> Result<Settings> {
    let version = current_version(&app);
    settings.set_app_version(&version);
    state.storage.save_with_backup(&settings)?;

    {
        let mut guard = lock_settings(&state)?;
        *guard = settings.clone();
    }

    state.audit.log("INFO", "Settings saved")?;
    Ok(settings)
}

#[tauri::command]
pub fn add_profile(state: State<'_, AppState>, profile: AppProfile) -> Result<Settings> {
    {
        let mut guard = lock_settings(&state)?;
        guard.app_profiles.push(profile);
        state.storage.save_with_backup(&guard.clone())?;
    }

    state.audit.log("INFO", "Profile added")?;
    load_settings(state)
}

#[tauri::command]
pub fn reset_settings<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>) -> Result<Settings> {
    let version = current_version(&app);
    let mut settings = Settings::default();
    settings.set_app_version(&version);
    state.storage.save_with_backup(&settings)?;

    {
        let mut guard = lock_settings(&state)?;
        *guard = settings.clone();
    }

    state.audit.log("WARN", "Settings reset to default")?;
    Ok(settings)
}
