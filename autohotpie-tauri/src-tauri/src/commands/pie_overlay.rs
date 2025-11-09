use super::{AppError, Result};
use crate::services::pie_overlay::{
    forward_focus, forward_select, hide, mark_ready, show, sync, PieOverlayInteraction, PieOverlayState,
    PieOverlayStore, PieOverlayUpdate,
};
use tauri::{AppHandle, Runtime, State};

#[tauri::command]
pub fn pie_overlay_ready<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, PieOverlayStore>,
) -> Result<()> {
    mark_ready(&app, store.inner())
        .map_err(|err| AppError::Message(format!("failed to mark overlay ready: {err}")))
}

#[tauri::command]
pub fn pie_overlay_show<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, PieOverlayStore>,
    state: PieOverlayState,
) -> Result<()> {
    show(&app, store.inner(), state)
        .map_err(|err| AppError::Message(format!("failed to show pie overlay: {err}")))
}

#[tauri::command]
pub fn pie_overlay_hide<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, PieOverlayStore>,
) -> Result<()> {
    hide(&app, store.inner())
        .map_err(|err| AppError::Message(format!("failed to hide pie overlay: {err}")))
}

#[tauri::command]
pub fn pie_overlay_sync_state<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, PieOverlayStore>,
    update: PieOverlayUpdate,
) -> Result<()> {
    sync(&app, store.inner(), update)
        .map_err(|err| AppError::Message(format!("failed to sync pie overlay state: {err}")))
}

#[tauri::command]
pub fn pie_overlay_select_slice<R: Runtime>(
    app: AppHandle<R>,
    payload: PieOverlayInteraction,
) -> Result<()> {
    forward_select(&app, payload)
        .map_err(|err| AppError::Message(format!("failed to forward pie overlay selection: {err}")))
}

#[tauri::command]
pub fn pie_overlay_focus_slice<R: Runtime>(
    app: AppHandle<R>,
    payload: PieOverlayInteraction,
) -> Result<()> {
    forward_focus(&app, payload)
        .map_err(|err| AppError::Message(format!("failed to forward pie overlay focus: {err}")))
}
