use crate::domain::custom_command::CustomCommand;
use crate::services::macro_engine::{ExecutionResult, MacroEngine};
use crate::storage::command_repository::{CommandLibrary, CommandRepository};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

pub struct CommandState {
    pub repository: Arc<Mutex<CommandRepository>>,
    pub engine: Arc<MacroEngine>,
}

impl CommandState {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            repository: Arc::new(Mutex::new(CommandRepository::new(data_dir))),
            engine: Arc::new(MacroEngine::new()),
        }
    }
}

#[tauri::command]
pub async fn create_custom_command(
    command: CustomCommand,
    state: State<'_, CommandState>,
) -> Result<CustomCommand, String> {
    // Validate command
    command.validate().map_err(|e| e.to_string())?;

    let repo = state.repository.lock().await;
    let mut library = repo.load().map_err(|e| e.to_string())?;

    // Check for duplicate names
    if library
        .list_commands()
        .iter()
        .any(|c| c.name == command.name && c.id != command.id)
    {
        return Err("Command with this name already exists".to_string());
    }

    library.add_command(command.clone());
    repo.save(&library).map_err(|e| e.to_string())?;

    Ok(command)
}

#[tauri::command]
pub async fn update_custom_command(
    command: CustomCommand,
    state: State<'_, CommandState>,
) -> Result<CustomCommand, String> {
    // Validate command
    command.validate().map_err(|e| e.to_string())?;

    let repo = state.repository.lock().await;
    let mut library = repo.load().map_err(|e| e.to_string())?;

    // Check if command exists
    if !library.commands.contains_key(&command.id) {
        return Err("Command not found".to_string());
    }

    library.add_command(command.clone());
    repo.save(&library).map_err(|e| e.to_string())?;

    Ok(command)
}

#[tauri::command]
pub async fn delete_custom_command(
    command_id: String,
    state: State<'_, CommandState>,
) -> Result<(), String> {
    let repo = state.repository.lock().await;
    let mut library = repo.load().map_err(|e| e.to_string())?;

    if library.remove_command(&command_id).is_none() {
        return Err("Command not found".to_string());
    }

    repo.save(&library).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_custom_command(
    command_id: String,
    state: State<'_, CommandState>,
) -> Result<Option<CustomCommand>, String> {
    let repo = state.repository.lock().await;
    let library = repo.load().map_err(|e| e.to_string())?;

    Ok(library.get_command(&command_id).cloned())
}

#[tauri::command]
pub async fn list_custom_commands(
    state: State<'_, CommandState>,
) -> Result<Vec<CustomCommand>, String> {
    let repo = state.repository.lock().await;
    let library = repo.load().map_err(|e| e.to_string())?;

    Ok(library.list_commands().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn search_commands_by_tag(
    tag: String,
    state: State<'_, CommandState>,
) -> Result<Vec<CustomCommand>, String> {
    let repo = state.repository.lock().await;
    let library = repo.load().map_err(|e| e.to_string())?;

    Ok(library
        .search_by_tag(&tag)
        .into_iter()
        .cloned()
        .collect())
}

#[tauri::command]
pub async fn search_commands_by_name(
    query: String,
    state: State<'_, CommandState>,
) -> Result<Vec<CustomCommand>, String> {
    let repo = state.repository.lock().await;
    let library = repo.load().map_err(|e| e.to_string())?;

    Ok(library
        .search_by_name(&query)
        .into_iter()
        .cloned()
        .collect())
}

#[tauri::command]
pub async fn execute_custom_command(
    command_id: String,
    state: State<'_, CommandState>,
) -> Result<ExecutionResult, String> {
    let repo = state.repository.lock().await;
    let library = repo.load().map_err(|e| e.to_string())?;

    let command = library
        .get_command(&command_id)
        .ok_or_else(|| "Command not found".to_string())?;

    let result = state
        .engine
        .execute_command(command)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result)
}

#[tauri::command]
pub async fn test_custom_command(
    command: CustomCommand,
    state: State<'_, CommandState>,
) -> Result<ExecutionResult, String> {
    // Validate first
    command.validate().map_err(|e| e.to_string())?;

    // Execute in dry run mode
    let test_engine = MacroEngine::with_dry_run(true);
    let result = test_engine
        .execute_command(&command)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result)
}

#[tauri::command]
pub async fn export_custom_commands(
    command_ids: Vec<String>,
    export_path: String,
    state: State<'_, CommandState>,
) -> Result<(), String> {
    let repo = state.repository.lock().await;
    let path = PathBuf::from(export_path);

    repo.export_commands(&path, &command_ids)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn import_custom_commands(
    import_path: String,
    merge: bool,
    state: State<'_, CommandState>,
) -> Result<Vec<String>, String> {
    let repo = state.repository.lock().await;
    let path = PathBuf::from(import_path);

    let imported_ids = repo
        .import_commands(&path, merge)
        .map_err(|e| e.to_string())?;

    Ok(imported_ids)
}

#[tauri::command]
pub async fn list_command_backups(
    state: State<'_, CommandState>,
) -> Result<Vec<String>, String> {
    let repo = state.repository.lock().await;
    let backups = repo.list_backups().map_err(|e| e.to_string())?;

    Ok(backups
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
pub async fn restore_commands_from_backup(
    backup_index: usize,
    state: State<'_, CommandState>,
) -> Result<(), String> {
    let repo = state.repository.lock().await;
    let restored_library = repo
        .restore_from_backup(backup_index)
        .map_err(|e| e.to_string())?;

    repo.save(&restored_library).map_err(|e| e.to_string())?;

    Ok(())
}
