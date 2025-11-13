use anyhow::{anyhow, Result};
use std::str::FromStr;
use tauri::{AppHandle, Manager, Runtime};

#[cfg(target_os = "windows")]
mod windows;
mod unsupported;

pub enum BackendKind {
    Windows,
    Unsupported,
}

pub trait Backend<R: Runtime>: Send + Sync {
    fn kind(&self) -> BackendKind;
    fn bind_global_shortcut(
        &self,
        app: &AppHandle<R>,
        id: &str,
        accelerator: &str,
    ) -> Result<()>;
    fn unbind_global_shortcut(&self, app: &AppHandle<R>, id: &str) -> Result<()>;
    fn on_shortcut<F>(&self, app: &AppHandle<R>, accelerator: &str, handler: F) -> Result<()>
    where
        F: Fn(&AppHandle<R>, &str) + Send + 'static;
    fn get_pointer_position(&self, app: &AppHandle<R>) -> Option<(i32, i32)>;
    fn show_menu_at(&self, app: &AppHandle<R>, x: i32, y: i32) -> Result<()>;
    fn hide_menu(&self, app: &AppHandle<R>) -> Result<()>;
}

pub fn resolve_backend<R: Runtime>() -> Box<dyn Backend<R>> {
    #[cfg(target_os = "windows")]
    {
        return Box::new(windows::WindowsBackend::default());
    }
    Box::new(unsupported::UnsupportedBackend::default())
}

// Convenience helpers shared by backends
pub fn set_overlay_position<R: Runtime>(app: &AppHandle<R>, x: i32, y: i32) -> Result<()> {
    crate::services::pie_overlay::set_position(app, x, y)
        .map_err(|e| anyhow!("failed to position overlay: {e}"))
}

pub fn show_overlay<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    let store = app.state::<crate::services::pie_overlay::PieOverlayStore>();
    let state = store.snapshot();
    crate::services::pie_overlay::show(app, &store, state)
        .map_err(|e| anyhow!("failed to show overlay: {e}"))
}

pub fn hide_overlay<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    let store = app.state::<crate::services::pie_overlay::PieOverlayStore>();
    crate::services::pie_overlay::hide(app, &store)
        .map_err(|e| anyhow!("failed to hide overlay: {e}"))
}
