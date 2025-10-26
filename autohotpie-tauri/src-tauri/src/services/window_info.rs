use crate::services::system_status::{CursorPosition, SystemStatus, WindowSnapshot};
use anyhow::{anyhow, Result};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::time::interval;

const WINDOW_EVENT: &str = "system://window-info";
const POLL_INTERVAL: Duration = Duration::from_millis(750);

pub fn start_monitor<R: Runtime>(app: AppHandle<R>, status: Arc<Mutex<SystemStatus>>) {
    tauri::async_runtime::spawn(async move {
        if let Err(err) = run_loop(app.clone(), status.clone()).await {
            eprintln!("window info monitor exited: {err}");
        }
    });
}

async fn run_loop<R: Runtime>(app: AppHandle<R>, status: Arc<Mutex<SystemStatus>>) -> Result<()> {
    publish_snapshot(&app, &status).await?;
    let mut ticker = interval(POLL_INTERVAL);
    loop {
        ticker.tick().await;
        publish_snapshot(&app, &status).await?;
    }
}

async fn publish_snapshot<R: Runtime>(
    app: &AppHandle<R>,
    status: &Arc<Mutex<SystemStatus>>,
) -> Result<()> {
    let snapshot = collect_snapshot(app).await?;
    {
        let mut guard = status
            .lock()
            .map_err(|_| anyhow!("system status poisoned"))?;
        guard.update_window(snapshot.clone());
    }
    let _ = app.emit(WINDOW_EVENT, snapshot);
    Ok(())
}

async fn collect_snapshot<R: Runtime>(app: &AppHandle<R>) -> Result<WindowSnapshot> {
    let mut snapshot = WindowSnapshot::now();

    snapshot.process_name = current_process_name(app);

    if let Some(window) = app.get_webview_window("main") {
        if let Ok(title) = window.title() {
            if !title.is_empty() {
                snapshot.window_title = Some(title);
            }
        }

        if let Ok(fullscreen) = window.is_fullscreen() {
            snapshot.is_fullscreen = fullscreen;
        }

        if let Ok(position) = window.cursor_position() {
            snapshot.cursor_position = Some(CursorPosition {
                x: position.x,
                y: position.y,
            });
        }
    }

    Ok(snapshot)
}

fn current_process_name<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    if let Some(name) = app.config().product_name.clone() {
        if !name.is_empty() {
            return Some(name);
        }
    }

    std::env::current_exe().ok().and_then(|path| {
        path.file_name()
            .map(|name| name.to_string_lossy().into_owned())
    })
}
