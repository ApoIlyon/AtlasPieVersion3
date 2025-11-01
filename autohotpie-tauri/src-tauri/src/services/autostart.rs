use tauri::{AppHandle, Runtime};
#[cfg(not(target_os = "linux"))]
use tauri::{Manager, State};
#[cfg(target_os = "windows")]
use tauri_plugin_opener::OpenerExt; // for app.opener()
#[cfg(not(target_os = "linux"))]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutostartProvider {
    Systemd,
    XdgDesktop,
    Plugin,
    WindowsStartup,
    MacosLaunchAgent,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutostartInfo {
    pub status: AutostartStatus,
    pub message: Option<String>,
    pub launcher_path: Option<String>,
    pub provider: AutostartProvider,
    pub reason_code: Option<String>,
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
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

pub struct AutostartService;

impl AutostartService {
    pub fn new() -> Self {
        Self
    }

    #[cfg_attr(any(target_os = "linux", target_os = "windows"), allow(dead_code))]
    #[cfg(all(not(target_os = "linux"), target_os = "macos"))]
    fn enabled_message() -> String {
        "Autostart managed via macOS login items.".into()
    }

    #[cfg_attr(any(target_os = "linux", target_os = "windows"), allow(dead_code))]
    #[cfg(all(not(target_os = "linux"), not(target_os = "macos")))]
    fn enabled_message() -> String {
        "Autostart managed by platform autostart plugin.".into()
    }

    #[cfg_attr(any(target_os = "linux", target_os = "windows"), allow(dead_code))]
    #[cfg(all(not(target_os = "linux"), target_os = "macos"))]
    fn disabled_message() -> String {
        "Login item disabled. Enable autostart to register AutoHotPie.".into()
    }

    #[cfg_attr(any(target_os = "linux", target_os = "windows"), allow(dead_code))]
    #[cfg(all(not(target_os = "linux"), not(target_os = "macos")))]
    fn disabled_message() -> String {
        "Autostart disabled via platform autostart plugin.".into()
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

        #[cfg(all(not(target_os = "linux"), not(target_os = "windows")))]
        let Some(plugin) = Self::manager(app) else {
            #[cfg(target_os = "macos")]
            let provider = AutostartProvider::MacosLaunchAgent;
            #[cfg(not(target_os = "macos"))]
            let provider = AutostartProvider::Unsupported;

            return AutostartInfo {
                status: AutostartStatus::Unsupported,
                message: Self::unsupported_message(),
                launcher_path: None,
                provider,
                reason_code: Some("plugin_missing".into()),
            };
        };

        #[cfg(all(not(target_os = "linux"), not(target_os = "windows")))]
        {
            #[cfg(target_os = "macos")]
            let provider = AutostartProvider::MacosLaunchAgent;
            #[cfg(not(target_os = "macos"))]
            let provider = AutostartProvider::Plugin;

            match plugin.is_enabled() {
                Ok(true) => AutostartInfo {
                    status: AutostartStatus::Enabled,
                    message: Some(Self::enabled_message()),
                    launcher_path: None,
                    provider,
                    reason_code: None,
                },
                Ok(false) => AutostartInfo {
                    status: AutostartStatus::Disabled,
                    message: Some(Self::disabled_message()),
                    launcher_path: None,
                    provider,
                    reason_code: Some("plugin_disabled".into()),
                },
                Err(err) => AutostartInfo {
                    status: AutostartStatus::Unsupported,
                    message: Some(format!("failed to query autostart status: {err}")),
                    launcher_path: None,
                    provider,
                    reason_code: Some("plugin_error".into()),
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

        #[cfg(all(not(target_os = "linux"), not(target_os = "windows")))]
        let plugin = Self::manager(app)
            .ok_or_else(|| AppError::Message("autostart plugin not available".into()))?;

        #[cfg(all(not(target_os = "linux"), not(target_os = "windows")))]
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

    #[cfg(not(target_os = "linux"))]
    fn manager<'a, R: Runtime>(app: &'a AppHandle<R>) -> Option<State<'a, AutoLaunchManager>> {
        app.try_state::<AutoLaunchManager>()
    }

    #[cfg_attr(any(target_os = "linux", target_os = "windows"), allow(dead_code))]
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
    use super::{
        first_non_empty, AppError, AppHandle, AutostartInfo, AutostartProvider, AutostartStatus,
        Runtime,
    };
    use std::{
        env, fs,
        path::{Path, PathBuf},
        process::{Command, Output, Stdio},
    };

    const AUTOSTART_SUBDIR: &str = "autostart";
    const DESKTOP_FILE_SUFFIX: &str = ".desktop";
    const SYSTEMD_UNIT_SUFFIX: &str = ".service";

    pub fn status<R: Runtime>(app: &AppHandle<R>) -> AutostartInfo {
        let systemd = systemd_status(app).ok();
        if let Some(info) = systemd.as_ref() {
            if info.status == AutostartStatus::Enabled {
                return info.clone();
            }
        }

        let xdg = xdg_status(app).ok();
        if let Some(info) = xdg.as_ref() {
            if info.status == AutostartStatus::Enabled {
                return info.clone();
            }
        }

        systemd
            .or(xdg)
            .unwrap_or_else(|| AutostartInfo {
                status: AutostartStatus::Unsupported,
                message: Some(
                    "Linux autostart is unavailable. Install systemd or enable XDG autostart manually." 
                        .into(),
                ),
                launcher_path: None,
                provider: AutostartProvider::Unsupported,
                reason_code: Some("linux_no_provider".into()),
            })
    }

    pub fn set_enabled<R: Runtime>(app: &AppHandle<R>, enable: bool) -> Result<(), AppError> {
        if let Err(err) = set_systemd_enabled(app, enable) {
            eprintln!("systemd autostart toggle failed: {err}");
        }

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

    fn systemd_status<R: Runtime>(app: &AppHandle<R>) -> Result<AutostartInfo, AppError> {
        if !systemctl_available() {
            return Err(AppError::Message("systemctl not available in PATH".into()));
        }

        let unit_path = systemd_unit_path(app)?;
        let unit_name = systemd_unit_name(app);
        let launcher_path = if unit_path.exists() {
            Some(unit_path.to_string_lossy().into_owned())
        } else {
            None
        };

        let output = run_systemctl_raw(&["--user", "is-enabled", &unit_name])
            .map_err(|err| AppError::Message(format!("systemctl is-enabled failed: {err}")))?;

        match output.status.code() {
            Some(0) => Ok(AutostartInfo {
                status: AutostartStatus::Enabled,
                message: Some("Autostart managed via systemd user service.".into()),
                launcher_path,
                provider: AutostartProvider::Systemd,
                reason_code: None,
            }),
            Some(1) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let reason_code = if stderr.contains("does not exist") || launcher_path.is_none() {
                    "unit_missing"
                } else {
                    "unit_disabled"
                };
                Ok(AutostartInfo {
                    status: AutostartStatus::Disabled,
                    message: Some(
                        "Systemd service is not active. Enable autostart to register the user unit." 
                            .into(),
                    ),
                    launcher_path,
                    provider: AutostartProvider::Systemd,
                    reason_code: Some(reason_code.into()),
                })
            }
            _ => Err(AppError::Message(format!(
                "systemctl is-enabled returned status {}: {}",
                output.status.code().unwrap_or(-1),
                command_error(&output)
            ))),
        }
    }

    fn xdg_status<R: Runtime>(app: &AppHandle<R>) -> Result<AutostartInfo, AppError> {
        let path = desktop_entry_path(app)?;
        let launcher_path = Some(path.to_string_lossy().into_owned());
        if path.exists() {
            Ok(AutostartInfo {
                status: AutostartStatus::Enabled,
                message: Some("Autostart enabled via XDG desktop entry.".into()),
                launcher_path,
                provider: AutostartProvider::XdgDesktop,
                reason_code: None,
            })
        } else {
            Ok(AutostartInfo {
                status: AutostartStatus::Disabled,
                message: Some(
                    "XDG autostart entry missing. Enable autostart to create ~/.config/autostart file." 
                        .into(),
                ),
                launcher_path,
                provider: AutostartProvider::XdgDesktop,
                reason_code: Some("entry_missing".into()),
            })
        }
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

    fn set_systemd_enabled<R: Runtime>(app: &AppHandle<R>, enable: bool) -> Result<(), AppError> {
        if !systemctl_available() {
            return Err(AppError::Message("systemctl not available in PATH".into()));
        }

        let unit_path = systemd_unit_path(app)?;
        let unit_dir = unit_path
            .parent()
            .ok_or_else(|| AppError::Message("failed to resolve systemd directory".into()))?;

        if enable {
            fs::create_dir_all(unit_dir)?;
            let exec_path = current_executable()?;
            let contents = systemd_unit_contents(app, &exec_path);
            fs::write(&unit_path, contents)?;
            run_systemctl(&["--user", "daemon-reload"], "systemctl daemon-reload")?;
            run_systemctl(
                &["--user", "enable", "--now", &systemd_unit_name(app)],
                "systemctl enable",
            )?;
        } else {
            let unit_name = systemd_unit_name(app);
            let _ = run_systemctl(&["--user", "disable", "--now", &unit_name], "systemctl disable");
            if unit_path.exists() {
                fs::remove_file(&unit_path)?;
            }
            let _ = run_systemctl(&["--user", "daemon-reload"], "systemctl daemon-reload");
        }

        Ok(())
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
        format!("{}{}", sanitized_identifier(app), DESKTOP_FILE_SUFFIX)
    }

    fn sanitized_identifier<R: Runtime>(app: &AppHandle<R>) -> String {
        let config = app.config();
        let identifier = first_non_empty(
            Some(config.identifier.as_str()),
            config.product_name.as_ref().map(|name| name.as_str()),
        )
        .unwrap_or("autohotpie-tauri");

        identifier
            .chars()
            .map(|ch| {
                if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                    ch
                } else {
                    '-'
                }
            })
            .collect()
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
            "[Desktop Entry]\nType=Application\nVersion=1.0\nName={name}\nComment=Launch AutoHotPie when you log in\nExec=\"{exec}\"\nIcon={icon}\nTerminal=false\nX-GNOME-Autostart-enabled=true\nHidden=false\nStartupNotify=false\n",
            exec = exec_str,
            icon = icon
        )
    }

    fn systemd_unit_name<R: Runtime>(app: &AppHandle<R>) -> String {
        format!("{}{}", sanitized_identifier(app), SYSTEMD_UNIT_SUFFIX)
    }

    fn systemd_unit_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, AppError> {
        let mut dir = systemd_dir()?;
        dir.push(systemd_unit_name(app));
        Ok(dir)
    }

    fn systemd_dir() -> Result<PathBuf, AppError> {
        if let Some(custom) = env::var_os("XDG_CONFIG_HOME") {
            let mut base = PathBuf::from(custom);
            if base.as_os_str().is_empty() {
                return Err(AppError::Message("XDG_CONFIG_HOME is empty".into()));
            }
            base.push("systemd");
            base.push("user");
            return Ok(base);
        }

        let home = env::var_os("HOME")
            .ok_or_else(|| AppError::Message("HOME environment variable is not set".into()))?;
        let mut base = PathBuf::from(home);
        base.push(".config");
        base.push("systemd");
        base.push("user");
        Ok(base)
    }

    fn systemd_unit_contents<R: Runtime>(app: &AppHandle<R>, exec: &Path) -> String {
        let name = app
            .config()
            .product_name
            .as_ref()
            .filter(|name| !name.is_empty())
            .map(|name| name.clone())
            .unwrap_or_else(|| "AutoHotPie".into());

        let exec_str = exec.to_string_lossy();

        format!(
            "[Unit]\nDescription=Launch {name} (AutoHotPie) when you log in\nAfter=graphical-session.target\n\n[Service]\nType=simple\nExecStart={exec}\nRestart=on-failure\n\n[Install]\nWantedBy=default.target\n",
            exec = exec_str
        )
    }

    fn systemctl_available() -> bool {
        Command::new("systemctl")
            .args(["--user", "--version"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    fn run_systemctl_raw(args: &[&str]) -> std::io::Result<Output> {
        Command::new("systemctl")
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
    }

    fn run_systemctl(args: &[&str], context: &str) -> Result<Output, AppError> {
        let output = run_systemctl_raw(args)
            .map_err(|err| AppError::Message(format!("{context}: {err}")))?;
        if output.status.success() {
            Ok(output)
        } else {
            Err(AppError::Message(format!("{context}: {}", command_error(&output))))
        }
    }

    fn command_error(output: &Output) -> String {
        let code = output.status.code().unwrap_or(-1);
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.trim().is_empty() {
            format!("exit code {code}")
        } else {
            format!("exit code {code}: {stderr}")
        }
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use super::{
        AppError, AppHandle, AutostartInfo, AutostartProvider, AutostartStatus, Runtime,
    };

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
                        provider: AutostartProvider::WindowsStartup,
                        reason_code: None,
                    }
                } else {
                    AutostartInfo {
                        status: AutostartStatus::Disabled,
                        message: None,
                        launcher_path: Some(cmd.to_string_lossy().into()),
                        provider: AutostartProvider::WindowsStartup,
                        reason_code: Some("shortcut_missing".into()),
                    }
                }
            }
            Err(err) => AutostartInfo {
                status: AutostartStatus::Unsupported,
                message: Some(err.to_string()),
                launcher_path: None,
                provider: AutostartProvider::Unsupported,
                reason_code: Some("startup_dir_error".into()),
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
