use crate::domain::pie_menu::{PieMenu, PieMenuId, PieSlice, PieSliceId};
use crate::domain::profile::{ActivationMatchMode, ActivationRule, Profile, ProfileId};
use crate::models::AppProfile;
use crate::storage::SETTINGS_FILE_NAME;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use time::OffsetDateTime;

pub const PROFILES_FILE_NAME: &str = "profiles.v1.json";
const PROFILES_BACKUP_DIR: &str = "profiles";
pub const PROFILES_SCHEMA_VERSION: u32 = 1;

fn other_error(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::Other, message.into())
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProfileRecord {
    pub profile: Profile,
    #[serde(default)]
    pub menus: Vec<PieMenu>,
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

    pub fn file_path(&self) -> &Path {
        &self.file_path
    }

    pub fn load(&self) -> io::Result<ProfileStore> {
        if !self.file_path.exists() {
            return Ok(ProfileStore::default());
        }
        let data = fs::read_to_string(&self.file_path)?;
        let store: ProfileStore = serde_json::from_str(&data)
            .map_err(|err| other_error(format!("failed to parse {}: {err}", PROFILES_FILE_NAME)))?;
        Ok(store)
    }

    pub fn save(&self, store: &ProfileStore) -> io::Result<()> {
        self.ensure_dirs()?;
        self.create_backup()?;
        let payload = serde_json::to_string_pretty(store)
            .map_err(|err| other_error(format!("failed to serialize profiles: {err}")))?;
        fs::write(&self.file_path, payload)?;
        Ok(())
    }

    pub fn migrate_from_legacy(
        &self,
        settings: &[AppProfile],
    ) -> io::Result<Option<ProfileStore>> {
        if self.file_path.exists() {
            return Ok(None);
        }

        if settings.is_empty() {
            return Ok(None);
        }

        let migrated_profiles: Vec<ProfileRecord> = settings
            .iter()
            .map(convert_legacy_profile)
            .collect();

        if migrated_profiles.is_empty() {
            return Ok(None);
        }

        let mut store = ProfileStore::default();
        store.profiles = migrated_profiles;
        store.migrated_from_settings = Some(OffsetDateTime::now_utc().to_string());
        store.active_profile_id = store.profiles.first().map(|entry| entry.profile.id);
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
        let timestamp = OffsetDateTime::now_utc().format(&time::format_description::well_known::Rfc3339)
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
        created_at: Some(now.clone()),
        updated_at: Some(now),
    }
}

fn extract_global_hotkey(source: &AppProfile) -> Option<String> {
    source
        .pie_keys
        .iter()
        .find_map(|key| {
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
        Ok(wrapper) => Ok(wrapper
            .settings
            .map(|settings| settings.app_profiles)),
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
