mod commands;
mod domain;
mod models;
mod services;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::<tauri::Wry>::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Initialize commands/state
            commands::init(app)?;

            // Create a basic tray icon for desktop platforms
            #[cfg(not(mobile))]
            {
                use tauri::tray::TrayIconBuilder;
                // Create tray without custom icon to avoid PNG decoding in dev; system will use app icon
                let _ = TrayIconBuilder::new().tooltip("AutoHotPie").build(app);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::actions::list_actions,
            commands::actions::recent_action_events,
            commands::actions::save_actions,
            commands::actions::run_action,
            commands::actions::test_action,
            commands::import_export::export_profiles,
            commands::import_export::import_profiles,
            commands::import_export::save_export_bundle,
            commands::profiles::list_profiles,
            commands::profiles::get_profile,
            commands::profiles::save_profile,
            commands::profiles::delete_profile,
            commands::profiles::activate_profile,
            commands::profiles::create_profile,
            commands::profiles::open_profiles_backups,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::settings::add_profile,
            commands::settings::reset_settings,
            commands::hotkeys::register_hotkey,
            commands::hotkeys::unregister_hotkey,
            commands::hotkeys::list_hotkeys,
            commands::hotkeys::check_hotkey,
            commands::autostart::get_autostart_status,
            commands::autostart::set_autostart_enabled,
            commands::autostart::open_autostart_location,
            commands::radial_overlay::radial_overlay_toggle,
            commands::radial_overlay::radial_overlay_select_item,
            commands::radial_overlay::radial_overlay_notify_hidden,
            commands::radial_overlay::radial_overlay_get_config,
            commands::radial_overlay::radial_overlay_update_config,
            commands::system::run_pie_menu,
            commands::system::system_get_status,
            commands::system::get_active_profile,
            commands::resolve_active_profile,
            commands::system::subscribe_action_events,
            commands::system::get_version,
            commands::system::open_logs,
            commands::logs::open_latest_log,
            commands::updates::get_update_status,
            commands::updates::check_updates,
            commands::localization::list_localization_languages,
            commands::localization::get_localization_pack,
            commands::localization::refresh_localization_packs
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|_, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            commands::shutdown();
        }
    });
}
