use crate::commands::{AppState, SystemState};
use crate::models::Settings;
use crate::services::system_status::WindowSnapshot;
use anyhow::{anyhow, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{interval, Duration};

const PROFILE_EVENT: &str = "profiles://active-changed";
const POLL_INTERVAL: Duration = Duration::from_millis(1000);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MatchKind {
    ProcessName,
    WindowTitle,
    Fallback,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveProfileSnapshot {
    pub index: usize,
    pub name: String,
    pub match_kind: MatchKind,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveProfileEvent {
    pub profile: Option<ActiveProfileSnapshot>,
}

#[derive(Clone, Default)]
pub struct ProfileRouterState {
    current: Arc<Mutex<Option<ActiveProfileSnapshot>>>,
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
}

pub fn start_router(app: AppHandle) {
    let shared_state = {
        let router_state = app.state::<ProfileRouterState>();
        router_state.handle()
    };

    tauri::async_runtime::spawn(async move {
        let mut ticker = interval(POLL_INTERVAL);
        loop {
            ticker.tick().await;
            if let Err(err) = evaluate(&app, &shared_state).await {
                eprintln!("profile router tick failed: {err}");
            }
        }
    });
}

async fn evaluate(
    app: &AppHandle,
    shared_state: &Arc<Mutex<Option<ActiveProfileSnapshot>>>,
) -> Result<()> {
    let settings = {
        let app_state = app.state::<AppState>();
        let guard = app_state
            .settings
            .lock()
            .map_err(|_| anyhow!("settings state poisoned"))?;
        guard.clone()
    };

    let status = {
        let system_state = app.state::<SystemState>();
        let guard = system_state
            .status
            .lock()
            .map_err(|_| anyhow!("system status poisoned"))?;
        guard.clone()
    };

    evaluate_from_state(&settings, &status.window, shared_state, |payload| {
        if let Err(err) = app.emit(PROFILE_EVENT, ActiveProfileEvent { profile: payload }) {
            eprintln!("failed to emit profile change event: {err}");
        }
    })
}

fn evaluate_from_state<F>(
    settings: &Settings,
    window: &WindowSnapshot,
    shared_state: &Arc<Mutex<Option<ActiveProfileSnapshot>>>,
    mut on_change: F,
) -> Result<()>
where
    F: FnMut(Option<ActiveProfileSnapshot>),
{
    let next_profile = select_profile(settings, window);
    if let Some(payload) = update_active_profile(shared_state, next_profile)? {
        on_change(payload);
    }
    Ok(())
}

fn select_profile(settings: &Settings, window: &WindowSnapshot) -> Option<ActiveProfileSnapshot> {
    let process_name = window
        .process_name
        .as_ref()
        .map(|name| name.trim())
        .filter(|name| !name.is_empty());
    let window_title = window
        .window_title
        .as_ref()
        .map(|title| title.trim())
        .filter(|title| !title.is_empty());

    let mut fallback: Option<ActiveProfileSnapshot> = None;

    for (index, profile) in settings.app_profiles.iter().enumerate() {
        if !profile.enable {
            continue;
        }

        let rules = parse_rules(&profile.ahk_handles);
        if rules.is_empty() {
            if fallback.is_none() {
                fallback = Some(ActiveProfileSnapshot {
                    index,
                    name: profile.name.clone(),
                    match_kind: MatchKind::Fallback,
                });
            }
            continue;
        }

        if let Some(kind) = match_rules(&rules, process_name, window_title) {
            return Some(ActiveProfileSnapshot {
                index,
                name: profile.name.clone(),
                match_kind: kind,
            });
        }

        if fallback.is_none() {
            fallback = Some(ActiveProfileSnapshot {
                index,
                name: profile.name.clone(),
                match_kind: MatchKind::Fallback,
            });
        }
    }

    fallback
}

fn update_active_profile(
    shared_state: &Arc<Mutex<Option<ActiveProfileSnapshot>>>,
    next_profile: Option<ActiveProfileSnapshot>,
) -> Result<Option<Option<ActiveProfileSnapshot>>> {
    let mut guard = shared_state
        .lock()
        .map_err(|_| anyhow!("profile router state poisoned"))?;

    if *guard != next_profile {
        *guard = next_profile.clone();
        Ok(Some(next_profile))
    } else {
        Ok(None)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Target {
    Process,
    Window,
    Any,
}

#[derive(Debug, Clone)]
enum Matcher {
    Exact(String),
    Regex(Regex),
    Fallback,
}

#[derive(Debug, Clone)]
struct Rule {
    target: Target,
    matcher: Matcher,
}

fn parse_rules(handles: &[String]) -> Vec<Rule> {
    handles
        .iter()
        .filter_map(|raw| parse_rule(raw))
        .collect()
}

fn parse_rule(raw: &str) -> Option<Rule> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.eq_ignore_ascii_case("fallback") || trimmed == "*" {
        return Some(Rule {
            target: Target::Any,
            matcher: Matcher::Fallback,
        });
    }

    let (target, body) = if let Some(rest) = trimmed.strip_prefix("process:") {
        (Target::Process, rest.trim())
    } else if let Some(rest) = trimmed.strip_prefix("window:") {
        (Target::Window, rest.trim())
    } else {
        (Target::Any, trimmed)
    };

    if body.is_empty() {
        return None;
    }

    if let Some(rest) = body.strip_prefix("regex:") {
        match Regex::new(rest.trim()) {
            Ok(regex) => Some(Rule {
                target,
                matcher: Matcher::Regex(regex),
            }),
            Err(err) => {
                eprintln!("invalid regex '{rest}' in profile rule: {err}");
                None
            }
        }
    } else {
        Some(Rule {
            target,
            matcher: Matcher::Exact(body.to_ascii_lowercase()),
        })
    }
}

fn match_rules(
    rules: &[Rule],
    process_name: Option<&str>,
    window_title: Option<&str>,
) -> Option<MatchKind> {
    for rule in rules {
        match &rule.matcher {
            Matcher::Fallback => return Some(MatchKind::Fallback),
            Matcher::Exact(needle) => {
                if rule_applies(rule.target, process_name, window_title, |value| {
                    value.eq_ignore_ascii_case(needle)
                }) {
                    return Some(rule.target.match_kind());
                }
            }
            Matcher::Regex(regex) => {
                if rule_applies(rule.target, process_name, window_title, |value| regex.is_match(value))
                {
                    return Some(rule.target.match_kind());
                }
            }
        }
    }
    None
}

fn rule_applies<F>(target: Target, process: Option<&str>, window: Option<&str>, predicate: F) -> bool
where
    F: Fn(&str) -> bool,
{
    match target {
        Target::Process => process.map_or(false, |value| predicate(value)),
        Target::Window => window.map_or(false, |value| predicate(value)),
        Target::Any => {
            process.map_or(false, |value| predicate(value))
                || window.map_or(false, |value| predicate(value))
        }
    }
}

impl Target {
    fn match_kind(&self) -> MatchKind {
        match self {
            Target::Process => MatchKind::ProcessName,
            Target::Window => MatchKind::WindowTitle,
            Target::Any => MatchKind::Fallback,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AppProfile, Settings};
    use crate::services::system_status::WindowSnapshot;

    use std::sync::Arc;

    fn base_settings() -> Settings {
        Settings {
            global: serde_json::json!({}),
            app_profiles: Vec::new(),
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
        let mut settings = base_settings();
        settings.app_profiles.push(AppProfile {
            name: "Chrome".into(),
            ahk_handles: vec!["process:chrome.exe".into()],
            enable: true,
            ..AppProfile::default_default_profile()
        });

        let result = select_profile(&settings, &snapshot(Some("chrome.exe"), None)).unwrap();
        assert_eq!(result.name, "Chrome");
        assert_eq!(result.match_kind, MatchKind::ProcessName);
    }

    #[test]
    fn select_profile_matches_window_regex() {
        let mut settings = base_settings();
        settings.app_profiles.push(AppProfile {
            name: "Editor".into(),
            ahk_handles: vec!["window:regex:^Visual Studio".into()],
            enable: true,
            ..AppProfile::default_default_profile()
        });

        let result = select_profile(&settings, &snapshot(None, Some("Visual Studio Code"))).unwrap();
        assert_eq!(result.name, "Editor");
        assert_eq!(result.match_kind, MatchKind::WindowTitle);
    }

    #[test]
    fn select_profile_falls_back_to_first_enabled() {
        let mut settings = base_settings();
        settings.app_profiles.push(AppProfile {
            name: "Fallback".into(),
            ahk_handles: vec![],
            enable: true,
            ..AppProfile::default_default_profile()
        });

        let result = select_profile(&settings, &snapshot(Some("unknown"), Some("Unknown"))).unwrap();
        assert_eq!(result.name, "Fallback");
        assert_eq!(result.match_kind, MatchKind::Fallback);
    }

    #[test]
    fn update_active_profile_detects_changes() {
        let state = Arc::new(Mutex::new(None));
        let profile = Some(ActiveProfileSnapshot {
            index: 0,
            name: "Test".into(),
            match_kind: MatchKind::ProcessName,
        });

        let notification = update_active_profile(&state, profile.clone()).unwrap();
        assert_eq!(notification, Some(profile.clone()));

        // second update with same value should not notify
        let notification = update_active_profile(&state, profile).unwrap();
        assert!(notification.is_none());
    }

    #[test]
    fn evaluate_from_state_notifies_on_change() {
        let mut settings = base_settings();
        settings.app_profiles.push(AppProfile {
            name: "Chrome".into(),
            ahk_handles: vec!["process:chrome.exe".into()],
            enable: true,
            ..AppProfile::default_default_profile()
        });

        let state = Arc::new(Mutex::new(None));
        let mut emitted: Vec<Option<ActiveProfileSnapshot>> = Vec::new();

        evaluate_from_state(
            &settings,
            &snapshot(Some("chrome.exe"), None),
            &state,
            |payload| emitted.push(payload),
        )
        .unwrap();

        assert_eq!(emitted.len(), 1);
        assert!(emitted[0].as_ref().is_some());

        // second call with same state should not emit
        evaluate_from_state(
            &settings,
            &snapshot(Some("chrome.exe"), None),
            &state,
            |payload| emitted.push(payload),
        )
        .unwrap();

        assert_eq!(emitted.len(), 1);
    }
}
