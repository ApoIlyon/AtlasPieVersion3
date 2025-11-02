use crate::domain::custom_command::CustomCommand;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandLibrary {
    pub version: u32,
    pub commands: HashMap<String, CustomCommand>,
}

impl CommandLibrary {
    pub fn new() -> Self {
        Self {
            version: 1,
            commands: HashMap::new(),
        }
    }

    pub fn add_command(&mut self, command: CustomCommand) {
        self.commands.insert(command.id.clone(), command);
    }

    pub fn remove_command(&mut self, id: &str) -> Option<CustomCommand> {
        self.commands.remove(id)
    }

    pub fn get_command(&self, id: &str) -> Option<&CustomCommand> {
        self.commands.get(id)
    }

    pub fn get_command_mut(&mut self, id: &str) -> Option<&mut CustomCommand> {
        self.commands.get_mut(id)
    }

    pub fn list_commands(&self) -> Vec<&CustomCommand> {
        self.commands.values().collect()
    }

    pub fn search_by_tag(&self, tag: &str) -> Vec<&CustomCommand> {
        self.commands
            .values()
            .filter(|cmd| cmd.tags.iter().any(|t| t.eq_ignore_ascii_case(tag)))
            .collect()
    }

    pub fn search_by_name(&self, query: &str) -> Vec<&CustomCommand> {
        let query_lower = query.to_lowercase();
        self.commands
            .values()
            .filter(|cmd| cmd.name.to_lowercase().contains(&query_lower))
            .collect()
    }
}

impl Default for CommandLibrary {
    fn default() -> Self {
        Self::new()
    }
}

pub struct CommandRepository {
    data_dir: PathBuf,
}

impl CommandRepository {
    pub fn new(data_dir: PathBuf) -> Self {
        Self { data_dir }
    }

    fn commands_file_path(&self) -> PathBuf {
        self.data_dir.join("commands.json")
    }

    fn backup_file_path(&self, index: usize) -> PathBuf {
        self.data_dir
            .join(format!("commands.backup.{}.json", index))
    }

    pub fn load(&self) -> Result<CommandLibrary> {
        let path = self.commands_file_path();

        if !path.exists() {
            return Ok(CommandLibrary::new());
        }

        let content = fs::read_to_string(&path)
            .with_context(|| format!("Failed to read commands file: {}", path.display()))?;

        let library: CommandLibrary = serde_json::from_str(&content)
            .with_context(|| "Failed to parse commands JSON")?;

        Ok(library)
    }

    pub fn save(&self, library: &CommandLibrary) -> Result<()> {
        // Create backup before saving
        if self.commands_file_path().exists() {
            self.rotate_backups()?;
        }

        // Ensure data directory exists
        fs::create_dir_all(&self.data_dir)
            .with_context(|| format!("Failed to create data directory: {}", self.data_dir.display()))?;

        // Serialize and save
        let json = serde_json::to_string_pretty(library)
            .with_context(|| "Failed to serialize commands")?;

        let path = self.commands_file_path();
        fs::write(&path, json)
            .with_context(|| format!("Failed to write commands file: {}", path.display()))?;

        Ok(())
    }

    fn rotate_backups(&self) -> Result<()> {
        const MAX_BACKUPS: usize = 5;

        // Remove oldest backup if exists
        let oldest = self.backup_file_path(MAX_BACKUPS - 1);
        if oldest.exists() {
            fs::remove_file(&oldest).ok();
        }

        // Rotate existing backups
        for i in (1..MAX_BACKUPS - 1).rev() {
            let from = self.backup_file_path(i - 1);
            let to = self.backup_file_path(i);
            if from.exists() {
                fs::rename(&from, &to).ok();
            }
        }

        // Create new backup from current file
        let current = self.commands_file_path();
        let backup = self.backup_file_path(0);
        if current.exists() {
            fs::copy(&current, &backup)
                .with_context(|| "Failed to create backup")?;
        }

        Ok(())
    }

    pub fn list_backups(&self) -> Result<Vec<PathBuf>> {
        let mut backups = Vec::new();
        for i in 0..5 {
            let path = self.backup_file_path(i);
            if path.exists() {
                backups.push(path);
            }
        }
        Ok(backups)
    }

    pub fn restore_from_backup(&self, backup_index: usize) -> Result<CommandLibrary> {
        let backup_path = self.backup_file_path(backup_index);
        
        if !backup_path.exists() {
            anyhow::bail!("Backup {} does not exist", backup_index);
        }

        let content = fs::read_to_string(&backup_path)
            .with_context(|| format!("Failed to read backup: {}", backup_path.display()))?;

        let library: CommandLibrary = serde_json::from_str(&content)
            .with_context(|| "Failed to parse backup JSON")?;

        Ok(library)
    }

    pub fn export_commands(&self, export_path: &PathBuf, command_ids: &[String]) -> Result<()> {
        let library = self.load()?;
        
        let mut export_library = CommandLibrary::new();
        for id in command_ids {
            if let Some(cmd) = library.get_command(id) {
                export_library.add_command(cmd.clone());
            }
        }

        let json = serde_json::to_string_pretty(&export_library)
            .with_context(|| "Failed to serialize export")?;

        fs::write(export_path, json)
            .with_context(|| format!("Failed to write export file: {}", export_path.display()))?;

        Ok(())
    }

    pub fn import_commands(&self, import_path: &PathBuf, merge: bool) -> Result<Vec<String>> {
        let content = fs::read_to_string(import_path)
            .with_context(|| format!("Failed to read import file: {}", import_path.display()))?;

        let import_library: CommandLibrary = serde_json::from_str(&content)
            .with_context(|| "Failed to parse import JSON")?;

        let mut current_library = if merge {
            self.load()?
        } else {
            CommandLibrary::new()
        };

        let mut imported_ids = Vec::new();
        for (id, command) in import_library.commands {
            current_library.add_command(command);
            imported_ids.push(id);
        }

        self.save(&current_library)?;

        Ok(imported_ids)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::custom_command::{CommandType, CustomCommand};
    use tempfile::TempDir;

    #[test]
    fn test_command_library_operations() {
        let mut lib = CommandLibrary::new();
        let cmd = CustomCommand::new("Test".to_string(), CommandType::KeyboardMacro);
        let id = cmd.id.clone();

        lib.add_command(cmd);
        assert_eq!(lib.commands.len(), 1);
        assert!(lib.get_command(&id).is_some());

        lib.remove_command(&id);
        assert_eq!(lib.commands.len(), 0);
    }

    #[test]
    fn test_save_and_load() {
        let temp_dir = TempDir::new().unwrap();
        let repo = CommandRepository::new(temp_dir.path().to_path_buf());

        let mut lib = CommandLibrary::new();
        let cmd = CustomCommand::new("Test Command".to_string(), CommandType::KeyboardMacro);
        lib.add_command(cmd);

        repo.save(&lib).unwrap();
        let loaded = repo.load().unwrap();

        assert_eq!(loaded.commands.len(), 1);
    }

    #[test]
    fn test_backup_rotation() {
        let temp_dir = TempDir::new().unwrap();
        let repo = CommandRepository::new(temp_dir.path().to_path_buf());

        let lib = CommandLibrary::new();
        
        // Save multiple times to create backups
        for i in 0..7 {
            let mut test_lib = lib.clone();
            let cmd = CustomCommand::new(format!("Command {}", i), CommandType::KeyboardMacro);
            test_lib.add_command(cmd);
            repo.save(&test_lib).unwrap();
        }

        let backups = repo.list_backups().unwrap();
        assert!(backups.len() <= 5);
    }
}
