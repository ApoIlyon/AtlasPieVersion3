#[cfg(feature = "tray-icon")]
use tauri::{
    menu::{IconMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{ClickType, MouseButton, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

#[cfg(feature = "tray-icon")]
use crate::{
    commands::{self, profiles::ProfileStore},
    services::profile_router,
    storage::profile_repository::ProfileId,
};

#[cfg(feature = "tray-icon")]
use std::sync::Arc;

#[cfg(feature = "tray-icon")]
use tauri::async_runtime::Mutex;

#[cfg(all(feature = "tray-icon", target_os = "macos"))]
const MENU_TOGGLE_ID: &str = "menu.toggle-pie";

#[cfg(feature = "tray-icon")]
const PROFILE_SUBMENU_ID: &str = "tray.profiles";

#[cfg(feature = "tray-icon")]
const PROFILE_MENU_PREFIX: &str = "tray.profile.";

#[cfg(feature = "tray-icon")]
const PROFILE_REFRESH_ID: &str = "tray.profiles.refresh";

#[cfg(feature = "tray-icon")]
const PROFILE_OPEN_APP_ID: &str = "tray.profiles.open-app";

#[cfg(feature = "tray-icon")]
static TRAY_STATE: once_cell::sync::Lazy<Arc<Mutex<Option<TrayController>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(None)));

#[cfg(all(feature = "tray-icon", target_os = "macos"))]
static MENU_ICON_STATE: once_cell::sync::Lazy<Arc<Mutex<MenuIconState>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(MenuIconState::default())));

#[cfg(all(feature = "tray-icon", target_os = "macos"))]
#[derive(Default)]
struct MenuIconState {
    active: bool,
}

#[cfg(all(feature = "tray-icon", target_os = "macos"))]
use serde_json::json;

#[cfg(feature = "tray-icon")]
pub async fn ensure_tray_state<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let mut guard = TRAY_STATE.lock().await;
    if guard.is_some() {
        return Ok(());
    }
    *guard = Some(TrayController::new(app.clone()));
    Ok(())
}

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

    #[cfg(feature = "tray-icon")]
    fn handle_menu_event<R: Runtime>(tray: &TrayIcon<R>, event: tauri::menu::MenuEvent) {
        let id = event.id().as_ref().to_string();
        let app = tray.app_handle().clone();
        tauri::async_runtime::spawn(async move {
            if id == PROFILE_REFRESH_ID {
                if let Some(controller) = TRAY_STATE.lock().await.clone() {
                    if let Err(error) = controller.rebuild_menu(&app).await {
                        eprintln!("failed to refresh profile tray menu: {error}");
                    }
                }
                return;
            }

            if id == PROFILE_OPEN_APP_ID {
                show_main_for_handle(&app);
                return;
            }

            if let Some(stripped) = id.strip_prefix(PROFILE_MENU_PREFIX) {
                if let Ok(uuid) = uuid::Uuid::parse_str(stripped) {
                    let profile_id = ProfileId::from(uuid);
                    if let Err(error) = commands::profiles::activate_profile(
                        app.clone(),
                        app.state(),
                        uuid.to_string(),
                    ) {
                        eprintln!("failed to activate profile from tray: {error}");
                    }
                }
            }
        });
    }

    #[cfg(feature = "tray-icon")]
    fn show_main_for_handle<R: Runtime>(app: &AppHandle<R>) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }

    #[cfg(feature = "tray-icon")]
    struct TrayController {
        app_handle: AppHandle,
        cached_store: Arc<Mutex<Option<ProfileStore>>>,
    }

    #[cfg(feature = "tray-icon")]
    impl TrayController {
        fn new<R: Runtime>(app: AppHandle<R>) -> TrayController {
            TrayController {
                app_handle: app.app_handle().clone(),
                cached_store: Arc::new(Mutex::new(None)),
            }
        }

        async fn initialize<R: Runtime>(tray: &TrayIcon<R>) -> tauri::Result<()> {
            if let Some(controller) = TRAY_STATE.lock().await.clone() {
                controller.refresh_store().await?;
                let menu = controller.rebuild_menu(tray.app_handle()).await?;
                tray.set_menu(Some(menu))?;
            }

            #[cfg(target_os = "macos")]
            {
                let state = {
                    let guard = MENU_ICON_STATE.lock().await;
                    guard.active
                };
                update_menu_icon(tray, state);
                emit_menu_state(tray.app_handle(), state);
            }

            Ok(())
        }

        async fn refresh_store(&self) -> tauri::Result<()> {
            let state: tauri::State<'_, commands::AppState> = self.app_handle.state();
            let snapshot = state
                .profiles_snapshot()
                .map_err(|err| tauri::Error::Menu {
                    msg: err.to_string(),
                })?;
            let mut cached = self.cached_store.lock().await;
            *cached = Some(snapshot);
            Ok(())
        }

        async fn rebuild_menu<R: Runtime>(&self, app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
            let state = self.cached_store.lock().await.clone();
            let store = if let Some(store) = state {
                store
            } else {
                let state: tauri::State<'_, commands::AppState> = app.state();
                state
                    .profiles_snapshot()
                    .map_err(|err| tauri::Error::Menu {
                        msg: err.to_string(),
                    })?
            };

            let mut menu = MenuBuilder::new(app);
            let mut profiles_submenu = SubmenuBuilder::new(app, "Profiles");
            let active_id = store.active_profile_id;

            for record in &store.profiles {
                let mut item = IconMenuItemBuilder::with_id(format!(
                    "{PROFILE_MENU_PREFIX}{}",
                    record.profile.id
                ))
                .text(record.profile.name.clone());
                if Some(record.profile.id) == active_id {
                    item = item.selected(true);
                }
                profiles_submenu = profiles_submenu.item(&item.build(app)?);
            }

            let submenu = profiles_submenu
                .separator()
                .item(
                    &MenuItemBuilder::new("Open App")
                        .id(PROFILE_OPEN_APP_ID)
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::new("Refresh")
                        .id(PROFILE_REFRESH_ID)
                        .build(app)?,
                )
                .build()?;

            menu = menu.submenu(&submenu)?.separator();

            Ok(menu.build()?)
        }
    }

    builder = builder.on_menu_event(handle_menu_event);

    let tray_icon = builder.build(app)?;

    tauri::async_runtime::spawn(async move {
        if let Err(error) = ensure_tray_state(&tray_icon.app_handle())
            .await
            .and_then(|_| TrayController::initialize(&tray_icon).await)
        {
            eprintln!("failed to initialize tray menu: {error}");
        }
    });

    Ok(())
}

#[cfg(feature = "tray-icon")]
fn on_tray_event<R: Runtime>(tray: &TrayIcon<R>, event: TrayIconEvent) {
    match event {
        TrayIconEvent::Click {
            button,
            position,
            rect,
            event,
            ..
        } => {
            if matches!(button, MouseButton::Left) && matches!(event, ClickType::Single) {
                toggle_main_window(tray);
            } else if button == MouseButton::Right {
                tauri::async_runtime::block_on(async {
                    if let Some(controller) = TRAY_STATE.lock().await.clone() {
                        controller
                            .rebuild_menu(tray.app_handle())
                            .await
                            .ok()
                            .and_then(|menu| tray.set_menu(Some(menu)).ok());
                        let _ = tray.pop_up_menu(rect, position);
                    }
                });
            }
        }
        TrayIconEvent::DoubleClick { button, .. } => {
            if matches!(button, MouseButton::Left) {
                show_main(tray);
            }
        }
        _ => {}
    }
}

#[cfg(feature = "tray-icon")]
fn toggle_main_window<R: Runtime>(tray: &TrayIcon<R>) {
    if let Some(window) = tray.app_handle().get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(true);
        if is_visible {
            let _ = window.hide();
            #[cfg(target_os = "macos")]
            {
                emit_active(tray.app_handle(), false);
                update_menu_icon(tray, false);
            }
        } else {
            show_main(tray);
        }
    }
}

#[cfg(feature = "tray-icon")]
fn show_main<R: Runtime>(tray: &TrayIcon<R>) {
    if let Some(window) = tray.app_handle().get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        #[cfg(target_os = "macos")]
        {
            emit_active(tray.app_handle(), true);
            update_menu_icon(tray, true);
        }
    }
}

#[cfg(all(feature = "tray-icon", target_os = "macos"))]
fn setup_menu_bar<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let toggle_item = MenuItemBuilder::new("Toggle Pie Menu")
        .id(MENU_TOGGLE_ID)
        .accelerator("Command+Shift+P")?;

    let menu = MenuBuilder::new(app).item(&toggle_item)?.build()?;

    app.set_menu(menu)?;
    app.on_menu_event(|handle, event| {
        if event.id().as_ref() == MENU_TOGGLE_ID {
            let _ = handle.emit("hotkeys://trigger", ());
            emit_active(&handle.app_handle(), true);
            if let Some(tray) = handle.tray_handle().get("main") {
                update_menu_icon(&tray, true);
            }
        }
    });

    Ok(())
}

#[cfg(all(feature = "tray-icon", target_os = "macos"))]
fn emit_active<R: Runtime>(app: &AppHandle<R>, active: bool) {
    tauri::async_runtime::block_on(async {
        let mut state = MENU_ICON_STATE.lock().await;
        state.active = active;
    });
    emit_menu_state(app, active);
}

#[cfg(all(feature = "tray-icon", target_os = "macos"))]
fn emit_menu_state<R: Runtime>(app: &AppHandle<R>, active: bool) {
    let _ = app.emit("menu-bar://state", json!({ "active": active }));
}

#[cfg(all(feature = "tray-icon", target_os = "macos"))]
fn update_menu_icon<R: Runtime>(tray: &TrayIcon<R>, active: bool) {
    if let Some(icon) = tray.app_handle().default_window_icon() {
        let _ = tray.set_icon(Some(icon));
    }
    let _ = tray.set_icon_as_template(!active);
}
