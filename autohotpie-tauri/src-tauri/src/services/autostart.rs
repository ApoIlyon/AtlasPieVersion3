use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_autostart::AutoLaunchManager;

use crate::commands::AppError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutostartStatus {
    Enabled,
    Disabled,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutostartInfo {
    pub status: AutostartStatus,
    pub message: Option<String>,
}

pub struct AutostartService;

impl AutostartService {
    pub fn new() -> Self {
        Self
    }

    pub fn status<R: Runtime>(&self, app: &AppHandle<R>) -> AutostartInfo {
        let Some(plugin) = Self::manager(app) else {
            return AutostartInfo {
                status: AutostartStatus::Unsupported,
                message: Self::unsupported_message(),
            };
        };

        match plugin.is_enabled() {
            Ok(true) => AutostartInfo {
                status: AutostartStatus::Enabled,
                message: None,
            },
            Ok(false) => AutostartInfo {
                status: AutostartStatus::Disabled,
                message: None,
            },
            Err(err) => AutostartInfo {
                status: AutostartStatus::Unsupported,
                message: Some(format!("failed to query autostart status: {err}")),
            },
        }
    }

    pub fn enable<R: Runtime>(&self, app: &AppHandle<R>, enable: bool) -> Result<(), AppError> {
        let plugin = Self::manager(app).ok_or_else(|| {
            AppError::Message("autostart plugin not available".into())
        })?;

        if enable {
            plugin.enable()
        } else {
            plugin.disable()
        }
        .map_err(|err| AppError::Message(format!("failed to toggle autostart: {err}")))
    }

    pub fn open_location<R: Runtime>(&self, app: &AppHandle<R>) -> Result<(), AppError> {
        if Self::manager(app).is_none() {
            return Err(AppError::Message("autostart plugin not available".into()));
        }

        Err(AppError::Message(
            "Opening autostart location is not supported on this platform.".into(),
        ))
    }

    fn manager<'a, R: Runtime>(app: &'a AppHandle<R>) -> Option<State<'a, AutoLaunchManager>> {
        app.try_state::<AutoLaunchManager>()
    }

    fn unsupported_message() -> Option<String> {
        #[cfg(target_os = "linux")]
        {
            Some("Autostart is unavailable because no systemd/xdg integration is configured.".into())
        }
        #[cfg(any(target_os = "windows", target_os = "macos"))]
        {
            Some("Autostart is unavailable on this platform or missing permissions.".into())
        }
        #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
        {
            Some("Autostart is not supported on this platform.".into())
        }
    }
}
