mod commands;
mod models;
mod services;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| commands::init(app).map_err(|err| err.into()))
        .invoke_handler(tauri::generate_handler![
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::settings::add_profile,
            commands::settings::reset_settings,
            commands::system::run_pie_menu
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
