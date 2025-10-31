use std::fs;
use std::io::Write;
use std::path::Path;
use tempfile::TempDir;

type DynError = Box<dyn std::error::Error + Send + Sync + 'static>;

fn write_json(path: &Path, contents: &serde_json::Value) -> Result<(), DynError> {
    let mut file = fs::File::create(path)?;
    let payload = serde_json::to_vec_pretty(contents)?;
    file.write_all(&payload)?;
    Ok(())
}

fn fake_profile_store_json(entry_count: usize) -> serde_json::Value {
    let profiles: Vec<serde_json::Value> = (0..entry_count)
        .map(|index| {
            serde_json::json!({
                "profile": {
                    "id": format!("00000000-0000-0000-0000-0000000000{index}"),
                    "name": format!("Profile {index}"),
                    "description": null,
                    "enabled": true,
                    "globalHotkey": null,
                    "activationRules": [],
                    "rootMenu": format!("menu-{index}"),
                },
                "menus": [
                    {
                        "id": format!("menu-{index}"),
                        "title": format!("Menu {index}"),
                        "appearance": null,
                        "slices": [
                            {
                                "id": format!("slice-{index}"),
                                "order": 0,
                                "label": "Sample",
                                "icon": null,
                                "action": Some(format!("action-{index}")),
                                "childMenu": null,
                                "hotkey": null,
                                "description": null,
                            }
                        ],
                    }
                ],
                "actions": [
                    {
                        "id": format!("action-{index}"),
                        "name": "Launch",
                        "kind": "launch",
                        "timeoutMs": 1000,
                        "steps": [
                            {
                                "id": format!("step-{index}"),
                                "order": 0,
                                "kind": "launch",
                                "appPath": "calc",
                                "arguments": null,
                                "note": null,
                            }
                        ],
                        "description": null,
                        "lastValidatedAt": null,
                    }
                ],
                "createdAt": null,
                "updatedAt": null,
            })
        })
        .collect();

    serde_json::json!({
        "schemaVersion": 1,
        "profiles": profiles,
        "activeProfileId": null,
        "migratedFromSettings": null,
    })
}

mod storage_manager_profile_backups {
    use super::*;
    use autohotpie_tauri_lib::storage::StorageManager;
    use autohotpie_tauri_lib::models::Settings;

    #[test]
    fn rotates_settings_backups_fifo() -> Result<(), DynError> {
        let temp_dir = TempDir::new()?;
        let app = tauri::test::mock_app();
        let handle = app.handle();

        // StorageManager::new expects the directory structure to exist.
        fs::create_dir_all(temp_dir.path())?;

        let manager = StorageManager::new(handle.clone())?;

        // Pre-seed settings file
        let mut settings = Settings::default();
        for version in 0..8 {
            settings.set_app_version(&format!("0.0.{}", version));
            manager.save_with_backup(&settings)?;
        }

        let backups_dir = manager.base_dir().join("backups");
        let mut entries: Vec<_> = fs::read_dir(&backups_dir)?
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .collect();
        entries.sort();

        assert_eq!(entries.len(), 5, "expected oldest backups pruned to retention");

        Ok(())
    }
}

mod profile_repository_backups_fifo {
    use super::*;
    use autohotpie_tauri_lib::storage::profile_repository::{ProfileRepository, PROFILES_FILE_NAME};
    use std::thread::sleep;
    use std::time::Duration;

    #[test]
    fn creates_backup_per_save_and_enforces_retention() -> Result<(), DynError> {
        let temp_dir = TempDir::new()?;
        let backups_dir = temp_dir.path().join("profiles");
        fs::create_dir_all(&backups_dir)?;

        let repository = ProfileRepository::new(temp_dir.path(), temp_dir.path())
            .with_max_backups(3);

        let store_path = temp_dir.path().join(PROFILES_FILE_NAME);
        write_json(&store_path, &fake_profile_store_json(1))?;

        for revision in 0..5 {
            write_json(&store_path, &fake_profile_store_json(revision + 1))?;
            repository.save(&serde_json::from_value(fake_profile_store_json(revision + 1))?)?;
            sleep(Duration::from_millis(10));
        }

        let backups = repository.list_backups()?;
        assert_eq!(backups.len(), 3, "retention should cap backups to max_backups");

        Ok(())
    }
}
