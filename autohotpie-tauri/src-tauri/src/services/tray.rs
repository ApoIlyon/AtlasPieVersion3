#[cfg(feature = "tray-icon")]
use tauri::{
    tray::{MouseButton, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

#[cfg(all(feature = "tray-icon", target_os = "macos"))]
use tauri::menu::{MenuBuilder, MenuItemBuilder};

#[cfg(all(feature = "tray-icon", target_os = "macos"))]
const MENU_TOGGLE_ID: &str = "menu.toggle-pie";

#[cfg(feature = "tray-icon")]
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    #[cfg(all(feature = "tray-icon", target_os = "macos"))]
    setup_menu_bar(app)?;

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

#[cfg(feature = "tray-icon")]
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

#[cfg(feature = "tray-icon")]
fn show_main<R: Runtime>(tray: &TrayIcon<R>) {
    if let Some(window) = tray.app_handle().get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(all(feature = "tray-icon", target_os = "macos"))]
fn setup_menu_bar<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let toggle_item = MenuItemBuilder::new("Toggle Pie Menu")
        .id(MENU_TOGGLE_ID)
        .accelerator("Command+Shift+P")?
        .build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&toggle_item)?
        .build()?;

    app.set_menu(menu)?;
    app.on_menu_event(|handle, event| {
        if event.id().as_ref() == MENU_TOGGLE_ID {
            let _ = handle.emit("hotkeys://trigger", ());
        }
    });

    Ok(())
}
