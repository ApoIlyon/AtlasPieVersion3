use super::{AppError, Result};
use std::process::Command;

fn to_gsettings_binding(accel: &str) -> String {
    let parts: Vec<_> = accel
        .split('+')
        .map(|p| p.trim().to_lowercase())
        .collect();
    let mut out = String::new();
    for p in &parts {
        match p.as_str() {
            "control" | "ctrl" => out.push_str("<Control>"),
            "primary" => out.push_str("<Primary>"),
            "shift" => out.push_str("<Shift>"),
            "alt" | "option" => out.push_str("<Alt>"),
            "meta" | "cmd" | "command" | "win" => out.push_str("<Super>"),
            other => {
                // Capitalize single-letter keys
                if other.len() == 1 {
                    out.push_str(&other.to_uppercase());
                } else {
                    // Common names
                    match other {
                        "space" => out.push_str("space"),
                        _ => out.push_str(&other),
                    }
                }
            }
        }
    }
    out
}

#[tauri::command]
pub fn setup_gnome_shortcut(accelerator: Option<String>) -> Result<()> {
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().to_lowercase();
    if !desktop.contains("gnome") {
        return Err(AppError::Message("unsupported desktop (only GNOME)".into()));
    }

    let exe = std::env::current_exe()
        .map_err(|e| AppError::Message(format!("failed to get current exe: {e}")))?;
    let cmd_str = format!("{} --toggle", exe.display());

    let binding = to_gsettings_binding(
        accelerator
            .as_deref()
            .unwrap_or("Control+Shift+P"),
    );

    let key_path = "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/autohotpie-tauri-toggle/";

    // Read existing list
    let get = Command::new("gsettings")
        .args([
            "get",
            "org.gnome.settings-daemon.plugins.media-keys",
            "custom-keybindings",
        ])
        .output()
        .map_err(|e| AppError::Message(format!("failed to read gsettings: {e}")))?;
    let mut list_str = String::from_utf8_lossy(&get.stdout).to_string();
    if list_str.trim().is_empty() {
        list_str = "[]".into();
    }

    // Append our entry if missing
    if !list_str.contains(key_path) {
        let mut entries: Vec<String> = Vec::new();
        let trimmed = list_str.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            let inner = &trimmed[1..trimmed.len() - 1];
            for part in inner.split(',') {
                let v = part.trim().trim_matches('\'').to_string();
                if !v.is_empty() {
                    entries.push(v);
                }
            }
        }
        entries.push(key_path.into());
        let new_list = format!("[{}]", entries.iter().map(|e| format!("'{}'", e)).collect::<Vec<_>>().join(", "));
        Command::new("gsettings")
            .args([
                "set",
                "org.gnome.settings-daemon.plugins.media-keys",
                "custom-keybindings",
                &new_list,
            ])
            .status()
            .map_err(|e| AppError::Message(format!("failed to write custom-keybindings: {e}")))?;
    }

    // Set name, binding, command
    let schema_base = "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:";
    let schema = format!("{}{}", schema_base, key_path);

    let _ = Command::new("gsettings")
        .args(["set", &schema, "name", "'AutoHotPie Toggle'"])
        .status();
    let _ = Command::new("gsettings")
        .args(["set", &schema, "binding", &format!("'{}'", binding)])
        .status();
    let _ = Command::new("gsettings")
        .args(["set", &schema, "command", &format!("'{}'", cmd_str)])
        .status();

    Ok(())
}

