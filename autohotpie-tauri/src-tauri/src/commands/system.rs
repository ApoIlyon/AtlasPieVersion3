use super::{AppError, Result};
use std::process::Command;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn run_pie_menu(app: AppHandle, use_ahk: bool) -> Result<()> {
    let resource_name = if use_ahk { "PieMenu.ahk" } else { "PieMenu.exe" };
    let path = app
        .path()
        .resource_dir()
        .map_err(|err| AppError::Message(format!("resource directory not available: {err}")))?
        .join(resource_name);
    if !path.exists() {
        return Err(AppError::Message(format!("resource '{resource_name}' not found")));
    }
    Command::new(&path)
        .spawn()
        .map_err(|err| AppError::Message(format!("failed to launch {resource_name}: {err}")))?;
    Ok(())
}
