use super::*;
use crate::storage::profile_repository::ProfileRecord;
use std::fs;
use tempfile::TempDir;

fn sample_store() -> ProfileStore {
    let mut store = ProfileStore::default();
    let profile = Profile {
        id: ProfileId::new(),
        name: "Sample".into(),
        description: None,
        enabled: true,
        global_hotkey: None,
        activation_rules: vec![],
        root_menu: PieMenuId::new(),
    };
    store.profiles.push(ProfileRecord {
        profile,
        menus: vec![],
        actions: vec![],
        created_at: None,
        updated_at: None,
    });
    store
}

fn write_store(base: &TempDir, store: &ProfileStore) -> std::path::PathBuf {
    let file = base.path().join(PROFILES_FILE_NAME);
    fs::write(
        &file,
        serde_json::to_string(store).expect("serialize store"),
    )
    .expect("write store");
    file
}

#[test]
fn load_returns_recovery_info_on_corrupt_json() {
    let tmp = TempDir::new().expect("tempdir");
    let backups_root = tmp.path().join("backups");
    fs::create_dir_all(&backups_root).expect("backups dir root");
    let repo = ProfileRepository::new(tmp.path(), &backups_root);
    let store_path = write_store(&tmp, &sample_store());
    fs::write(&store_path, "not-json").expect("corrupt file");

    let err = repo.load().expect_err("should fail");
    match err {
        ProfileStoreLoadError::Corrupted {
            file_path,
            backups_dir,
            message,
        } => {
            assert_eq!(file_path, store_path);
            assert!(!message.trim().is_empty(), "expected error message to be present");
            assert_eq!(backups_dir, backups_root.join(PROFILES_BACKUP_DIR));
        }
        other => panic!("unexpected error: {:?}", other),
    }
}

#[test]
fn to_recovery_maps_payload() {
    let tmp = TempDir::new().expect("tempdir");
    let error = ProfileStoreLoadError::corrupted(
        tmp.path().join(PROFILES_FILE_NAME),
        "invalid token",
        tmp.path().join("backups"),
    );

    let info = error.to_recovery().expect("recovery info");
    assert!(info.message.contains("invalid token"));
    assert!(info.file_path.ends_with(PROFILES_FILE_NAME));
    assert!(info.backups_dir.ends_with("backups"));
}
