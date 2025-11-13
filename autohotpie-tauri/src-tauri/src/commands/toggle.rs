use super::{AppError, Result};
use crate::backend::{resolve_backend, set_overlay_position};
use crate::services::pie_overlay::{self, PieOverlayStore, WINDOW_LABEL};
use tauri::{AppHandle, Manager, Runtime};

#[tauri::command]
pub fn toggle_pie_menu<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    let backend = resolve_backend::<R>();

    let store = app.state::<PieOverlayStore>();
    let visible = store.snapshot().visible;

    if visible {
        backend
            .hide_menu(&app)
            .map_err(|e| AppError::Message(e.to_string()))?;
        return Ok(());
    }

    let target = backend.get_pointer_position(&app).or_else(|| center_of_screen(&app));

    if let Some((x, y)) = target {
        // Ensure window exists before positioning
        if let Err(err) = pie_overlay::init(&app) {
            eprintln!("failed to init pie overlay: {err}");
        }
        let _ = set_overlay_position(&app, x, y);
        backend
            .show_menu_at(&app, x, y)
            .map_err(|e| AppError::Message(e.to_string()))?
    } else {
        backend
            .show_menu_at(&app, 0, 0)
            .map_err(|e| AppError::Message(e.to_string()))?
    }

    Ok(())
}

fn center_of_screen<R: Runtime>(app: &AppHandle<R>) -> Option<(i32, i32)> {
    if let Some(main) = app.get_webview_window("main") {
        if let Ok(monitor) = main.current_monitor() {
            if let Some(m) = monitor {
                let size = m.size();
                let position = m.position();
                let cx = position.x + (size.width as i32 / 2);
                let cy = position.y + (size.height as i32 / 2);
                return Some((cx, cy));
            }
        }
        if let Ok(size) = main.outer_size() {
            let cx = (size.width as i32) / 2;
            let cy = (size.height as i32) / 2;
            return Some((cx, cy));
        }
    }
    None
}

