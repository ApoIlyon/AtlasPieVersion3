use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_opener::OpenerExt; // for app.opener()
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

fn first_non_empty<'a>(primary: Option<&'a str>, fallback: Option<&'a str>) -> Option<&'a str> {
    fn normalized(value: &str) -> Option<&str> {
        if value.trim().is_empty() {
            None
        } else {
            Some(value)
        }
    }

    primary
        .and_then(normalized)
        .or_else(|| fallback.and_then(normalized))
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
        #[cfg(target_os = "windows")]
        {
            return windows::status(app);
        }
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
        #[cfg(target_os = "windows")]
        {
            return windows::set_enabled(app, enable);
        }
        #[cfg(target_os = "linux")]
        {
            return linux::set_enabled(app, enable);
        }

        #[cfg(not(target_os = "linux"))]
        let plugin = Self::manager(app)
            .ok_or_else(|| AppError::Message("autostart plugin not available".into()))?;

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

        #[cfg(target_os = "windows")]
        {
            use std::env;
            use std::path::PathBuf;

            if Self::manager(app).is_none() {
                return Err(AppError::Message("autostart plugin not available".into()));
            }

            // Open the per-user Startup folder.
            // %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
            let appdata = env::var_os("APPDATA").ok_or_else(|| {
                AppError::Message("APPDATA environment variable is not set".into())
            })?;
            let mut path = PathBuf::from(appdata);
            path.push("Microsoft\\Windows\\Start Menu\\Programs\\Startup");

            app
                .opener()
                .open_path(path.to_string_lossy().to_string(), None::<&str>)
                .map_err(|err| {
                    AppError::Message(format!(
                        "failed to open autostart folder in Explorer: {err}"
                    ))
                })
        }

        #[cfg(target_os = "macos")]
        {
            if Self::manager(app).is_none() {
                return Err(AppError::Message("autostart plugin not available".into()));
            }
            // No stable file-system location for login items; surface a clear message.
            Err(AppError::Message(
                "Opening autostart location is not supported on macOS. Use System Settings → Login Items.".into(),
            ))
        }

        #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
        {
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
            Some(
                "Autostart is unavailable because no systemd/xdg integration is configured.".into(),
            )
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
    use super::{first_non_empty, AppError, AppHandle, AutostartInfo, AutostartStatus, Runtime};
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
                        message: Some(
                            "Autostart entry not found. Enable to create an XDG desktop entry."
                                .into(),
                        ),
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

        let home = env::var_os("HOME")
            .ok_or_else(|| AppError::Message("HOME environment variable is not set".into()))?;
        let mut base = PathBuf::from(home);
        base.push(".config");
        base.push(AUTOSTART_SUBDIR);
        Ok(base)
    }

    fn desktop_file_name<R: Runtime>(app: &AppHandle<R>) -> String {
        let config = app.config();
        let identifier = first_non_empty(
            Some(config.identifier.as_str()),
            config.product_name.as_ref().map(|name| name.as_str()),
        )
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
        std::env::current_exe().map_err(|err| {
            AppError::Message(format!("failed to resolve current executable: {err}"))
        })
    }

    fn icon_name<R: Runtime>(app: &AppHandle<R>) -> String {
        app.config()
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

#[cfg(target_os = "windows")]
mod windows {
    use super::{AppError, AppHandle, AutostartInfo, AutostartStatus, Runtime};
    use std::{env, fs, path::PathBuf};
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, IPersistFile};
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    fn startup_dir() -> Result<PathBuf, AppError> {
        let appdata = env::var_os("APPDATA")
            .ok_or_else(|| AppError::Message("APPDATA environment variable is not set".into()))?;
        let mut dir = PathBuf::from(appdata);
        dir.push("Microsoft\\Windows\\Start Menu\\Programs\\Startup");
        Ok(dir)
    }

    fn shortcut_paths<R: Runtime>(app: &AppHandle<R>) -> Result<(PathBuf, PathBuf), AppError> {
        let dir = startup_dir()?;
        let product = app
            .config()
            .product_name
            .clone()
            .unwrap_or_else(|| "AutoHotPie".into());
        let lnk = dir.join(format!("{}.lnk", product));
        let cmd = dir.join(format!("{}.cmd", product));
        Ok((lnk, cmd))
    }

    pub fn status<R: Runtime>(app: &AppHandle<R>) -> AutostartInfo {
        match shortcut_paths(app) {
            Ok((lnk, cmd)) => {
                let exists = lnk.exists() || cmd.exists();
                if exists {
                    AutostartInfo {
                        status: AutostartStatus::Enabled,
                        message: None,
                        launcher_path: Some(if lnk.exists() { lnk } else { cmd }.to_string_lossy().into()),
                    }
                } else {
                    AutostartInfo {
                        status: AutostartStatus::Disabled,
                        message: None,
                        launcher_path: Some(cmd.to_string_lossy().into()),
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
        let (lnk, cmd) = shortcut_paths(app)?;
        let dir = startup_dir()?;
        fs::create_dir_all(&dir)?;

        if enable {
            let exe = std::env::current_exe().map_err(|err| {
                AppError::Message(format!("failed to resolve current executable: {err}"))
            })?;
            // Try to create a real .lnk shortcut via COM first
            if let Err(err) = create_shell_link(&exe, &lnk) {
                // Fallback: .cmd starter
                let contents = format!("@echo off\r\nstart \"\" \"{}\"\r\n", exe.to_string_lossy());
                fs::write(&cmd, contents)?;
                eprintln!("failed to create .lnk shortcut, fallback to .cmd: {}", err);
            }
        } else {
            // Disable: try to remove both variants regardless of which exists
            let (lnk_path, cmd_path) = shortcut_paths(app)?;
            if cmd_path.exists() {
                let _ = fs::remove_file(&cmd_path);
            }
            if lnk_path.exists() {
                let _ = fs::remove_file(&lnk_path);
            }
        }
        Ok(())
    }

    fn to_wide(s: &std::path::Path) -> Vec<u16> {
        use std::os::windows::ffi::OsStrExt;
        let mut wide: Vec<u16> = s.as_os_str().encode_wide().collect();
        wide.push(0);
        wide
    }

    fn create_shell_link(exe: &std::path::Path, lnk: &std::path::Path) -> Result<(), AppError> {
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                .ok()
                .map_err(|e| AppError::Message(format!("COM init failed: {e}")))?;
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| AppError::Message(format!("CoCreateInstance ShellLink failed: {e}")))?;

            let exe_w = to_wide(exe);
            link
                .SetPath(PCWSTR(exe_w.as_ptr()))
                .map_err(|e| AppError::Message(format!("SetPath failed: {e}")))?;

            let persist: IPersistFile = link
                .cast()
                .map_err(|e| AppError::Message(format!("cast to IPersistFile failed: {e}")))?;
            let lnk_w = to_wide(lnk);
            persist
                .Save(PCWSTR(lnk_w.as_ptr()), true)
                .map_err(|e| AppError::Message(format!("Save .lnk failed: {e}")))?;
            CoUninitialize();
        }
        Ok(())
    }
}
