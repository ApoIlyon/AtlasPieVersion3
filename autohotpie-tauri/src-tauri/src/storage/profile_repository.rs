use crate::domain::pie_menu::{PieMenu, PieMenuId, PieSlice, PieSliceId};
use crate::domain::profile::{ActivationMatchMode, ActivationRule, Profile, ProfileId};
use crate::domain::{ActionDefinition, MacroStepKind};
use crate::models::AppProfile;
use crate::storage::SETTINGS_FILE_NAME;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use thiserror::Error;
use time::OffsetDateTime;

pub const PROFILES_FILE_NAME: &str = "profiles.v1.json";
const PROFILES_BACKUP_DIR: &str = "profiles";
pub const PROFILES_SCHEMA_VERSION: u32 = 1;

fn other_error(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::Other, message.into())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileRecoveryInfo {
    pub message: String,
    pub file_path: String,
    pub backups_dir: String,
}

impl ProfileRecoveryInfo {
    pub fn new(message: impl Into<String>, file_path: &Path, backups_dir: &Path) -> Self {
        Self {
            message: message.into(),
            file_path: file_path.display().to_string(),
            backups_dir: backups_dir.display().to_string(),
        }
    }
}

#[derive(Debug, Error)]
pub enum ProfileStoreLoadError {
    #[error("failed to read profiles store at {file_path}: {source}")]
    Io {
        file_path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("profiles store at {file_path} is corrupted: {message}")]
    Corrupted {
        file_path: PathBuf,
        message: String,
        backups_dir: PathBuf,
    },
}

impl ProfileStoreLoadError {
    pub fn to_recovery(&self) -> Option<ProfileRecoveryInfo> {
        match self {
            ProfileStoreLoadError::Corrupted {
                file_path,
                message,
                backups_dir,
            } => Some(ProfileRecoveryInfo::new(message, file_path, backups_dir)),
            _ => None,
        }
    }

    fn io(path: PathBuf, source: io::Error) -> Self {
        Self::Io {
            file_path: path,
            source,
        }
    }

    fn corrupted(path: PathBuf, message: impl Into<String>, backups_dir: PathBuf) -> Self {
        Self::Corrupted {
            file_path: path,
            message: message.into(),
            backups_dir,
        }
    }
}

fn normalize_profile_store(store: &mut ProfileStore) {
    store.schema_version = PROFILES_SCHEMA_VERSION;
    store.profiles.iter_mut().for_each(|record| {
        record.menus.iter_mut().for_each(|menu| {
            menu.slices.iter_mut().for_each(|slice| {
                slice.icon = slice.icon.as_ref().and_then(|value| {
                    let trimmed = value.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed.to_string())
                    }
                });
                slice.hotkey = slice.hotkey.as_ref().and_then(|value| {
                    let trimmed = value.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed.to_string())
                    }
                });
            });
            menu.slices.sort_by_key(|slice| slice.order);
        });

        record.actions = record
            .actions
            .iter()
            .cloned()
            .map(normalize_action_definition)
            .collect();
        record.profile.activation_rules = record
            .profile
            .activation_rules
            .iter()
            .cloned()
            .map(normalize_activation_rule)
            .collect();
    });
}

fn normalize_action_definition(mut action: ActionDefinition) -> ActionDefinition {
    action.name = action.name.trim().to_string();
    action.description = action.description.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });
    action.steps = action
        .steps
        .into_iter()
        .enumerate()
        .map(|(index, mut step)| {
            step.order = index as u32;
            step.note = step.note.and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            });
            match &mut step.kind {
                MacroStepKind::Launch {
                    app_path,
                    arguments,
                } => {
                    *app_path = app_path.trim().to_string();
                    *arguments = arguments.as_ref().and_then(|value| {
                        let trimmed = value.trim();
                        if trimmed.is_empty() {
                            None
                        } else {
                            Some(trimmed.to_string())
                        }
                    });
                }
                MacroStepKind::Keys { keys, repeat } => {
                    *keys = keys.trim().to_string();
                    if *repeat == 0 {
                        *repeat = 1;
                    }
                }
                MacroStepKind::Delay { duration_ms } => {
                    if *duration_ms == 0 {
                        *duration_ms = 10;
                    }
                }
                MacroStepKind::Script { language, script } => {
                    *language = language.trim().to_string();
                    *script = script.trim().to_string();
                }
            }
            step
        })
        .collect();
    action
}

fn normalize_activation_rule(mut rule: ActivationRule) -> ActivationRule {
    rule.value = rule.value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });
    rule
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProfileRecord {
    pub profile: Profile,
    #[serde(default)]
    pub menus: Vec<PieMenu>,
    #[serde(default)]
    pub actions: Vec<ActionDefinition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStore {
    pub schema_version: u32,
    #[serde(default)]
    pub profiles: Vec<ProfileRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_profile_id: Option<ProfileId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub migrated_from_settings: Option<String>,
}

impl Default for ProfileStore {
    fn default() -> Self {
        Self {
            schema_version: PROFILES_SCHEMA_VERSION,
            profiles: Vec::new(),
            active_profile_id: None,
            migrated_from_settings: None,
        }
    }
}

#[derive(Clone)]
pub struct ProfileRepository {
    file_path: PathBuf,
    backups_path: PathBuf,
}

impl ProfileRepository {
    pub fn new(base_dir: &Path, backups_dir: &Path) -> Self {
        let file_path = base_dir.join(PROFILES_FILE_NAME);
        let backups_path = backups_dir.join(PROFILES_BACKUP_DIR);
        Self {
            file_path,
            backups_path,
        }
    }

    #[allow(dead_code)]
    pub fn file_path(&self) -> &Path {
        &self.file_path
    }

    pub fn backups_dir(&self) -> &Path {
        &self.backups_path
    }

    pub fn load(&self) -> Result<ProfileStore, ProfileStoreLoadError> {
        if !self.file_path.exists() {
            return Ok(ProfileStore::default());
        }
        let data = fs::read_to_string(&self.file_path)
            .map_err(|err| ProfileStoreLoadError::io(self.file_path.clone(), err))?;
        let mut store: ProfileStore = serde_json::from_str(&data).map_err(|err| {
            ProfileStoreLoadError::corrupted(
                self.file_path.clone(),
                format!("{err}"),
                self.backups_path.clone(),
            )
        })?;
        normalize_profile_store(&mut store);
        Ok(store)
    }

    pub fn save(&self, store: &ProfileStore) -> io::Result<()> {
        self.ensure_dirs()?;
        self.create_backup()?;
        let mut normalized = store.clone();
        normalize_profile_store(&mut normalized);
        let payload = serde_json::to_string_pretty(&normalized)
            .map_err(|err| other_error(format!("failed to serialize profiles: {err}")))?;
        fs::write(&self.file_path, payload)?;
        Ok(())
    }

    pub fn migrate_from_legacy(&self, settings: &[AppProfile]) -> io::Result<Option<ProfileStore>> {
        if self.file_path.exists() {
            return Ok(None);
        }

        if settings.is_empty() {
            return Ok(None);
        }

        let migrated_profiles: Vec<ProfileRecord> =
            settings.iter().map(convert_legacy_profile).collect();

        if migrated_profiles.is_empty() {
            return Ok(None);
        }

        let mut store = ProfileStore::default();
        store.profiles = migrated_profiles;
        store.migrated_from_settings = Some(OffsetDateTime::now_utc().to_string());
        store.active_profile_id = store.profiles.first().map(|entry| entry.profile.id);
        normalize_profile_store(&mut store);
        self.save(&store)?;
        Ok(Some(store))
    }

    fn ensure_dirs(&self) -> io::Result<()> {
        if let Some(parent) = self.file_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }
        if !self.backups_path.exists() {
            fs::create_dir_all(&self.backups_path)?;
        }
        Ok(())
    }

    fn create_backup(&self) -> io::Result<()> {
        if !self.file_path.exists() {
            return Ok(());
        }
        let timestamp = OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .map_err(|err| other_error(format!("failed to format backup timestamp: {err}")))?;
        let file_name = format!("{}.{}", timestamp.replace(':', "-"), PROFILES_FILE_NAME);
        let backup_path = self.backups_path.join(file_name);
        fs::copy(&self.file_path, backup_path)?;
        Ok(())
    }
}

fn convert_legacy_profile(source: &AppProfile) -> ProfileRecord {
    let profile = Profile {
        id: ProfileId::new(),
        name: if source.name.trim().is_empty() {
            "Untitled Profile".to_string()
        } else {
            source.name.clone()
        },
        description: None,
        enabled: source.enable,
        global_hotkey: extract_global_hotkey(source),
        activation_rules: convert_activation_rules(&source.ahk_handles),
        root_menu: PieMenuId::new(),
    };

    let mut menus = Vec::new();
    let mut root_menu = PieMenu {
        id: profile.root_menu,
        title: profile.name.clone(),
        appearance: Default::default(),
        slices: Vec::new(),
    };

    for (index, key) in source.pie_keys.iter().enumerate() {
        let slice_id = PieSliceId::new();
        let label = if key.name.trim().is_empty() {
            format!("Slice {}", index + 1)
        } else {
            key.name.clone()
        };
        let mut slice = PieSlice {
            id: slice_id,
            label,
            icon: None,
            hotkey: if key.hotkey.trim().is_empty() {
                None
            } else {
                Some(key.hotkey.clone())
            },
            action: None,
            child_menu: None,
            order: index as u32,
        };
        if let Some(nested) = key.pie_menus.first() {
            let nested_menu = convert_pie_key_menu(nested, slice_id);
            slice.child_menu = Some(nested_menu.id);
            menus.push(nested_menu);
        }
        root_menu.slices.push(slice);
    }

    menus.insert(0, root_menu);

    let now = OffsetDateTime::now_utc().to_string();
    ProfileRecord {
        profile,
        menus,
        actions: Vec::new(),
        created_at: Some(now.clone()),
        updated_at: Some(now),
    }
}

fn extract_global_hotkey(source: &AppProfile) -> Option<String> {
    source.pie_keys.iter().find_map(|key| {
        let accelerator = key.hotkey.trim();
        if accelerator.is_empty() {
            None
        } else {
            Some(accelerator.to_string())
        }
    })
}

fn convert_activation_rules(handles: &[String]) -> Vec<ActivationRule> {
    if handles.is_empty() {
        return vec![ActivationRule {
            mode: ActivationMatchMode::Always,
            value: None,
            negate: None,
        }];
    }

    handles
        .iter()
        .map(|raw| parse_activation_rule(raw))
        .collect()
}

fn parse_activation_rule(raw: &str) -> ActivationRule {
    let trimmed = raw.trim();
    if trimmed.eq_ignore_ascii_case("fallback") || trimmed == "*" {
        return ActivationRule {
            mode: ActivationMatchMode::Always,
            value: None,
            negate: None,
        };
    }

    if let Some(rest) = trimmed.strip_prefix("process:") {
        return ActivationRule {
            mode: ActivationMatchMode::ProcessName,
            value: Some(rest.trim().to_string()),
            negate: None,
        };
    }

    if let Some(rest) = trimmed.strip_prefix("window:") {
        return ActivationRule {
            mode: ActivationMatchMode::WindowTitle,
            value: Some(rest.trim().to_string()),
            negate: None,
        };
    }

    ActivationRule {
        mode: ActivationMatchMode::Custom,
        value: Some(trimmed.to_string()),
        negate: None,
    }
}

fn convert_pie_key_menu(menu: &crate::models::PieMenu, parent_slice_id: PieSliceId) -> PieMenu {
    let new_menu_id = PieMenuId::new();
    let mut pie_menu = PieMenu {
        id: new_menu_id,
        title: format!("Nested Menu {}", parent_slice_id),
        appearance: Default::default(),
        slices: Vec::new(),
    };

    for (index, function) in menu.functions.iter().enumerate() {
        pie_menu.slices.push(PieSlice {
            id: PieSliceId::new(),
            label: function.label.clone(),
            icon: if function.icon.file_path.trim().is_empty() {
                None
            } else {
                Some(function.icon.file_path.clone())
            },
            hotkey: if function.hotkey.trim().is_empty() {
                None
            } else {
                Some(function.hotkey.clone())
            },
            action: None,
            child_menu: None,
            order: index as u32,
        });
    }

    pie_menu
}

pub fn read_legacy_settings(path: &Path) -> io::Result<Option<Vec<AppProfile>>> {
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(path)?;
    #[derive(Deserialize)]
    struct LegacyWrapper {
        #[serde(default)]
        settings: Option<LegacySettings>,
    }
    #[derive(Deserialize)]
    struct LegacySettings {
        #[serde(default)]
        app_profiles: Vec<AppProfile>,
    }

    match serde_json::from_str::<LegacyWrapper>(&data) {
        Ok(wrapper) => Ok(wrapper.settings.map(|settings| settings.app_profiles)),
        Err(_) => {
            // Fallback parsers for raw Settings payloads.
            #[derive(Deserialize)]
            struct RawSettings {
                #[serde(default)]
                app_profiles: Vec<AppProfile>,
            }
            let parsed = serde_json::from_str::<RawSettings>(&data)
                .map(|value| value.app_profiles)
                .ok();
            Ok(parsed)
        }
    }
}

pub fn legacy_settings_file(base_dir: &Path) -> PathBuf {
    base_dir.join(SETTINGS_FILE_NAME)
}

#[cfg(test)]
mod tests;
