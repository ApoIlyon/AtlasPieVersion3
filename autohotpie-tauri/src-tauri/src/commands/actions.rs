use super::{AppError, AppState, Result};
use crate::domain::{Action, ActionId};
use crate::services::action_runner::ActionEventPayload;
use tauri::{AppHandle, State};

fn action_not_found(id: &ActionId) -> AppError {
    AppError::Message(format!("action {id} not found"))
}

#[tauri::command]
pub fn list_actions(state: State<'_, AppState>) -> Result<Vec<Action>> {
    Ok(state.actions_snapshot())
}

#[tauri::command]
pub fn save_actions(
    app: AppHandle,
    state: State<'_, AppState>,
    actions: Vec<Action>,
) -> Result<Vec<Action>> {
    state.storage.save_actions(&actions)?;
    state.replace_actions(actions.clone());
    state.audit.log("INFO", "Actions saved")?;
    Ok(actions)
}

#[tauri::command]
pub async fn run_action(
    state: State<'_, AppState>,
    action_id: ActionId,
) -> Result<ActionEventPayload> {
    let action = state
        .lookup_action(&action_id)
        .ok_or_else(|| action_not_found(&action_id))?;
    state.action_runner.run(&action, state.inner()).await
}

#[tauri::command]
pub async fn test_action(
    state: State<'_, AppState>,
    action: Action,
) -> Result<ActionEventPayload> {
    // Test mode executes the provided action without persisting it.
    state.action_runner.run(&action, state.inner()).await
}
