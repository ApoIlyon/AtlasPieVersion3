pub mod profile_repository;

use crate::domain::profile::ProfileId;
use crate::domain::Action;
use crate::models::{AppProfile, Settings};
use crate::storage::profile_repository::{
    legacy_settings_file, read_legacy_settings, ProfileRepository, ProfileStore,
    ProfileStoreLoadError, PROFILES_SCHEMA_VERSION,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};
use time::{macros::format_description, OffsetDateTime};

pub const SETTINGS_FILE_NAME: &str = "AHPSettings.json";
const BACKUP_DIR_NAME: &str = "backups";
const SCHEMA_VERSION: u32 = 1;
const MAX_BACKUPS: usize = 5;
const ACTIONS_FILE_NAME: &str = "actions.json";

fn other_error(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::Other, message.into())
}

pub fn settings_dir<R: Runtime>(app: &AppHandle<R>) -> io::Result<PathBuf> {
    let mut dir = app
        .path()
        .app_config_dir()
        .map_err(|err| other_error(format!("failed to resolve app config dir: {err}")))?;
    dir.push("autohotpie");
    Ok(dir)
}

pub fn ensure_settings_dir<R: Runtime>(app: &AppHandle<R>) -> io::Result<PathBuf> {
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
    cache_path: PathBuf,
    actions_path: PathBuf,
    profiles_repo: ProfileRepository,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    schema_version: u32,
    settings: Settings,
}

impl StorageManager {
    pub fn new<R: Runtime>(app: AppHandle<R>) -> io::Result<Self> {
        let base_dir = ensure_settings_dir(&app)?;
        let settings_path = base_dir.join(SETTINGS_FILE_NAME);
        let backups_path = base_dir.join(BACKUP_DIR_NAME);
        if !backups_path.exists() {
            fs::create_dir_all(&backups_path)?;
        }
        let cache_path = base_dir.join("settings.cache.json");
        let actions_path = base_dir.join(ACTIONS_FILE_NAME);
        let profiles_repo = ProfileRepository::new(&base_dir, &backups_path);
        Ok(Self {
            base_dir,
            settings_path,
            backups_path,
            cache_path,
            actions_path,
            profiles_repo,
        })
    }

    pub fn load(&self) -> io::Result<Settings> {
        if self.settings_path.exists() {
            match fs::read_to_string(&self.settings_path) {
                Ok(data) => {
                    let mut settings = self.parse_settings(&data)?;
                    ensure_default_profile(&mut settings);
                    let _ = self.save_cache(&settings);
                    return Ok(settings);
                }
                Err(err) => {
                    eprintln!("failed to read settings file: {err}");
                }
            }
        }

        if let Ok(mut cached) = self.load_cache() {
            ensure_default_profile(&mut cached);
            return Ok(cached);
        }

        let mut settings = Settings::default();
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
        self.save_cache(settings)?;
        Ok(())
    }

    pub fn base_dir(&self) -> &Path {
        &self.base_dir
    }

    #[allow(dead_code)]
    pub fn profiles_repo(&self) -> &ProfileRepository {
        &self.profiles_repo
    }

    pub fn profiles_backups_dir(&self) -> io::Result<PathBuf> {
        self.ensure_dirs()?;
        let dir = self.profiles_repo.backups_dir().to_path_buf();
        if !dir.exists() {
            fs::create_dir_all(&dir)?;
        }
        Ok(dir)
    }

    pub fn load_actions(&self) -> io::Result<Vec<Action>> {
        if !self.actions_path.exists() {
            return Ok(Vec::new());
        }

        let data = fs::read_to_string(&self.actions_path)?;
        let actions = serde_json::from_str::<Vec<Action>>(&data)
            .map_err(|err| other_error(format!("failed to parse actions: {err}")))?;
        Ok(actions)
    }

    pub fn save_actions(&self, actions: &[Action]) -> io::Result<()> {
        self.ensure_dirs()?;
        let payload = serde_json::to_string_pretty(actions)
            .map_err(|err| other_error(format!("failed to serialize actions: {err}")))?;
        fs::write(&self.actions_path, payload)?;
        Ok(())
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
            .format(&format_description!(
                "[year][month][day]-[hour][minute][second]"
            ))
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

    fn parse_settings(&self, data: &str) -> io::Result<Settings> {
        match serde_json::from_str::<StoredSettings>(data) {
            Ok(wrapper) => Ok(wrapper.settings),
            Err(_) => serde_json::from_str::<Settings>(data)
                .map_err(|err| other_error(format!("failed to parse settings: {err}"))),
        }
    }

    fn load_cache(&self) -> io::Result<Settings> {
        if !self.cache_path.exists() {
            return Err(other_error("settings cache not available"));
        }
        let data = fs::read_to_string(&self.cache_path)?;
        self.parse_settings(&data)
    }

    fn save_cache(&self, settings: &Settings) -> io::Result<()> {
        self.ensure_dirs()?;
        let payload = StoredSettings {
            schema_version: SCHEMA_VERSION,
            settings: settings.clone(),
        };
        let serialized = serde_json::to_string_pretty(&payload)
            .map_err(|err| other_error(format!("failed to serialize cache: {err}")))?;
        fs::write(&self.cache_path, serialized)?;
        Ok(())
    }

    pub fn load_profiles_or_migrate(
        &self,
        settings: &Settings,
    ) -> Result<ProfileStore, ProfileStoreLoadError> {
        let store = match self.profiles_repo.load() {
            Ok(store) if !store.profiles.is_empty() => store,
            Ok(_) => {
                let legacy_file = legacy_settings_file(&self.base_dir);
                let legacy_profiles = read_legacy_settings(&legacy_file)
                    .map_err(|err| ProfileStoreLoadError::Io {
                        file_path: legacy_file.clone(),
                        source: err,
                    })?
                    .unwrap_or_else(|| settings.app_profiles.clone());
                if legacy_profiles.is_empty() {
                    ProfileStore::default()
                } else if let Some(store) = self
                    .profiles_repo
                    .migrate_from_legacy(&legacy_profiles)
                    .map_err(|err| ProfileStoreLoadError::Io {
                        file_path: self.profiles_repo.file_path().to_path_buf(),
                        source: err,
                    })?
                {
                    store
                } else {
                    ProfileStore::default()
                }
            }
            Err(err) => return Err(err),
        };

        self.normalize_profile_store(store)
            .map_err(|err| ProfileStoreLoadError::Io {
                file_path: self.profiles_repo.file_path().to_path_buf(),
                source: err,
            })
    }

    pub fn save_profiles(&self, store: &ProfileStore) -> io::Result<()> {
        self.profiles_repo.save(store)
    }

    fn normalize_profile_store(&self, mut store: ProfileStore) -> io::Result<ProfileStore> {
        let mut changed = false;

        if store.schema_version != PROFILES_SCHEMA_VERSION {
            store.schema_version = PROFILES_SCHEMA_VERSION;
            changed = true;
        }

        store.profiles.retain(|record| {
            let has_root = record
                .menus
                .iter()
                .any(|menu| menu.id == record.profile.root_menu);
            if !has_root {
                changed = true;
            }
            has_root
        });

        for record in &mut store.profiles {
            if let Some(pos) = record
                .menus
                .iter()
                .position(|menu| menu.id == record.profile.root_menu)
            {
                if pos != 0 {
                    let root_menu = record.menus.remove(pos);
                    record.menus.insert(0, root_menu);
                    changed = true;
                }
            }
        }

        let valid_ids: HashSet<ProfileId> = store
            .profiles
            .iter()
            .map(|record| record.profile.id)
            .collect();

        if let Some(active) = store.active_profile_id {
            if !valid_ids.contains(&active) {
                store.active_profile_id = store.profiles.first().map(|record| record.profile.id);
                changed = true;
            }
        } else if let Some(first) = store.profiles.first() {
            store.active_profile_id = Some(first.profile.id);
            changed = true;
        }

        if store.profiles.is_empty() && store.active_profile_id.is_some() {
            store.active_profile_id = None;
            changed = true;
        }

        if changed {
            self.save_profiles(&store)?;
        }

        Ok(store)
    }
}
