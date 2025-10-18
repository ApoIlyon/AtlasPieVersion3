mod commands;
mod domain;
mod models;
mod services;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| commands::init(app).map_err(|err| err.into()))
        .invoke_handler(tauri::generate_handler![
            commands::actions::list_actions,
            commands::actions::save_actions,
            commands::actions::run_action,
            commands::actions::test_action,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::settings::add_profile,
            commands::settings::reset_settings,
            commands::hotkeys::register_hotkey,
            commands::hotkeys::unregister_hotkey,
            commands::hotkeys::list_hotkeys,
            commands::hotkeys::check_hotkey,
            commands::system::run_pie_menu,
            commands::system::system_get_status,
            commands::system::get_active_profile,
            commands::system::get_version,
            commands::system::open_logs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
