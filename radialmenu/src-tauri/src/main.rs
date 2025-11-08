#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use device_query::{DeviceQuery, DeviceState, Keycode};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::PathBuf,
    process::Command,
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{AppHandle, GlobalShortcutManager, Manager, State, WindowBuilder, WindowUrl};
use thiserror::Error;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MenuItem {
    pub id: String,
    pub label: String,
    pub command: Option<String>,
    pub color: Option<String>,
}

fn shortcut_to_required_keys(shortcut: &str) -> std::result::Result<Vec<Vec<Keycode>>, String> {
    let mut result: Vec<Vec<Keycode>> = Vec::new();

    for part in shortcut.split('+') {
        let normalized = part.trim().to_lowercase();
        if normalized.is_empty() {
            continue;
        }

        let alternatives = match normalized.as_str() {
            "ctrl" | "control" | "commandorcontrol" => {
                vec![Keycode::LControl, Keycode::RControl]
            }
            "shift" => vec![Keycode::LShift, Keycode::RShift],
            "alt" | "option" => vec![Keycode::LAlt, Keycode::RAlt],
            "meta" | "win" | "windows" | "super" | "command" | "cmd" => vec![Keycode::Meta],
            other => {
                let upper = other.to_ascii_uppercase();
                if upper.len() == 1 {
                    let ch = upper.chars().next().unwrap();
                    if (b'A'..=b'Z').contains(&(ch as u8)) {
                        let key = match ch {
                            'A' => Keycode::A,
                            'B' => Keycode::B,
                            'C' => Keycode::C,
                            'D' => Keycode::D,
                            'E' => Keycode::E,
                            'F' => Keycode::F,
                            'G' => Keycode::G,
                            'H' => Keycode::H,
                            'I' => Keycode::I,
                            'J' => Keycode::J,
                            'K' => Keycode::K,
                            'L' => Keycode::L,
                            'M' => Keycode::M,
                            'N' => Keycode::N,
                            'O' => Keycode::O,
                            'P' => Keycode::P,
                            'Q' => Keycode::Q,
                            'R' => Keycode::R,
                            'S' => Keycode::S,
                            'T' => Keycode::T,
                            'U' => Keycode::U,
                            'V' => Keycode::V,
                            'W' => Keycode::W,
                            'X' => Keycode::X,
                            'Y' => Keycode::Y,
                            'Z' => Keycode::Z,
                            _ => unreachable!(),
                        };
                        vec![key]
                    } else {
                        return Err(format!("Неизвестная клавиша в горячей клавише: {other}"));
                    }
                } else if upper.starts_with('F') {
                    match upper.as_str() {
                        "F1" => vec![Keycode::F1],
                        "F2" => vec![Keycode::F2],
                        "F3" => vec![Keycode::F3],
                        "F4" => vec![Keycode::F4],
                        "F5" => vec![Keycode::F5],
                        "F6" => vec![Keycode::F6],
                        "F7" => vec![Keycode::F7],
                        "F8" => vec![Keycode::F8],
                        "F9" => vec![Keycode::F9],
                        "F10" => vec![Keycode::F10],
                        "F11" => vec![Keycode::F11],
                        "F12" => vec![Keycode::F12],
                        _ => {
                            return Err(format!(
                                "Поддерживаются функциональные клавиши F1-F12, но получено: {other}"
                            ));
                        }
                    }
                } else {
                    return Err(format!("Неизвестная клавиша в горячей клавише: {other}"));
                }
            }
        };

        result.push(alternatives);
    }

    if result.is_empty() {
        return Err("Горячая клавиша не указана".to_string());
    }

    Ok(result)
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ActivationMode {
    Toggle,
    Hold,
}

fn default_activation_mode() -> ActivationMode {
    ActivationMode::Toggle
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RadialConfig {
    pub radius: f64,
    pub item_size: f64,
    pub spacing: f64,
    #[serde(default = "default_shortcut")]
    pub shortcut: String,
    #[serde(default = "default_activation_mode")]
    pub activation_mode: ActivationMode,
    pub items: Vec<MenuItem>,
}

impl Default for RadialConfig {
    fn default() -> Self {
        Self {
            radius: 140.0,
            item_size: 56.0,
            spacing: 10.0,
            shortcut: default_shortcut(),
            activation_mode: default_activation_mode(),
            items: vec![
                MenuItem {
                    id: "item-1".into(),
                    label: "Browser".into(),
                    command: Some("https://www.rust-lang.org".into()),
                    color: Some("#8ecae6".into()),
                },
                MenuItem {
                    id: "item-2".into(),
                    label: "Editor".into(),
                    command: None,
                    color: Some("#ffb703".into()),
                },
                MenuItem {
                    id: "item-3".into(),
                    label: "Terminal".into(),
                    command: None,
                    color: Some("#fb8500".into()),
                },
            ],
        }
    }
}

fn default_shortcut() -> String {
    normalize_shortcut("Alt+Q")
}

fn normalize_shortcut(input: &str) -> String {
    let mut parts: Vec<String> = Vec::new();

    for raw_part in input.split('+') {
        let trimmed = raw_part.trim();
        if trimmed.is_empty() {
            continue;
        }

        let lower = trimmed.to_lowercase();
        let normalized = match lower.as_str() {
            "ctrl" | "control" => "Ctrl".to_string(),
            "command" | "cmd" => "Command".to_string(),
            "commandorcontrol" => "CommandOrControl".to_string(),
            "alt" | "option" => "Alt".to_string(),
            "shift" => "Shift".to_string(),
            "super" | "win" | "windows" | "meta" => "Super".to_string(),
            value if value.len() == 1 => value
                .chars()
                .next()
                .map(|c| c.to_ascii_uppercase().to_string())
                .unwrap_or_default(),
            value if value.starts_with('f') && value[1..].chars().all(|c| c.is_ascii_digit()) => {
                value.to_ascii_uppercase()
            }
            value => {
                let mut chars = value.chars();
                match chars.next() {
                    Some(first) => {
                        let mut result = String::new();
                        result.push(first.to_ascii_uppercase());
                        result.push_str(chars.as_str());
                        result
                    }
                    None => String::new(),
                }
            }
        };

        if !normalized.is_empty() {
            parts.push(normalized);
        }
    }

    parts.join("+")
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("failed to determine config directory")]
    MissingConfigDir,
    #[error("failed to read config file: {0}")]
    Read(std::io::Error),
    #[error("failed to write config file: {0}")]
    Write(std::io::Error),
    #[error("failed to parse config json: {0}")]
    Parse(serde_json::Error),
}

type Result<T> = std::result::Result<T, ConfigError>;

fn config_path() -> Result<PathBuf> {
    let proj_dirs = ProjectDirs::from("com", "Cascade", "radial-menu-tauri")
        .ok_or(ConfigError::MissingConfigDir)?;
    let config_dir = proj_dirs.config_dir();
    if !config_dir.exists() {
        fs::create_dir_all(config_dir).map_err(ConfigError::Write)?;
    }
    Ok(config_dir.join("config.json"))
}

fn load_config_inner() -> Result<RadialConfig> {
    let path = config_path()?;
    if !path.exists() {
        println!("Конфигурация отсутствует, используем значения по умолчанию");
        return Ok(RadialConfig::default());
    }

    let contents = fs::read_to_string(path).map_err(ConfigError::Read)?;
    let mut config: RadialConfig = serde_json::from_str(&contents).map_err(ConfigError::Parse)?;

    let mut shortcut_changed = false;
    let trimmed = config.shortcut.trim();
    if trimmed.is_empty() {
        config.shortcut = default_shortcut();
        shortcut_changed = true;
    } else if trimmed.eq_ignore_ascii_case("Ctrl+Shift+R") {
        config.shortcut = default_shortcut();
        shortcut_changed = true;
    }

    let normalized = normalize_shortcut(&config.shortcut);
    if normalized.is_empty() {
        config.shortcut = default_shortcut();
        shortcut_changed = true;
    } else if normalized != config.shortcut {
        config.shortcut = normalized;
        shortcut_changed = true;
    }

    if shortcut_changed {
        save_config_inner(config.clone())?;
    }

    println!(
        "Конфигурация загружена: радиус={} предметов={} shortcut={}",
        config.radius,
        config.items.len(),
        config.shortcut
    );
    Ok(config)
}

fn save_config_inner(config: RadialConfig) -> Result<()> {
    let path = config_path()?;
    let json = serde_json::to_string_pretty(&config).map_err(ConfigError::Parse)?;
    fs::write(path, json).map_err(ConfigError::Write)?;
    Ok(())
}

#[derive(Debug, Serialize)]
struct HoldShortcutPayload {
    active: bool,
    shortcut: String,
}

#[derive(Clone)]
struct HoldRuntime {
    run_flag: Arc<AtomicBool>,
    active: Arc<AtomicBool>,
    required_keys: Arc<Vec<Vec<Keycode>>>,
}

impl HoldRuntime {
    fn new(required_keys: Vec<Vec<Keycode>>) -> Self {
        Self {
            run_flag: Arc::new(AtomicBool::new(true)),
            active: Arc::new(AtomicBool::new(false)),
            required_keys: Arc::new(required_keys),
        }
    }

    fn stop(&self) {
        self.run_flag.store(false, Ordering::SeqCst);
    }
}

struct RegisteredShortcut {
    shortcut: String,
    mode: ActivationMode,
    hold_runtime: Option<HoldRuntime>,
}

struct ShortcutState(Mutex<Option<RegisteredShortcut>>);

impl Default for ShortcutState {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

fn register_shortcut_inner(
    app_handle: &AppHandle,
    state: &ShortcutState,
    shortcut: String,
    activation_mode: ActivationMode,
) -> std::result::Result<(), String> {
    let trimmed = shortcut.trim();
    if trimmed.is_empty() {
        return Err("Горячая клавиша не указана".to_string());
    }

    let normalized = normalize_shortcut(trimmed);
    if normalized.is_empty() {
        return Err("Горячая клавиша не указана".to_string());
    }

    let mut guard = state
        .0
        .lock()
        .map_err(|_| "Не удалось получить доступ к состоянию горячей клавиши".to_string())?;

    if let Some(RegisteredShortcut {
        shortcut: current_shortcut,
        mode: current_mode,
        ..
    }) = guard.as_ref()
    {
        if current_shortcut == &normalized && *current_mode == activation_mode {
            return Ok(());
        }
    }

    let mut manager = app_handle.global_shortcut_manager();

    if let Some(previous) = guard.take() {
        let _ = manager.unregister(&previous.shortcut);
        if let Some(runtime) = previous.hold_runtime {
            runtime.stop();
        }
    }

    let app_clone = app_handle.clone();
    let shortcut_string = normalized.clone();
    let activation_mode_for_closure = activation_mode;
    let app_clone_for_closure = app_clone.clone();
    let shortcut_for_closure = shortcut_string.clone();

    let hold_runtime = if activation_mode == ActivationMode::Hold {
        let required_keys = shortcut_to_required_keys(&shortcut_string)?;
        Some(HoldRuntime::new(required_keys))
    } else {
        None
    };

    let hold_runtime_for_closure = hold_runtime.clone();
    let hold_runtime_for_thread = hold_runtime.clone();

    println!("Регистрация глобальной клавиши: {shortcut_string}");

    manager
        .register(shortcut_string.as_str(), move || {
            println!("Горячая клавиша сработала");
            let overlay = app_clone_for_closure.get_window("overlay");
            let main_window = app_clone_for_closure.get_window("main");

            match activation_mode_for_closure {
                ActivationMode::Toggle => {
                    if let Some(overlay_window) = overlay {
                        let currently_visible = overlay_window.is_visible().unwrap_or(false);
                        println!("Overlay-visible: {currently_visible}");
                        if currently_visible {
                            let _ = overlay_window.hide();
                            if let Some(main) = &main_window {
                                let _ = main.emit("radial-shortcut-toggle", &false);
                            }
                        } else {
                            let _ = overlay_window.show();
                            let _ = overlay_window.set_focus();
                            println!("Overlay показан");
                            if let Some(main) = &main_window {
                                let _ = main.emit("radial-shortcut-toggle", &true);
                            }
                        }
                    } else if let Some(main) = main_window {
                        let currently_visible = main.is_visible().unwrap_or(false);
                        println!("Fallback main window toggle: {currently_visible}");
                        if currently_visible {
                            let _ = main.hide();
                            let _ = main.emit("radial-shortcut-toggle", &false);
                        } else {
                            let _ = main.show();
                            let _ = main.set_focus();
                            let _ = main.emit("radial-shortcut-toggle", &true);
                        }
                    }
                }
                ActivationMode::Hold => {
                    let already_active = hold_runtime_for_closure
                        .as_ref()
                        .map(|runtime| runtime.active.swap(true, Ordering::SeqCst))
                        .unwrap_or(false);

                    if !already_active {
                        if let Some(overlay_window) = overlay {
                            let _ = overlay_window.show();
                            let _ = overlay_window.set_focus();
                            println!("Overlay показан (режим удержания)");
                            let _ = overlay_window.emit(
                                "radial-shortcut-hold",
                                &HoldShortcutPayload {
                                    active: true,
                                    shortcut: shortcut_for_closure.clone(),
                                },
                            );
                        }
                    }
                    if let Some(main) = &main_window {
                        let _ = main.emit("radial-shortcut-toggle", &true);
                    }
                }
            }
        })
        .map_err(|err| format!("Не удалось зарегистрировать горячую клавишу: {err}"))?;

    if let Some(runtime) = hold_runtime_for_thread {
        let app_for_thread = app_clone.clone();
        let shortcut_for_thread = shortcut_string.clone();
        thread::spawn(move || {
            let device_state = DeviceState::new();
            while runtime.run_flag.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(30));

                if !runtime.active.load(Ordering::SeqCst) {
                    continue;
                }

                let pressed: HashSet<Keycode> = device_state.get_keys().into_iter().collect();
                let all_pressed = runtime
                    .required_keys
                    .iter()
                    .all(|alternatives| alternatives.iter().any(|key| pressed.contains(key)));

                if !all_pressed {
                    if runtime.active.swap(false, Ordering::SeqCst) {
                        if let Some(overlay) = app_for_thread.get_window("overlay") {
                            let _ = overlay.hide();
                            let _ = overlay.emit(
                                "radial-shortcut-hold",
                                &HoldShortcutPayload {
                                    active: false,
                                    shortcut: shortcut_for_thread.clone(),
                                },
                            );
                        }
                        if let Some(main) = app_for_thread.get_window("main") {
                            let _ = main.emit("radial-shortcut-toggle", &false);
                        }
                    }
                }
            }
        });
    }

    *guard = Some(RegisteredShortcut {
        shortcut: shortcut_string.clone(),
        mode: activation_mode,
        hold_runtime,
    });
    println!("Глобальная горячая клавиша успешно зарегистрирована");
    Ok(())
}

#[tauri::command]
fn load_config() -> std::result::Result<RadialConfig, String> {
    load_config_inner().map_err(|err| err.to_string())
}

#[tauri::command]
fn save_config(
    app_handle: tauri::AppHandle,
    config: RadialConfig,
) -> std::result::Result<(), String> {
    let mut normalized_config = config;
    let normalized_shortcut = normalize_shortcut(&normalized_config.shortcut);
    if normalized_shortcut.is_empty() {
        return Err("Горячая клавиша не указана".to_string());
    }

    normalized_config.shortcut = normalized_shortcut;
    save_config_inner(normalized_config.clone()).map_err(|err| err.to_string())?;

    if let Some(overlay) = app_handle.get_window("overlay") {
        let _ = overlay.emit("config-updated", &normalized_config);
    }

    Ok(())
}

#[tauri::command]
fn register_shortcut(
    app_handle: tauri::AppHandle,
    shortcut_state: State<ShortcutState>,
    shortcut: String,
    activation_mode: ActivationMode,
) -> std::result::Result<(), String> {
    register_shortcut_inner(&app_handle, &shortcut_state, shortcut, activation_mode)
}

#[tauri::command]
fn execute_command(_app_handle: tauri::AppHandle, command: String) -> std::result::Result<(), String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("Команда не указана".to_string());
    }

    if trimmed.contains("://") {
        return webbrowser::open(trimmed)
            .map(|_| ())
            .map_err(|err| format!("Не удалось открыть ссылку: {err}"));
    }

    let parts = shell_words::split(trimmed)
        .map_err(|err| format!("Не удалось разобрать команду: {err}"))?;

    let (program, args) = parts
        .split_first()
        .ok_or_else(|| "Не удалось разобрать команду".to_string())?;

    Command::new(program)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("Не удалось выполнить команду: {err}"))
}

fn main() {
    tauri::Builder::default()
        .manage(ShortcutState::default())
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            register_shortcut,
            execute_command
        ])
        .setup(|app| {
            // Ensure config file exists with defaults during first launch
            if let Ok(path) = config_path() {
                if !path.exists() {
                    if let Ok(json) = serde_json::to_string_pretty(&RadialConfig::default()) {
                        if let Err(err) = fs::write(path, json) {
                            let _ = tauri::api::dialog::message(
                                Some(&app.get_window("main").unwrap()),
                                "Ошибка",
                                format!("Не удалось записать конфигурацию: {err}"),
                            );
                        }
                    }
                }
            }

            // Create overlay window used for the radial menu invocation
            let overlay_window = WindowBuilder::new(
                app,
                "overlay",
                WindowUrl::App("overlay.html".into()),
            )
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .resizable(false)
            .visible(false)
            .skip_taskbar(true)
            .inner_size(520.0, 520.0)
            .build()
            .map_err(|err| {
                tauri::api::dialog::message::<tauri::Wry>(
                    None,
                    "Ошибка окна",
                    format!("Не удалось создать окно радиального меню: {err}"),
                );
                err
            })?;

            println!("Оверлейное окно создано");

            let _ = overlay_window.center();

            let shortcut_state: State<ShortcutState> = app.state();
            let initial_config = load_config_inner().unwrap_or_else(|_| RadialConfig::default());
            let initial_shortcut = initial_config.shortcut.clone();
            let initial_mode = initial_config.activation_mode;

            if let Err(err) =
                register_shortcut_inner(&app.handle(), &shortcut_state, initial_shortcut, initial_mode)
            {
                if let Some(window) = app.get_window("main") {
                    let _ = tauri::api::dialog::message(
                        Some(&window),
                        "Ошибка горячей клавиши",
                        format!("Не удалось зарегистрировать горячую клавишу: {err}"),
                    );
                } else {
                    let _ = tauri::api::dialog::message::<tauri::Wry>(
                        None,
                        "Ошибка горячей клавиши",
                        format!("Не удалось зарегистрировать горячую клавишу: {err}"),
                    );
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
