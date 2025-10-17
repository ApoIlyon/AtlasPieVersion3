use crate::models::{AppProfile, Settings};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use time::{macros::format_description, OffsetDateTime};

pub const SETTINGS_FILE_NAME: &str = "AHPSettings.json";
const BACKUP_DIR_NAME: &str = "backups";
const SCHEMA_VERSION: u32 = 1;
const MAX_BACKUPS: usize = 5;

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

fn ensure_default_profile(settings: &mut Settings) {
    if settings.app_profiles.is_empty() {
        settings
            .app_profiles
            .push(AppProfile::default_default_profile());
    }
}

#[derive(Clone)]
pub struct StorageManager {
    base_dir: PathBuf,
    settings_path: PathBuf,
    backups_path: PathBuf,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    schema_version: u32,
    settings: Settings,
}

impl StorageManager {
    pub fn new(app: AppHandle) -> io::Result<Self> {
        let base_dir = ensure_settings_dir(&app)?;
        let settings_path = base_dir.join(SETTINGS_FILE_NAME);
        let backups_path = base_dir.join(BACKUP_DIR_NAME);
        if !backups_path.exists() {
            fs::create_dir_all(&backups_path)?;
        }
        Ok(Self {
            base_dir,
            settings_path,
            backups_path,
        })
    }

    pub fn load(&self) -> io::Result<Settings> {
        if !self.settings_path.exists() {
            let mut settings = Settings::default();
            ensure_default_profile(&mut settings);
            return Ok(settings);
        }
        let data = fs::read_to_string(&self.settings_path)?;
        let mut settings = match serde_json::from_str::<StoredSettings>(&data) {
            Ok(wrapper) => wrapper.settings,
            Err(_) => serde_json::from_str::<Settings>(&data)
                .map_err(|err| other_error(format!("failed to parse settings: {err}")))?,
        };
        ensure_default_profile(&mut settings);
        Ok(settings)
    }

    pub fn save_with_backup(&self, settings: &Settings) -> io::Result<()> {
        self.ensure_dirs()?;
        if self.settings_path.exists() {
            self.create_backup()?;
            self.prune_backups()?;
        }

        let payload = StoredSettings {
            schema_version: SCHEMA_VERSION,
            settings: settings.clone(),
        };
        let serialized = serde_json::to_string_pretty(&payload)
            .map_err(|err| other_error(format!("failed to serialize settings: {err}")))?;
        fs::write(&self.settings_path, serialized)?;
        Ok(())
    }

    pub fn base_dir(&self) -> &Path {
        &self.base_dir
    }

    fn ensure_dirs(&self) -> io::Result<()> {
        if !self.base_dir.exists() {
            fs::create_dir_all(&self.base_dir)?;
        }
        if !self.backups_path.exists() {
            fs::create_dir_all(&self.backups_path)?;
        }
        Ok(())
    }

    fn create_backup(&self) -> io::Result<()> {
        if !self.settings_path.exists() {
            return Ok(());
        }
        let timestamp = OffsetDateTime::now_utc()
            .format(&format_description!("[year][month][day]-[hour][minute][second]"))
            .map_err(|err| other_error(format!("failed to format backup timestamp: {err}")))?;
        let backup_name = format!("AHPSettings-{timestamp}.json");
        let backup_path = self.backups_path.join(backup_name);
        fs::copy(&self.settings_path, backup_path)?;
        Ok(())
    }

    fn prune_backups(&self) -> io::Result<()> {
        let mut backups: Vec<_> = fs::read_dir(&self.backups_path)?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
            .collect();

        if backups.len() <= MAX_BACKUPS {
            return Ok(());
        }

        backups.sort_by_key(|entry| entry.metadata().and_then(|m| m.modified()).ok());
        while backups.len() > MAX_BACKUPS {
            if let Some(entry) = backups.first() {
                fs::remove_file(entry.path())?;
            }
            backups.remove(0);
        }
        Ok(())
    }
}
