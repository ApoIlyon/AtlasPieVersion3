use crate::services::system_status::{StorageMode, SystemStatus};
use crate::storage::StorageManager;
use std::fs::OpenOptions;
use std::io::Write;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::time::interval;

const STORAGE_EVENT: &str = "system://storage-mode";
const CHECK_INTERVAL: Duration = Duration::from_secs(30);

pub fn detect_mode(storage: &StorageManager) -> StorageMode {
    let test_path = storage.base_dir().join(".write-test");
    match OpenOptions::new()
        .create(true)
        .write(true)
        .open(&test_path)
    {
        Ok(mut file) => {
            let _ = file.write_all(b"ok");
            let _ = std::fs::remove_file(&test_path);
            StorageMode::ReadWrite
        }
        Err(_) => StorageMode::ReadOnly,
    }
}

pub fn start_monitor(app: AppHandle, storage: StorageManager, status: Arc<Mutex<SystemStatus>>) {
    tauri::async_runtime::spawn(async move {
        if let Err(err) = run_loop(app.clone(), storage.clone(), status.clone()).await {
            eprintln!("storage guard exited: {err}");
        }
    });
}

async fn run_loop(
    app: AppHandle,
    storage: StorageManager,
    status: Arc<Mutex<SystemStatus>>,
) -> anyhow::Result<()> {
    update_mode(&app, &storage, &status).await?;
    let mut ticker = interval(CHECK_INTERVAL);
    loop {
        ticker.tick().await;
        update_mode(&app, &storage, &status).await?;
    }
}

async fn update_mode(
    app: &AppHandle,
    storage: &StorageManager,
    status: &Arc<Mutex<SystemStatus>>,
) -> anyhow::Result<()> {
    let storage_clone = storage.clone();
    let mode = tauri::async_runtime::spawn_blocking(move || detect_mode(&storage_clone))
        .await
        .map_err(|err| anyhow::anyhow!(err.to_string()))?;

    let mut guard = status
        .lock()
        .map_err(|_| anyhow::anyhow!("system status poisoned"))?;
    if guard.storage_mode != mode {
        guard.set_storage_mode(mode.clone());
        drop(guard);
        let _ = app.emit(STORAGE_EVENT, mode);
    }

    Ok(())
}
