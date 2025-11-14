use super::{hide_overlay, show_overlay, Backend, BackendKind};
use anyhow::Result;
use tauri::{AppHandle, Runtime};

#[derive(Default)]
pub struct UnsupportedBackend;

impl<R: Runtime> Backend<R> for UnsupportedBackend {
    fn kind(&self) -> BackendKind {
        BackendKind::Unsupported
    }

    fn bind_global_shortcut(
        &self,
        _app: &AppHandle<R>,
        _id: &str,
        _accelerator: &str,
    ) -> Result<()> {
        Ok(())
    }

    fn unbind_global_shortcut(&self, _app: &AppHandle<R>, _id: &str) -> Result<()> {
        Ok(())
    }

    fn on_shortcut(
        &self,
        _app: &AppHandle<R>,
        _accelerator: &str,
        _handler: Box<dyn Fn(&AppHandle<R>, &str) + Send + Sync + 'static>,
    ) -> Result<()> {
        Ok(())
    }

    fn get_pointer_position(&self, _app: &AppHandle<R>) -> Option<(i32, i32)> {
        None
    }

    fn show_menu_at(&self, app: &AppHandle<R>, _x: i32, _y: i32) -> Result<()> {
        show_overlay(app)
    }

    fn hide_menu(&self, app: &AppHandle<R>) -> Result<()> {
        hide_overlay(app)
    }
}
