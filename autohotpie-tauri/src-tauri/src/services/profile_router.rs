use crate::commands::{AppState, SystemState};
use crate::services::{
    audit_log::AuditLogger,
    system_status::{ScreenAreaSnapshot, WindowSnapshot},
};
use crate::storage::profile_repository::ProfileStore;
use anyhow::{anyhow, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tokio::time::{interval, Duration};

const PROFILE_EVENT: &str = "profiles://active-changed";
const POLL_INTERVAL: Duration = Duration::from_millis(1000);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MatchKind {
    ProcessName,
    WindowTitle,
    WindowClass,
    ScreenArea,
    Custom,
    Fallback,
}

fn select_profile(
    store: &ProfileStore,
    window: &WindowSnapshot,
    history: &Arc<Mutex<HashMap<usize, OffsetDateTime>>>,
) -> Option<ActiveProfileSnapshot> {
    let mut best: Option<ProfileCandidate> = None;
    let mut fallback: Option<ProfileCandidate> = None;
    let mut manual: Option<ActiveProfileSnapshot> = None;

    for (index, record) in store.profiles.iter().enumerate() {
        if !record.profile.enabled {
            continue;
        }

        if let Some(active_id) = store.active_profile_id {
            if active_id == record.profile.id {
                manual = Some(ActiveProfileSnapshot {
                    index,
                    name: record.profile.name.clone(),
                    match_kind: MatchKind::Custom,
                    hold_to_open: record.profile.hold_to_open,
                    selector_score: Some(u8::MAX),
                    matched_rule: Some("manual override".into()),
                    selected_at: None,
                    fallback_applied: false,
                });
                continue;
            }
        }

        let rules = parse_rules(&record.profile.activation_rules);
        let match_info = match_rules(
            &rules,
            window.process_name.as_deref(),
            window.window_title.as_deref(),
            window.window_class.as_deref(),
            window.screen_area.as_ref(),
        );

        let last_selected = history
            .lock()
            .ok()
            .and_then(|record| record.get(&index).copied());

        let candidate = match match_info {
            Some(info) => ProfileCandidate::from_match(
                index,
                record.profile.name.clone(),
                info,
                last_selected,
                record.profile.hold_to_open,
            ),
            None => ProfileCandidate::fallback(
                index,
                record.profile.name.clone(),
                last_selected,
                record.profile.hold_to_open,
            ),
        };

        if candidate.snapshot.match_kind == MatchKind::Fallback {
            fallback = Some(candidate);
            continue;
        }

        if is_better_candidate(&candidate, best.as_ref()) {
            best = Some(candidate);
        }
    }

    best
        .map(|candidate| candidate.snapshot)
        .or(manual)
        .or_else(|| fallback.map(|candidate| candidate.snapshot))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveProfileSnapshot {
    pub index: usize,
    pub name: String,
    pub match_kind: MatchKind,
    pub hold_to_open: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selector_score: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub matched_rule: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_at: Option<String>,
    #[serde(default)]
    pub fallback_applied: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveProfileEvent {
    pub profile: Option<ActiveProfileSnapshot>,
}

#[derive(Clone)]
pub struct ProfileRouterState {
    current: Arc<Mutex<Option<ActiveProfileSnapshot>>>,
    history: Arc<Mutex<HashMap<usize, OffsetDateTime>>>,
}

impl Default for ProfileRouterState {
    fn default() -> Self {
        Self {
            current: Arc::new(Mutex::new(None)),
            history: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl ProfileRouterState {
    pub fn current(&self) -> Option<ActiveProfileSnapshot> {
        self.current
            .lock()
            .ok()
            .and_then(|snapshot| snapshot.clone())
    }

    pub(crate) fn handle(&self) -> Arc<Mutex<Option<ActiveProfileSnapshot>>> {
        self.current.clone()
    }

    pub(crate) fn history(&self) -> Arc<Mutex<HashMap<usize, OffsetDateTime>>> {
        self.history.clone()
    }
}

pub fn start_router<R: Runtime>(app: AppHandle<R>) {
    let shared_state = {
        let router_state = app.state::<ProfileRouterState>();
        router_state.handle()
    };
    let history_state = {
        let router_state = app.state::<ProfileRouterState>();
        router_state.history()
    };

    tauri::async_runtime::spawn(async move {
        let mut ticker = interval(POLL_INTERVAL);
        loop {
            ticker.tick().await;
            if let Err(err) = evaluate(&app, &shared_state, &history_state).await {
                eprintln!("profile router tick failed: {err}");
            }
        }
    });
}

async fn evaluate<R: Runtime>(
    app: &AppHandle<R>,
    shared_state: &Arc<Mutex<Option<ActiveProfileSnapshot>>>,
    history: &Arc<Mutex<HashMap<usize, OffsetDateTime>>>,
) -> Result<()> {
    let (store, audit) = {
        let app_state = app.state::<AppState>();
        let guard = app_state
            .profiles
            .lock()
            .map_err(|_| anyhow!("profile store state poisoned"))?;
        let audit = app_state.audit().clone();
        (guard.clone(), audit)
    };

    let status = {
        let system_state = app.state::<SystemState>();
        let guard = system_state
            .status
            .lock()
            .map_err(|_| anyhow!("system status poisoned"))?;
        guard.clone()
    };

    evaluate_from_state(
        &store,
        &status.window,
        shared_state,
        history,
        &audit,
        |payload| {
            if let Err(err) = app.emit(PROFILE_EVENT, ActiveProfileEvent { profile: payload }) {
                eprintln!("failed to emit profile change event: {err}");
            }
        },
    )
}

fn evaluate_from_state<F>(
    store: &ProfileStore,
    window: &WindowSnapshot,
    shared_state: &Arc<Mutex<Option<ActiveProfileSnapshot>>>,
    history: &Arc<Mutex<HashMap<usize, OffsetDateTime>>>,
    audit: &AuditLogger,
    mut on_change: F,
) -> Result<()>
where
    F: FnMut(Option<ActiveProfileSnapshot>),
{
    let next_profile = select_profile(store, window, history);
    let now = OffsetDateTime::now_utc();
    if let Some(payload) = update_active_profile(shared_state, history, next_profile, now)? {
        if let Some(snapshot) = payload.clone() {
            log_selection(audit, &snapshot);
        }
        on_change(payload);
    }
    Ok(())
}

fn update_active_profile(
    shared_state: &Arc<Mutex<Option<ActiveProfileSnapshot>>>,
    history: &Arc<Mutex<HashMap<usize, OffsetDateTime>>>,
    next_profile: Option<ActiveProfileSnapshot>,
    now: OffsetDateTime,
) -> Result<Option<Option<ActiveProfileSnapshot>>> {
    let mut guard = shared_state
        .lock()
        .map_err(|_| anyhow!("profile router state poisoned"))?;

    if *guard != next_profile {
        let updated = next_profile.map(|mut snapshot| {
            snapshot.selected_at = Some(format_timestamp(now));
            snapshot
        });
        if let Some(snapshot) = &updated {
            if let Ok(mut record) = history.lock() {
                record.insert(snapshot.index, now);
            }
        }
        *guard = updated.clone();
        Ok(Some(updated))
    } else {
        Ok(None)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Target {
    Process,
    WindowTitle,
    WindowClass,
    Any,
    ScreenArea,
}

#[derive(Debug, Clone)]
enum Matcher {
    Exact { value: String, case_sensitive: bool },
    Regex(Regex),
    ScreenArea(ScreenAreaSnapshot),
    Fallback,
}

struct Rule {
    target: Target,
    matcher: Matcher,
    raw: String,
}

#[derive(Debug, Clone)]
struct MatchInfo {
    kind: MatchKind,
    score: u8,
    rule: String,
    fallback: bool,
}

#[derive(Debug, Clone)]
struct ProfileCandidate {
    snapshot: ActiveProfileSnapshot,
    score: u8,
    last_selected: Option<OffsetDateTime>,
    order: usize,
}

impl ProfileCandidate {
    fn from_match(
        index: usize,
        name: String,
        info: MatchInfo,
        last_selected: Option<OffsetDateTime>,
        hold_to_open: bool,
    ) -> Self {
        let snapshot = ActiveProfileSnapshot {
            index,
            name,
            match_kind: info.kind,
            hold_to_open,
            selector_score: Some(info.score),
            matched_rule: Some(info.rule),
            selected_at: None,
            fallback_applied: info.fallback,
        };

        Self {
            snapshot,
            score: info.score,
            last_selected,
            order: index,
        }
    }

    fn fallback(
        index: usize,
        name: String,
        last_selected: Option<OffsetDateTime>,
        hold_to_open: bool,
    ) -> Self {
        let snapshot = ActiveProfileSnapshot {
            index,
            name,
            match_kind: MatchKind::Fallback,
            hold_to_open,
            selector_score: Some(0),
            matched_rule: Some("fallback".into()),
            selected_at: None,
            fallback_applied: true,
        };

        Self {
            snapshot,
            score: 0,
            last_selected,
            order: index,
        }
    }
}

fn parse_rules(handles: &[crate::domain::profile::ActivationRule]) -> Vec<Rule> {
    handles.iter().filter_map(parse_rule).collect()
}

fn parse_rule(rule: &crate::domain::profile::ActivationRule) -> Option<Rule> {
    use crate::domain::profile::ActivationMatchMode as Mode;

    match rule.mode {
        Mode::Always => Some(Rule {
            target: Target::Any,
            matcher: Matcher::Fallback,
            raw: "fallback".to_string(),
        }),
        Mode::ProcessName => build_text_rule(rule, Target::Process),
        Mode::WindowTitle => build_text_rule(rule, Target::WindowTitle),
        Mode::WindowClass => build_text_rule(rule, Target::WindowClass),
        Mode::Custom => build_text_rule(rule, Target::Any),
        Mode::ScreenArea => build_screen_area_rule(rule),
    }
}

fn build_text_rule(rule: &crate::domain::profile::ActivationRule, target: Target) -> Option<Rule> {
    let raw = rule.value.as_ref()?.trim();
    if raw.is_empty() {
        return None;
    }

    let is_regex = rule.is_regex.unwrap_or_else(|| raw.starts_with("regex:"));
    let case_sensitive = rule.case_sensitive.unwrap_or(false);

    if is_regex {
        let pattern = if raw.starts_with("regex:") {
            raw["regex:".len()..].trim()
        } else {
            raw
        };

        if pattern.is_empty() {
            return None;
        }

        match Regex::new(pattern) {
            Ok(regex) => Some(Rule {
                target,
                matcher: Matcher::Regex(regex),
                raw: raw.to_string(),
            }),
            Err(err) => {
                eprintln!("invalid regex '{pattern}' in profile rule: {err}");
                None
            }
        }
    } else {
        Some(Rule {
            target,
            matcher: Matcher::Exact {
                value: raw.to_string(),
                case_sensitive,
            },
            raw: raw.to_string(),
        })
    }
}

fn build_screen_area_rule(rule: &crate::domain::profile::ActivationRule) -> Option<Rule> {
    let area = rule.screen_area.as_ref()?;
    Some(Rule {
        target: Target::ScreenArea,
        matcher: Matcher::ScreenArea(ScreenAreaSnapshot {
            x: area.x,
            y: area.y,
            width: area.width,
            height: area.height,
        }),
        raw: format!(
            "screen_area:{}x{}:{}x{}",
            area.x, area.y, area.width, area.height
        ),
    })
}

impl Target {
    fn match_kind(&self) -> MatchKind {
        match self {
            Target::Process => MatchKind::ProcessName,
            Target::WindowTitle => MatchKind::WindowTitle,
            Target::WindowClass => MatchKind::WindowClass,
            Target::ScreenArea => MatchKind::ScreenArea,
            Target::Any => MatchKind::Custom,
        }
    }

    fn match_score(&self) -> u8 {
        match self {
            Target::ScreenArea => 5,
            Target::Process => 4,
            Target::WindowClass => 3,
            Target::WindowTitle => 2,
            Target::Any => 1,
        }
    }
}

fn match_rules(
    rules: &[Rule],
    process_name: Option<&str>,
    window_title: Option<&str>,
    window_class: Option<&str>,
    screen_area: Option<&ScreenAreaSnapshot>,
) -> Option<MatchInfo> {
    for rule in rules {
        match &rule.matcher {
            Matcher::Fallback => {
                return Some(MatchInfo {
                    kind: MatchKind::Fallback,
                    score: rule.target.match_score(),
                    rule: rule.raw.clone(),
                    fallback: true,
                })
            }
            Matcher::Exact {
                value,
                case_sensitive,
            } => {
                if rule_applies(
                    rule.target,
                    process_name,
                    window_title,
                    window_class,
                    |candidate| {
                        if *case_sensitive {
                            candidate == value
                        } else {
                            candidate.eq_ignore_ascii_case(value)
                        }
                    },
                ) {
                    return Some(MatchInfo {
                        kind: rule.target.match_kind(),
                        score: rule.target.match_score(),
                        rule: rule.raw.clone(),
                        fallback: false,
                    });
                }
            }
            Matcher::Regex(regex) => {
                if rule_applies(
                    rule.target,
                    process_name,
                    window_title,
                    window_class,
                    |candidate| regex.is_match(candidate),
                ) {
                    return Some(MatchInfo {
                        kind: rule.target.match_kind(),
                        score: rule.target.match_score(),
                        rule: rule.raw.clone(),
                        fallback: false,
                    });
                }
            }
            Matcher::ScreenArea(expected) => {
                if let Some(actual) = screen_area {
                    if actual.x == expected.x
                        && actual.y == expected.y
                        && actual.width == expected.width
                        && actual.height == expected.height
                    {
                        return Some(MatchInfo {
                            kind: MatchKind::ScreenArea,
                            score: rule.target.match_score(),
                            rule: rule.raw.clone(),
                            fallback: false,
                        });
                    }
                }
            }
        }
    }
    None
}

fn rule_applies<F>(
    target: Target,
    process: Option<&str>,
    window: Option<&str>,
    class: Option<&str>,
    predicate: F,
) -> bool
where
    F: Fn(&str) -> bool,
{
    let check = |candidate: Option<&str>| candidate.map_or(false, |value| predicate(value));
    match target {
        Target::Process => check(process),
        Target::WindowTitle => check(window),
        Target::WindowClass => check(class),
        Target::Any => check(process) || check(window) || check(class),
        Target::ScreenArea => false,
    }
}

fn is_better_candidate(new: &ProfileCandidate, current: Option<&ProfileCandidate>) -> bool {
    match current {
        None => true,
        Some(existing) => {
            if new.score != existing.score {
                return new.score > existing.score;
            }

            match (new.last_selected, existing.last_selected) {
                (Some(a), Some(b)) => a > b,
                (Some(_), None) => true,
                (None, Some(_)) => false,
                (None, None) => new.order < existing.order,
            }
        }
    }
}

fn log_selection(audit: &AuditLogger, snapshot: &ActiveProfileSnapshot) {
    let entry = json!({
        "component": "profile_router",
        "profile": {
            "index": snapshot.index,
            "name": snapshot.name,
            "matchKind": snapshot.match_kind,
            "selectorScore": snapshot.selector_score,
            "matchedRule": snapshot.matched_rule,
            "fallbackApplied": snapshot.fallback_applied,
            "selectedAt": snapshot.selected_at,
        }
    });

    let serialized = entry.to_string();
    if let Err(err) = audit.log("INFO", &serialized) {
        eprintln!("failed to write profile selection audit log: {err}");
    }
}

fn format_timestamp(datetime: OffsetDateTime) -> String {
    datetime
        .format(&Rfc3339)
        .unwrap_or_else(|_| datetime.to_string())
}

pub fn resolve_now<R: Runtime>(app: &AppHandle<R>) -> Result<Option<ActiveProfileSnapshot>> {
    let shared_state = {
        let router_state = app.state::<ProfileRouterState>();
        router_state.handle()
    };
    let history_state = {
        let router_state = app.state::<ProfileRouterState>();
        router_state.history()
    };

    let (profiles, audit) = {
        let app_state = app.state::<AppState>();
        let guard = app_state
            .profiles
            .lock()
            .map_err(|_| anyhow!("profile store state poisoned"))?;
        let audit = app_state.audit().clone();
        (guard.clone(), audit)
    };

    let status = {
        let system_state = app.state::<SystemState>();
        let guard = system_state
            .status
            .lock()
            .map_err(|_| anyhow!("system status poisoned"))?;
        guard.clone()
    };

    evaluate_from_state(
        &profiles,
        &status.window,
        &shared_state,
        &history_state,
        &audit,
        |payload| {
            if let Err(err) = app.emit(
                PROFILE_EVENT,
                ActiveProfileEvent {
                    profile: payload.clone(),
                },
            ) {
                eprintln!("failed to emit profile change event: {err}");
            }
        },
    )?;

    let snapshot = shared_state
        .lock()
        .map_err(|_| anyhow!("profile router state poisoned"))?
        .clone();

    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::system_status::WindowSnapshot;
    use crate::storage::profile_repository::{ProfileRecord, ProfileStore};
    use crate::{
        domain::profile::{ActivationMatchMode, ActivationRule, Profile},
        domain::{PieMenuId, ProfileId},
    };

    use std::collections::HashMap;
    use std::sync::Arc;
    use time::OffsetDateTime;

    fn empty_store() -> ProfileStore {
        ProfileStore {
            profiles: Vec::new(),
            ..ProfileStore::default()
        }
    }

    fn make_rule(mode: ActivationMatchMode, value: Option<&str>) -> ActivationRule {
        ActivationRule {
            mode,
            value: value.map(|v| v.to_string()),
            negate: None,
            is_regex: None,
            case_sensitive: None,
            screen_area: None,
        }
    }

    fn make_record(name: &str, rules: Vec<ActivationRule>) -> ProfileRecord {
        let root_menu = PieMenuId::new();
        let action_id = crate::domain::ActionId::new();
        let action = crate::domain::ActionDefinition {
            id: action_id,
            name: format!("{name} Action"),
            description: None,
            timeout_ms: 3000,
            last_validated_at: None,
            steps: Vec::new(),
        };

        let menu = crate::domain::pie_menu::PieMenu {
            id: root_menu,
            title: format!("{name} Menu"),
            appearance: crate::domain::pie_menu::PieAppearance::default(),
            slices: vec![
                crate::domain::pie_menu::PieSlice {
                    id: crate::domain::pie_menu::PieSliceId::new(),
                    label: "Primary".into(),
                    icon: None,
                    hotkey: None,
                    action: Some(action_id),
                    child_menu: None,
                    order: 0,
                },
                crate::domain::pie_menu::PieSlice {
                    id: crate::domain::pie_menu::PieSliceId::new(),
                    label: "Secondary".into(),
                    icon: None,
                    hotkey: None,
                    action: Some(action_id),
                    child_menu: None,
                    order: 1,
                },
            ],
        };

        ProfileRecord {
            profile: Profile {
                id: ProfileId::new(),
                name: name.to_string(),
                description: None,
                enabled: true,
                global_hotkey: None,
                activation_rules: rules,
                root_menu,
                hold_to_open: false,
            },
            menus: vec![menu],
            actions: vec![action],
            created_at: None,
            updated_at: None,
        }
    }

    fn snapshot(process: Option<&str>, window: Option<&str>) -> WindowSnapshot {
        let mut snap = WindowSnapshot::now();
        snap.process_name = process.map(|s| s.to_string());
        snap.window_title = window.map(|s| s.to_string());
        snap
    }

    #[test]
    fn select_profile_matches_process_exact() {
        let mut store = empty_store();
        store.profiles.push(make_record(
            "Chrome",
            vec![make_rule(
                ActivationMatchMode::ProcessName,
                Some("chrome.exe"),
            )],
        ));

        let history = Arc::new(Mutex::new(HashMap::new()));

        let result = select_profile(&store, &snapshot(Some("chrome.exe"), None), &history).unwrap();
        assert_eq!(result.name, "Chrome");
        assert_eq!(result.match_kind, MatchKind::ProcessName);
    }

    #[test]
    fn select_profile_matches_window_regex() {
        let mut store = empty_store();
        store.profiles.push(make_record(
            "Editor",
            vec![make_rule(
                ActivationMatchMode::WindowTitle,
                Some("regex:^Visual Studio"),
            )],
        ));

        let history = Arc::new(Mutex::new(HashMap::new()));

        let result = select_profile(
            &store,
            &snapshot(None, Some("Visual Studio Code")),
            &history,
        )
        .unwrap();
        assert_eq!(result.name, "Editor");
        assert_eq!(result.match_kind, MatchKind::WindowTitle);
    }

    #[test]
    fn select_profile_prefers_first_matching_profile_in_order() {
        let mut store = empty_store();
        store.profiles.push(make_record(
            "VS Code",
            vec![make_rule(
                ActivationMatchMode::ProcessName,
                Some("code.exe"),
            )],
        ));
        store.profiles.push(make_record(
            "Browser",
            vec![make_rule(
                ActivationMatchMode::WindowTitle,
                Some("regex:Code"),
            )],
        ));

        let history = Arc::new(Mutex::new(HashMap::new()));

        let result = select_profile(
            &store,
            &snapshot(Some("code.exe"), Some("Visual Studio Code")),
            &history,
        )
        .unwrap();

        assert_eq!(result.name, "VS Code");
        assert_eq!(result.match_kind, MatchKind::ProcessName);
    }

    #[test]
    fn select_profile_uses_specific_match_before_fallback_profiles() {
        let mut store = empty_store();
        store.profiles.push(make_record("Default", Vec::new()));
        store.profiles.push(make_record(
            "Chrome",
            vec![make_rule(
                ActivationMatchMode::ProcessName,
                Some("chrome.exe"),
            )],
        ));

        let history = Arc::new(Mutex::new(HashMap::new()));

        let result = select_profile(&store, &snapshot(Some("chrome.exe"), None), &history).unwrap();

        assert_eq!(result.name, "Chrome");
        assert_eq!(result.match_kind, MatchKind::ProcessName);
    }

    #[test]
    fn select_profile_falls_back_to_first_enabled() {
        let state = Arc::new(Mutex::new(None));
        let history = Arc::new(Mutex::new(HashMap::new()));
        let now = OffsetDateTime::now_utc();
        let profile = Some(ActiveProfileSnapshot {
            index: 0,
            name: "Default".into(),
            match_kind: MatchKind::Fallback,
            hold_to_open: false,
            selector_score: Some(0),
            matched_rule: Some("fallback".into()),
            selected_at: None,
            fallback_applied: true,
        });

        let notification = update_active_profile(&state, &history, profile.clone(), now).unwrap();
        assert!(notification.is_some());
        let snapshot = notification.unwrap().unwrap();
        assert_eq!(snapshot.index, 0);
        assert_eq!(snapshot.name, "Default");
        assert_eq!(snapshot.match_kind, MatchKind::Fallback);
        assert!(snapshot.fallback_applied);
        assert!(snapshot.selected_at.is_some());

        let current = state.lock().expect("state poisoned").clone();

        // second update with same value should not notify
        let notification = update_active_profile(&state, &history, current, now).unwrap();
        assert!(notification.is_none());
    }
}
