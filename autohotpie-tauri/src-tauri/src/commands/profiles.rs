use super::{AppError, AppState, Result};
use crate::domain::profile::ProfileId;
use crate::domain::validation::{validate_profile, DomainValidationError};
use crate::services::profile_router;
use crate::storage::profile_repository::{ProfileRecord, ProfileStore};
use serde_json::json;
use tauri::{AppHandle, Emitter, State, Runtime};
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
pub fn save_profile<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    mut record: ProfileRecord,
) -> Result<ProfileRecord> {
    record = normalize_record(record)?;
    if let Err(errors) = validate_record(&record) {
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
pub fn delete_profile<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<()> {
    let id = parse_profile_id(&profile_id)?;
    state.with_profiles_mut(|store| remove_record(store, id))?;
    emit_profiles_changed(&app, &state)?;
    Ok(())
}

#[tauri::command]
pub fn activate_profile<R: Runtime>(
    app: AppHandle<R>,
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

fn emit_profiles_changed<R: Runtime>(app: &AppHandle<R>, state: &State<'_, AppState>) -> Result<()> {
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

fn validate_record(record: &ProfileRecord) -> std::result::Result<(), Vec<DomainValidationError>> {
    validate_profile(&record.profile, &record.menus, &record.actions)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::pie_menu::{PieAppearance, PieMenu, PieSlice};
    use crate::domain::{
        ActionDefinition,
        ActionId,
        MacroStepDefinition,
        MacroStepKind,
        PieMenuId,
        PieSliceId,
        Profile,
    };

    fn sample_record() -> ProfileRecord {
        let action_id = ActionId::new();
        let profile = Profile {
            id: ProfileId::new(),
            name: "Sample".to_string(),
            description: None,
            enabled: true,
            global_hotkey: None,
            activation_rules: Vec::new(),
            root_menu: PieMenuId::new(),
        };

        let mut menu = PieMenu {
            id: profile.root_menu,
            title: "Root".to_string(),
            appearance: PieAppearance::default(),
            slices: vec![PieSlice {
                id: PieSliceId::new(),
                label: "Launch".to_string(),
                icon: None,
                hotkey: None,
                action: Some(action_id),
                child_menu: None,
                order: 0,
            }],
        };
        menu.slices.push(PieSlice {
            id: PieSliceId::new(),
            label: "Inspect".to_string(),
            icon: None,
            hotkey: None,
            action: Some(action_id),
            child_menu: None,
            order: 1,
        });

        let action = ActionDefinition {
            id: action_id,
            name: "Macro".to_string(),
            description: None,
            timeout_ms: 3000,
            last_validated_at: None,
            steps: vec![MacroStepDefinition {
                id: ActionId::new(),
                order: 0,
                kind: MacroStepKind::Keys {
                    keys: "Ctrl+Alt+P".to_string(),
                    repeat: 1,
                },
                note: None,
            }],
        };

        ProfileRecord {
            profile,
            menus: vec![menu],
            actions: vec![action],
            created_at: None,
            updated_at: None,
        }
    }

    #[test]
    fn validate_record_fails_without_actions() {
        let mut record = sample_record();
        record.actions.clear();
        let outcome = validate_record(&record);
        assert!(outcome.is_err(), "expected validation failure for missing action");
        let errors = outcome.err().unwrap();
        assert!(errors
            .iter()
            .any(|err| matches!(err, DomainValidationError::MissingAction { .. })),
            "expected missing-action error, got {errors:?}");
    }

    #[test]
    fn validate_record_succeeds_when_actions_present() {
        let record = sample_record();
        let outcome = validate_record(&record);
        assert!(outcome.is_ok(), "expected validation success, got {outcome:?}");
    }
}
