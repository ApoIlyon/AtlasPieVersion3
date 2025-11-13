use super::{hide_overlay, set_overlay_position, show_overlay, Backend, BackendKind};
use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::str::FromStr;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[derive(Default)]
pub struct WindowsBackend {
    registry: Mutex<HashMap<String, String>>, // id -> accelerator
}

impl<R: Runtime> Backend<R> for WindowsBackend {
    fn kind(&self) -> BackendKind {
        BackendKind::Windows
    }

    fn bind_global_shortcut(
        &self,
        app: &AppHandle<R>,
        id: &str,
        accelerator: &str,
    ) -> Result<()> {
        let shortcut = Shortcut::from_str(accelerator)
            .map_err(|e| anyhow!("invalid accelerator: {e}"))?;
        // Ensure any previous mapping is removed
        if let Some(prev) = self.registry.lock().insert(id.to_string(), accelerator.to_string()) {
            if let Ok(prev_shortcut) = Shortcut::from_str(&prev) {
                let _ = app.global_shortcut().unregister(prev_shortcut);
            }
        }
        app.global_shortcut()
            .register(shortcut)
            .map_err(|e| anyhow!("failed to register global shortcut: {e}"))
    }

    fn unbind_global_shortcut(&self, app: &AppHandle<R>, id: &str) -> Result<()> {
        if let Some(prev) = self.registry.lock().remove(id) {
            if let Ok(prev_shortcut) = Shortcut::from_str(&prev) {
                let _ = app.global_shortcut().unregister(prev_shortcut);
            }
        }
        Ok(())
    }

    fn on_shortcut<F>(&self, app: &AppHandle<R>, accelerator: &str, handler: F) -> Result<()>
    where
        F: Fn(&AppHandle<R>, &str) + Send + 'static,
    {
        let shortcut = Shortcut::from_str(accelerator)
            .map_err(|e| anyhow!("invalid accelerator: {e}"))?;
        app.global_shortcut()
            .on_shortcut(shortcut, move |app_handle, _shortcut, _evt| {
                handler(app_handle, accelerator)
            })
            .map_err(|e| anyhow!("failed to attach shortcut handler: {e}"))
    }

    fn get_pointer_position(&self, app: &AppHandle<R>) -> Option<(i32, i32)> {
        if let Some(window) = app.get_webview_window("main") {
            if let Ok(pos) = window.cursor_position() {
                return Some((pos.x as i32, pos.y as i32));
            }
        }
        None
    }

    fn show_menu_at(&self, app: &AppHandle<R>, x: i32, y: i32) -> Result<()> {
        // Position the overlay and show
        let _ = set_overlay_position(app, x, y);
        show_overlay(app)
    }

    fn hide_menu(&self, app: &AppHandle<R>) -> Result<()> {
        hide_overlay(app)
    }
}

