use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;

use autohotpie_tauri_lib::storage::{Settings, StorageManager};

fn write_settings(sm: &StorageManager, mut settings: Settings, note: &str) {
    // Ensure mutation to produce different file contents
    settings.set_app_version(note);
    sm.save_with_backup(&settings).expect("save_with_backup should succeed");
}

fn list_backups(dir: &PathBuf) -> Vec<PathBuf> {
    let mut entries: Vec<PathBuf> = fs::read_dir(dir)
        .expect("backups dir")
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .map(|e| e.path())
        .collect();
    entries.sort();
    entries
}

#[test]
fn retains_only_five_generations_fifo() {
    let tmp = TempDir::new().expect("tempdir");
    let base_dir = tmp.path().join("autohotpie");
    fs::create_dir_all(&base_dir).expect("mkdirs");

    let sm = StorageManager::with_base_dir(base_dir.clone()).expect("storage manager");

    // Seed initial settings to create a baseline file
    let mut settings = Settings::default();
    sm.save_with_backup(&settings).expect("initial save");

    // Perform multiple saves to exceed retention threshold
    for i in 0..8 {
        write_settings(&sm, settings.clone(), &format!("v-{}", i));
    }

    let backups_dir = base_dir.join("backups");
    let backups = list_backups(&backups_dir);
    assert_eq!(backups.len(), 5, "must retain only 5 backups");
}

#[test]
fn rotation_removes_oldest_first() {
    let tmp = TempDir::new().expect("tempdir");
    let base_dir = tmp.path().join("autohotpie");
    fs::create_dir_all(&base_dir).expect("mkdirs");

    let sm = StorageManager::with_base_dir(base_dir.clone()).expect("storage manager");
    let mut settings = Settings::default();

    // Create an initial file to enable backups
    sm.save_with_backup(&settings).expect("initial save");

    // Create 6 backups; retention is 5 so oldest should be pruned
    for i in 0..6 {
        write_settings(&sm, settings.clone(), &format!("r-{}", i));
    }

    let backups_dir = base_dir.join("backups");
    let mut backups = list_backups(&backups_dir);
    assert_eq!(backups.len(), 5, "retention limit enforced");

    // Oldest should not exist anymore after exceeding limit
    // Sort ascending by path name (timestamp-based names ensure lexicographic order matches time)
    backups.sort();
    let oldest = backups.first().cloned().expect("at least one backup");
    // Create one more backup and ensure vector still 5 and previous oldest disappears
    write_settings(&sm, settings.clone(), "extra");

    let backups_after = list_backups(&backups_dir);
    assert_eq!(backups_after.len(), 5, "still capped at 5");
    assert!(backups_after.iter().all(|p| p != &oldest), "oldest file should be pruned");
}



