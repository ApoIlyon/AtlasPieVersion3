use tauri::{
    tray::{MouseButton, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("AutoHotPie Tauri")
        .icon_as_template(true)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(on_tray_event);

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app).map(|_| ())
}

fn on_tray_event<R: Runtime>(tray: &TrayIcon<R>, event: TrayIconEvent) {
    match event {
        TrayIconEvent::Click { button, .. } | TrayIconEvent::DoubleClick { button, .. } => {
            if matches!(button, MouseButton::Left) {
                show_main(tray);
            }
        }
        _ => {}
    }
}

fn show_main<R: Runtime>(tray: &TrayIcon<R>) {
    if let Some(window) = tray.app_handle().get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
