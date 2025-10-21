use super::{AppError, AppState, Result};
use crate::domain::profile::ProfileId;
use crate::domain::validation::validate_profile;
use crate::services::profile_router;
use crate::storage::profile_repository::{ProfileRecord, ProfileStore};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, State};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

const PROFILES_STORE_EVENT: &str = "profiles://store-changed";

#[tauri::command]
pub fn list_profiles(state: State<'_, AppState>) -> Result<ProfileStore> {
    state.profiles_snapshot()
}

#[tauri::command]
pub fn get_profile(state: State<'_, AppState>, profile_id: String) -> Result<Option<ProfileRecord>> {
    let id = parse_profile_id(&profile_id)?;
    let store = state.profiles_snapshot()?;
    Ok(store
        .profiles
        .into_iter()
        .find(|record| record.profile.id == id))
}

#[tauri::command]
pub fn save_profile(
    app: AppHandle,
    state: State<'_, AppState>,
    mut record: ProfileRecord,
) -> Result<ProfileRecord> {
    record = normalize_record(record)?;
    let actions = state.actions_snapshot();
    if let Err(errors) = validate_profile(&record.profile, &record.menus, &actions) {
        let payload = json!({
            "kind": "profile-validation",
            "errors": errors.into_iter().map(|err| err.to_string()).collect::<Vec<_>>(),
        });
        return Err(AppError::Message(payload.to_string()));
    }
    let updated = state.with_profiles_mut(|store| {
        upsert_record(store, record.clone())?;
        Ok(record.clone())
    })?;
    emit_profiles_changed(&app, &state)?;
    Ok(updated)
}

#[tauri::command]
pub fn delete_profile(
    app: AppHandle,
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<()> {
    let id = parse_profile_id(&profile_id)?;
    state.with_profiles_mut(|store| remove_record(store, id))?;
    emit_profiles_changed(&app, &state)?;
    Ok(())
}

#[tauri::command]
pub fn activate_profile(
    app: AppHandle,
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<()> {
    let id = parse_profile_id(&profile_id)?;
    state.with_profiles_mut(|store| {
        if !store.profiles.iter().any(|record| record.profile.id == id) {
            return Err(AppError::Message(format!("profile {id} not found")));
        }
        store.active_profile_id = Some(id);
        Ok(())
    })?;
    emit_profiles_changed(&app, &state)?;
    profile_router::resolve_now(&app)
        .map(|_| ())
        .map_err(|err| AppError::Message(err.to_string()))
}

fn emit_profiles_changed(app: &AppHandle, state: &State<'_, AppState>) -> Result<()> {
    let snapshot = state.profiles_snapshot()?;
    app.emit(PROFILES_STORE_EVENT, snapshot)
        .map_err(|err| AppError::Message(format!("failed to emit profiles change: {err}")))
}

fn parse_profile_id(raw: &str) -> Result<ProfileId> {
    let uuid = Uuid::parse_str(raw)
        .map_err(|err| AppError::Message(format!("invalid profile id '{raw}': {err}")))?;
    Ok(ProfileId::from(uuid))
}

fn normalize_record(mut record: ProfileRecord) -> Result<ProfileRecord> {
    if !record
        .menus
        .iter()
        .any(|menu| menu.id == record.profile.root_menu)
    {
        return Err(AppError::Message(
            "profile payload missing root menu definition".into(),
        ));
    }

    // Ensure timestamps are present.
    let now = OffsetDateTime::now_utc();
    let timestamp = format_timestamp(now);
    if record.created_at.is_none() {
        record.created_at = Some(timestamp.clone());
    }
    record.updated_at = Some(timestamp);
    Ok(record)
}

fn upsert_record(store: &mut ProfileStore, record: ProfileRecord) -> Result<()> {
    let id = record.profile.id;
    if let Some(existing) = store
        .profiles
        .iter_mut()
        .find(|item| item.profile.id == id)
    {
        let created_at = existing.created_at.clone();
        *existing = record;
        existing.created_at = created_at;
        return Ok(());
    }

    store.profiles.push(record);
    if store.active_profile_id.is_none() {
        if let Some(first) = store.profiles.first() {
            store.active_profile_id = Some(first.profile.id);
        }
    }
    Ok(())
}

fn remove_record(store: &mut ProfileStore, id: ProfileId) -> Result<()> {
    let len_before = store.profiles.len();
    store.profiles.retain(|record| record.profile.id != id);
    if store.profiles.len() == len_before {
        return Err(AppError::Message(format!("profile {id} not found")));
    }
    if store.active_profile_id == Some(id) {
        store.active_profile_id = store.profiles.first().map(|record| record.profile.id);
    }
    Ok(())
}

fn format_timestamp(moment: OffsetDateTime) -> String {
    moment
        .format(&Rfc3339)
        .unwrap_or_else(|_| moment.to_string())
}
