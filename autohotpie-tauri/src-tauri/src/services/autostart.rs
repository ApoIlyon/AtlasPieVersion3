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
    pub launcher_path: Option<String>,
}

pub struct AutostartService;

impl AutostartService {
    pub fn new() -> Self {
        Self
    }

    pub fn status<R: Runtime>(&self, app: &AppHandle<R>) -> AutostartInfo {
        #[cfg(target_os = "linux")]
        {
            return linux::status(app);
        }

        #[cfg(not(target_os = "linux"))]
        let Some(plugin) = Self::manager(app) else {
            return AutostartInfo {
                status: AutostartStatus::Unsupported,
                message: Self::unsupported_message(),
                launcher_path: None,
            };
        };

        #[cfg(not(target_os = "linux"))]
        {
            match plugin.is_enabled() {
                Ok(true) => AutostartInfo {
                    status: AutostartStatus::Enabled,
                    message: None,
                    launcher_path: None,
                },
                Ok(false) => AutostartInfo {
                    status: AutostartStatus::Disabled,
                    message: None,
                    launcher_path: None,
                },
                Err(err) => AutostartInfo {
                    status: AutostartStatus::Unsupported,
                    message: Some(format!("failed to query autostart status: {err}")),
                    launcher_path: None,
                },
            }
        }
    }

    pub fn enable<R: Runtime>(&self, app: &AppHandle<R>, enable: bool) -> Result<(), AppError> {
        #[cfg(target_os = "linux")]
        {
            return linux::set_enabled(app, enable);
        }

        #[cfg(not(target_os = "linux"))]
        let plugin = Self::manager(app).ok_or_else(|| {
            AppError::Message("autostart plugin not available".into())
        })?;

        #[cfg(not(target_os = "linux"))]
        {
            if enable {
                plugin.enable()
            } else {
                plugin.disable()
            }
            .map_err(|err| AppError::Message(format!("failed to toggle autostart: {err}")))
        }
    }

    pub fn open_location<R: Runtime>(&self, app: &AppHandle<R>) -> Result<(), AppError> {
        #[cfg(target_os = "linux")]
        {
            return linux::open_location(app);
        }

        #[cfg(not(target_os = "linux"))]
        {
            if Self::manager(app).is_none() {
                return Err(AppError::Message("autostart plugin not available".into()));
            }

            Err(AppError::Message(
                "Opening autostart location is not supported on this platform.".into(),
            ))
        }
    }

    fn manager<'a, R: Runtime>(app: &'a AppHandle<R>) -> Option<State<'a, AutoLaunchManager>> {
        app.try_state::<AutoLaunchManager>()
    }

    #[cfg(not(target_os = "linux"))]
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

#[cfg(target_os = "linux")]
mod linux {
    use super::{AppError, AppHandle, AutostartInfo, AutostartStatus, Runtime};
    use std::{env, fs, path::Path, path::PathBuf, process::Command};

    const AUTOSTART_SUBDIR: &str = "autostart";
    const DESKTOP_FILE_SUFFIX: &str = ".desktop";

    pub fn status<R: Runtime>(app: &AppHandle<R>) -> AutostartInfo {
        match desktop_entry_path(app) {
            Ok(path) => {
                let launcher_path = Some(path.to_string_lossy().into_owned());
                if path.exists() {
                    AutostartInfo {
                        status: AutostartStatus::Enabled,
                        message: None,
                        launcher_path,
                    }
                } else {
                    AutostartInfo {
                        status: AutostartStatus::Disabled,
                        message: Some("Autostart entry not found. Enable to create an XDG desktop entry.".into()),
                        launcher_path,
                    }
                }
            }
            Err(err) => AutostartInfo {
                status: AutostartStatus::Unsupported,
                message: Some(err.to_string()),
                launcher_path: None,
            },
        }
    }

    pub fn set_enabled<R: Runtime>(app: &AppHandle<R>, enable: bool) -> Result<(), AppError> {
        let path = desktop_entry_path(app)?;
        let dir = path
            .parent()
            .ok_or_else(|| AppError::Message("failed to resolve autostart directory".into()))?;

        if enable {
            fs::create_dir_all(dir)?;
            let exec_path = current_executable()?;
            let icon = icon_name(app);
            let contents = desktop_entry_contents(app, &exec_path, &icon);
            fs::write(&path, contents)?;
        } else if path.exists() {
            fs::remove_file(&path)?;
        }

        Ok(())
    }

    pub fn open_location<R: Runtime>(_app: &AppHandle<R>) -> Result<(), AppError> {
        let dir = autostart_dir()?;
        fs::create_dir_all(&dir)?;

        let status = Command::new("xdg-open")
            .arg(&dir)
            .status()
            .map_err(|err| AppError::Message(format!("failed to launch xdg-open: {err}")))?;

        if status.success() {
            Ok(())
        } else {
            Err(AppError::Message(format!(
                "xdg-open exited with status {}",
                status.code().unwrap_or(-1)
            )))
        }
    }

    fn desktop_entry_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, AppError> {
        let dir = autostart_dir()?;
        let file_name = desktop_file_name(app);
        Ok(dir.join(file_name))
    }

    fn autostart_dir() -> Result<PathBuf, AppError> {
        if let Some(custom) = env::var_os("XDG_CONFIG_HOME") {
            let mut base = PathBuf::from(custom);
            if base.as_os_str().is_empty() {
                return Err(AppError::Message("XDG_CONFIG_HOME is empty".into()));
            }
            base.push(AUTOSTART_SUBDIR);
            return Ok(base);
        }

        let home = env::var_os("HOME").ok_or_else(|| AppError::Message("HOME environment variable is not set".into()))?;
        let mut base = PathBuf::from(home);
        base.push(".config");
        base.push(AUTOSTART_SUBDIR);
        Ok(base)
    }

    fn desktop_file_name<R: Runtime>(app: &AppHandle<R>) -> String {
        let config = app.config();
        let identifier = config
            .identifier
            .as_ref()
            .and_then(|value| if value.is_empty() { None } else { Some(value.as_str()) })
            .or_else(|| {
                config
                    .product_name
                    .as_ref()
                    .and_then(|value| if value.is_empty() { None } else { Some(value.as_str()) })
            })
            .unwrap_or("autohotpie-tauri");

        let sanitized: String = identifier
            .chars()
            .map(|ch| {
                if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                    ch
                } else {
                    '-'
                }
            })
            .collect();

        format!("{sanitized}{DESKTOP_FILE_SUFFIX}")
    }

    fn current_executable() -> Result<PathBuf, AppError> {
        std::env::current_exe().map_err(|err| AppError::Message(format!("failed to resolve current executable: {err}")))
    }

    fn icon_name<R: Runtime>(app: &AppHandle<R>) -> String {
        app
            .config()
            .product_name
            .as_ref()
            .filter(|name| !name.is_empty())
            .map(|name| name.clone())
            .unwrap_or_else(|| "autohotpie".into())
    }

    fn desktop_entry_contents<R: Runtime>(app: &AppHandle<R>, exec: &Path, icon: &str) -> String {
        let name = app
            .config()
            .product_name
            .as_ref()
            .filter(|name| !name.is_empty())
            .map(|name| name.clone())
            .unwrap_or_else(|| "AutoHotPie".into());

        let exec_str = exec.to_string_lossy();

        format!(
            "[Desktop Entry]\nType=Application\nVersion=1.0\nName={name}\nComment=Launch AutoHotPie when you log in\nExec={exec}\nIcon={icon}\nTerminal=false\nX-GNOME-Autostart-enabled=true\nHidden=false\nStartupNotify=false\n",
            exec = exec_str,
            icon = icon
        )
    }
}
