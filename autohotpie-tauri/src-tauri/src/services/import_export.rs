use crate::commands::AppError;
use crate::domain::profile::ProfileId;
use crate::domain::validation::validate_profile;
use crate::models::Settings;
use crate::services::audit_log::AuditLogger;
use crate::storage::profile_repository::{ProfileRecord, ProfileStore, PROFILES_SCHEMA_VERSION};
use crate::storage::StorageManager;
use base64::{engine::general_purpose, Engine as _};
use pathdiff::diff_paths;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use time::OffsetDateTime;
use uuid::Uuid;

const BUNDLE_SCHEMA_VERSION: u32 = 1;
const ICON_ENCODING: &str = "base64";
const MAX_ICON_FILE_SIZE: usize = 512 * 1024; // 512 KB safety cap

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconFileEntry {
    pub relative_path: String,
    pub encoding: String,
    pub data: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportExportBundle {
    pub schema_version: u32,
    pub exported_at: String,
    pub profiles: ProfileStore,
    pub settings: Settings,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub icons: Vec<IconFileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported_profiles: usize,
    pub skipped_profiles: usize,
    pub warnings: Vec<String>,
}

pub struct ImportExportService<'a> {
    storage: &'a StorageManager,
    audit: &'a AuditLogger,
}

impl<'a> ImportExportService<'a> {
    pub fn new(storage: &'a StorageManager, audit: &'a AuditLogger) -> Self {
        Self { storage, audit }
    }

    pub fn build_export_bundle(
        &self,
        store: &ProfileStore,
        settings: &Settings,
        filter: Option<&[ProfileId]>,
    ) -> Result<ImportExportBundle, AppError> {
        let mut export_store = self.filter_profiles(store, filter);
        self.ensure_active_profile(&mut export_store);
        self.validate_profile_records(&export_store.profiles)?;

        let icons = self.read_icon_files()?;
        let exported_at = OffsetDateTime::now_utc().to_string();
        let mut export_settings = settings.clone();
        // Ensure exported settings do not hold transient data.
        let _ = export_settings.set_app_version("0.0.0");

        Ok(ImportExportBundle {
            schema_version: BUNDLE_SCHEMA_VERSION,
            exported_at,
            profiles: export_store,
            settings: export_settings,
            icons,
        })
    }

    pub fn encode_bundle(&self, bundle: &ImportExportBundle) -> Result<String, AppError> {
        let json = serde_json::to_string_pretty(bundle)
            .map_err(|err| AppError::Message(format!("failed to serialize export bundle: {err}")))?;
        Ok(general_purpose::STANDARD.encode(json.as_bytes()))
    }

    pub fn decode_bundle(&self, encoded: &str) -> Result<ImportExportBundle, AppError> {
        let bytes = general_purpose::STANDARD
            .decode(encoded)
            .map_err(|err| AppError::Message(format!("failed to decode bundle payload: {err}")))?;
        let json = String::from_utf8(bytes)
            .map_err(|err| AppError::Message(format!("bundle payload is not valid UTF-8: {err}")))?;
        let bundle: ImportExportBundle = serde_json::from_str(&json)
            .map_err(|err| AppError::Message(format!("failed to parse bundle JSON: {err}")))?;
        Ok(bundle)
    }

    pub fn process_import_bundle(
        &self,
        mut bundle: ImportExportBundle,
    ) -> Result<(ProfileStore, Settings, ImportResult), AppError> {
        if bundle.schema_version != BUNDLE_SCHEMA_VERSION {
            return Err(AppError::Message(format!(
                "unsupported bundle schema version {}",
                bundle.schema_version
            )));
        }

        self.validate_profile_records(&bundle.profiles.profiles)?;
        let mut normalized_store = bundle.profiles.clone();
        normalized_store.schema_version = PROFILES_SCHEMA_VERSION;
        self.ensure_active_profile(&mut normalized_store);

        let mut warnings = Vec::new();
        warnings.extend(self.write_icon_files(&bundle.icons)?);

        self.audit
            .log(
                "INFO",
                &format!(
                    "Imported bundle with {} profiles and {} icons",
                    normalized_store.profiles.len(),
                    bundle.icons.len()
                ),
            )
            .map_err(AppError::from)?;

        Ok((
            normalized_store,
            bundle.settings.clone(),
            ImportResult {
                imported_profiles: bundle.profiles.profiles.len(),
                skipped_profiles: 0,
                warnings,
            },
        ))
    }

    fn filter_profiles(
        &self,
        store: &ProfileStore,
        filter: Option<&[ProfileId]>,
    ) -> ProfileStore {
        match filter {
            None => store.clone(),
            Some(ids) if ids.is_empty() => store.clone(),
            Some(ids) => {
                let allowed: HashSet<ProfileId> = ids.iter().copied().collect();
                let mut filtered = store.clone();
                filtered
                    .profiles
                    .retain(|record| allowed.contains(&record.profile.id));
                filtered
            }
        }
    }

    fn ensure_active_profile(&self, store: &mut ProfileStore) {
        if store.profiles.is_empty() {
            store.active_profile_id = None;
            return;
        }

        if let Some(active) = store.active_profile_id {
            let exists = store
                .profiles
                .iter()
                .any(|record| record.profile.id == active);
            if exists {
                return;
            }
        }

        store.active_profile_id = store.profiles.first().map(|record| record.profile.id);
    }

    fn validate_profile_records(&self, records: &[ProfileRecord]) -> Result<(), AppError> {
        let mut errors = Vec::new();
        for record in records {
            if let Err(mut validation_errors) = validate_profile(&record.profile, &record.menus, &record.actions)
            {
                errors.append(&mut validation_errors);
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            let messages: Vec<String> = errors.iter().map(|err| err.to_string()).collect();
            Err(AppError::Message(format!(
                "bundle failed domain validation: {}",
                messages.join(", ")
            )))
        }
    }

    fn read_icon_files(&self) -> Result<Vec<IconFileEntry>, AppError> {
        let icons_dir = self.storage.base_dir().join("icons");
        if !icons_dir.exists() {
            return Ok(Vec::new());
        }

        let mut entries = Vec::new();
        self.collect_icon_files(&icons_dir, &icons_dir, &mut entries)?;
        Ok(entries)
    }

    fn collect_icon_files(
        &self,
        root: &Path,
        current: &Path,
        output: &mut Vec<IconFileEntry>,
    ) -> Result<(), AppError> {
        for entry in fs::read_dir(current).map_err(AppError::from)? {
            let entry = entry.map_err(AppError::from)?;
            let path = entry.path();
            if path.is_dir() {
                self.collect_icon_files(root, &path, output)?;
                continue;
            }

            let metadata = entry.metadata().map_err(AppError::from)?;
            if metadata.len() as usize > MAX_ICON_FILE_SIZE {
                self.audit
                    .log(
                        "WARN",
                        &format!(
                            "Skipping icon {} (size {} bytes exceeds limit)",
                            path.display(),
                            metadata.len()
                        ),
                    )
                    .map_err(AppError::from)?;
                continue;
            }

            let data = fs::read(&path).map_err(AppError::from)?;
            let relative = pathdiff::diff_paths(&path, root)
                .unwrap_or_else(|| PathBuf::from(entry.file_name()));
            let relative_str = relative.to_string_lossy().replace('\\', "/");
            let encoded = general_purpose::STANDARD.encode(data);
            output.push(IconFileEntry {
                relative_path: relative_str,
                encoding: ICON_ENCODING.to_string(),
                data: encoded,
                checksum: None,
            });
        }
        Ok(())
    }

    fn write_icon_files(&self, icons: &[IconFileEntry]) -> Result<Vec<String>, AppError> {
        if icons.is_empty() {
            return Ok(Vec::new());
        }

        let mut warnings = Vec::new();
        let icons_dir = self.storage.base_dir().join("icons");
        if !icons_dir.exists() {
            fs::create_dir_all(&icons_dir).map_err(AppError::from)?;
        }

        for icon in icons {
            if icon.encoding.to_lowercase() != ICON_ENCODING {
                warnings.push(format!(
                    "Icon {} skipped: unsupported encoding {}",
                    icon.relative_path, icon.encoding
                ));
                continue;
            }

            if let Some(path) = self.sanitized_relative_path(&icon.relative_path) {
                let target = icons_dir.join(path);
                if let Some(parent) = target.parent() {
                    if !parent.exists() {
                        fs::create_dir_all(parent).map_err(AppError::from)?;
                    }
                }
                let bytes = match general_purpose::STANDARD.decode(&icon.data) {
                    Ok(bytes) => bytes,
                    Err(err) => {
                        warnings.push(format!(
                            "Icon {} skipped: failed to decode data ({err})",
                            icon.relative_path
                        ));
                        continue;
                    }
                };
                if bytes.len() > MAX_ICON_FILE_SIZE {
                    warnings.push(format!(
                        "Icon {} skipped: decoded size {} bytes exceeds limit",
                        icon.relative_path,
                        bytes.len()
                    ));
                    continue;
                }
                fs::write(&target, bytes).map_err(AppError::from)?;
            } else {
                warnings.push(format!(
                    "Icon {} skipped: invalid relative path",
                    icon.relative_path
                ));
            }
        }

        Ok(warnings)
    }

    fn sanitized_relative_path(&self, raw: &str) -> Option<PathBuf> {
        let path = Path::new(raw);
        if path.is_absolute() {
            return None;
        }
        let mut clean = PathBuf::new();
        for component in path.components() {
            match component {
                Component::Normal(part) => clean.push(part),
                Component::CurDir => {}
                Component::ParentDir => return None,
                _ => return None,
            }
        }
        Some(clean)
    }

    pub fn parse_profile_ids(ids: &[String]) -> Result<Vec<ProfileId>, AppError> {
        let mut result = Vec::with_capacity(ids.len());
        for raw in ids {
            let uuid = Uuid::parse_str(raw).map_err(|err| {
                AppError::Message(format!("invalid profile id '{raw}': {err}"))
            })?;
            result.push(ProfileId::from(uuid));
        }
        Ok(result)
    }
}
