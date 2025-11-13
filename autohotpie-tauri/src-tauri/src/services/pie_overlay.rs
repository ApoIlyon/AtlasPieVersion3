use anyhow::Context;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, Runtime, Url, WebviewUrl, WebviewWindowBuilder};

pub const WINDOW_LABEL: &str = "pie-overlay";
const STATE_EVENT: &str = "pie-overlay://state";
const SELECT_EVENT: &str = "pie-overlay://select";
const FOCUS_EVENT: &str = "pie-overlay://focus";
const HIDDEN_EVENT: &str = "pie-overlay://hidden";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PieOverlaySlice {
    pub id: String,
    pub label: String,
    pub order: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accent_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PieOverlayState {
    pub visible: bool,
    #[serde(default)]
    pub slices: Vec<PieOverlaySlice>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_slice_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub center_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_accelerator: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activation_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PieOverlayUpdate {
    #[serde(default)]
    pub slices: Option<Vec<PieOverlaySlice>>,
    #[serde(default)]
    pub active_slice_id: Option<Option<String>>,
    #[serde(default)]
    pub center_label: Option<Option<String>>,
    #[serde(default)]
    pub trigger_accelerator: Option<Option<String>>,
    #[serde(default)]
    pub activation_mode: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PieOverlayInteraction {
    pub slice_id: String,
}

#[derive(Default)]
pub struct PieOverlayStore {
    state: Mutex<PieOverlayState>,
    ready: AtomicBool,
}

impl PieOverlayStore {
    pub fn mark_ready(&self) {
        self.ready.store(true, Ordering::SeqCst);
    }

    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::SeqCst)
    }

    pub fn replace(&self, state: PieOverlayState) -> PieOverlayState {
        let mut guard = self.state.lock();
        *guard = state;
        guard.clone()
    }

    pub fn update<F>(&self, mut f: F) -> PieOverlayState
    where
        F: FnMut(&mut PieOverlayState),
    {
        let mut guard = self.state.lock();
        f(&mut guard);
        guard.clone()
    }

    pub fn snapshot(&self) -> PieOverlayState {
        self.state.lock().clone()
    }
}

pub fn init<R: Runtime>(app: &AppHandle<R>) -> anyhow::Result<()> {
    if app.try_state::<PieOverlayStore>().is_none() {
        app.manage(PieOverlayStore::default());
    }

    ensure_window(app)?;
    Ok(())
}

pub fn mark_ready<R: Runtime>(app: &AppHandle<R>, store: &PieOverlayStore) -> anyhow::Result<()> {
    store.mark_ready();
    ensure_window(app)?;
    let state = store.snapshot();
    emit_state(app, &state)?;
    Ok(())
}

pub fn show<R: Runtime>(
    app: &AppHandle<R>,
    store: &PieOverlayStore,
    mut state: PieOverlayState,
) -> anyhow::Result<()> {
    state.visible = true;
    let state = store.replace(state);
    ensure_window(app)?;
    if store.is_ready() {
        emit_state(app, &state)?;
    }

    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.set_always_on_top(true);
        window
            .show()
            .context("failed to show pie overlay window")?;
        #[cfg(not(target_os = "linux"))]
        {
            let _ = window.set_ignore_cursor_events(false);
        }
    }

    Ok(())
}

pub fn hide<R: Runtime>(app: &AppHandle<R>, store: &PieOverlayStore) -> anyhow::Result<()> {
    let state = store.update(|current| {
        current.visible = false;
    });

    if store.is_ready() {
        emit_state(app, &state)?;
    }

    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        #[cfg(not(target_os = "linux"))]
        {
            let _ = window.set_ignore_cursor_events(true);
        }
        let _ = window.hide();
    }

    let _ = app.emit_to("main", HIDDEN_EVENT, state.clone());

    Ok(())
}

pub fn sync<R: Runtime>(
    app: &AppHandle<R>,
    store: &PieOverlayStore,
    update: PieOverlayUpdate,
) -> anyhow::Result<()> {
    let slices_update = update.slices.clone();
    let active_slice_update = update.active_slice_id.clone();
    let center_label_update = update.center_label.clone();

    let state = store.update(|current| {
        if let Some(slices) = &slices_update {
            current.slices = slices.clone();
        }
        if let Some(active_slice_id) = &active_slice_update {
            current.active_slice_id = active_slice_id.clone();
        }
        if let Some(center_label) = &center_label_update {
            current.center_label = center_label.clone();
        }
        if let Some(trigger) = &update.trigger_accelerator {
            current.trigger_accelerator = trigger.clone();
        }
        if let Some(mode) = &update.activation_mode {
            current.activation_mode = mode.clone();
        }
    });

    if store.is_ready() {
        emit_state(app, &state)?;
    }

    Ok(())
}

pub fn forward_select<R: Runtime>(
    app: &AppHandle<R>,
    payload: PieOverlayInteraction,
) -> anyhow::Result<()> {
    app.emit_to("main", SELECT_EVENT, payload)
        .context("failed to emit pie overlay select event")
}

pub fn forward_focus<R: Runtime>(
    app: &AppHandle<R>,
    payload: PieOverlayInteraction,
) -> anyhow::Result<()> {
    app.emit_to("main", FOCUS_EVENT, payload)
        .context("failed to emit pie overlay focus event")
}

fn emit_state<R: Runtime>(app: &AppHandle<R>, state: &PieOverlayState) -> anyhow::Result<()> {
    app.emit_to(WINDOW_LABEL, STATE_EVENT, state.clone())
        .context("failed to emit pie overlay state")
}

fn ensure_window<R: Runtime>(app: &AppHandle<R>) -> anyhow::Result<()> {
    if app.get_webview_window(WINDOW_LABEL).is_some() {
        return Ok(());
    }

    let url = if cfg!(debug_assertions) {
        let dev_url = app
            .config()
            .build
            .dev_url
            .clone()
            .unwrap_or_else(|| Url::parse("http://127.0.0.1:3000").expect("valid default dev url"));
        let mut base = dev_url.to_string();
        if !base.ends_with('/') {
            base.push('/');
        }
        let full = Url::parse(&format!("{base}pie-overlay.html"))
            .context("invalid dev url for pie overlay")?;
        WebviewUrl::External(full)
    } else {
        WebviewUrl::App("pie-overlay.html".into())
    };

    let mut builder = WebviewWindowBuilder::new(app, WINDOW_LABEL, url)
        .visible(false)
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .accept_first_mouse(true)
        .shadow(false)
        .focused(false)
        .always_on_top(true);

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        builder = builder.transparent(true);
    }

    #[cfg(all(target_os = "macos", feature = "macos-private-api"))]
    {
        builder = builder.transparent(true);
    }

    let window = builder
        .title("Pie Menu")
        .inner_size(520.0, 520.0)
        .build()
        .context("failed to build pie overlay window")?;

    #[cfg(not(target_os = "linux"))]
    {
        let _ = window.set_ignore_cursor_events(true);
    }
    let _ = window.center();

    #[cfg(debug_assertions)]
    {
        let _ = window.open_devtools();
        let _ = window.set_focus();
    }

    Ok(())
}
