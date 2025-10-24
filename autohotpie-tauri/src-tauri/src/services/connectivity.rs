use crate::services::system_status::SystemStatus;
use anyhow::Result;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::{net::TcpStream, time::interval};

const CONNECTIVITY_EVENT: &str = "system://connectivity";
const CHECK_INTERVAL: Duration = Duration::from_secs(30);

pub fn start_monitor<R: Runtime>(app: AppHandle<R>, status: Arc<Mutex<SystemStatus>>) {
    tauri::async_runtime::spawn(async move {
        if let Err(err) = run_loop(app.clone(), status.clone()).await {
            eprintln!("connectivity monitor exited: {err}");
        }
    });
}

async fn run_loop<R: Runtime>(app: AppHandle<R>, status: Arc<Mutex<SystemStatus>>) -> Result<()> {
    perform_check(&app, &status).await?;
    let mut ticker = interval(CHECK_INTERVAL);
    loop {
        ticker.tick().await;
        perform_check(&app, &status).await?;
    }
}

async fn perform_check<R: Runtime>(
    app: &AppHandle<R>,
    status: &Arc<Mutex<SystemStatus>>,
) -> Result<()> {
    let is_offline = check_connectivity().await?;
    let mut guard = status
        .lock()
        .map_err(|_| anyhow::anyhow!("system status poisoned"))?;
    let mut snapshot = guard.connectivity.clone();
    snapshot.update(is_offline);
    guard.connectivity = snapshot.clone();
    drop(guard);
    let _ = app.emit(CONNECTIVITY_EVENT, snapshot);
    Ok(())
}

async fn check_connectivity() -> Result<bool> {
    let target = "1.1.1.1:80";
    match TcpStream::connect(target).await {
        Ok(_) => Ok(false),
        Err(err) => {
            if err.kind() == std::io::ErrorKind::TimedOut {
                Ok(true)
            } else {
                Ok(true)
            }
        }
    }
}
