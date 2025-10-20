#![allow(dead_code)]

use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MatchMode {
    ProcessName,
    WindowTitle,
    WindowClass,
    ScreenArea,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MatchPattern {
    pub value: String,
    #[serde(default)]
    pub is_regex: bool,
    #[serde(default)]
    pub case_sensitive: bool,
}

impl MatchPattern {
    fn regex(&self) -> Result<Regex, regex::Error> {
        let mut builder = RegexBuilder::new(&self.value);
        builder.case_insensitive(!self.case_sensitive);
        builder.build()
    }

    pub fn matches(&self, input: &str) -> bool {
        if self.is_regex {
            return self
                .regex()
                .map(|regex| regex.is_match(input))
                .unwrap_or(false);
        }

        if self.case_sensitive {
            input == self.value
        } else {
            input.eq_ignore_ascii_case(&self.value)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContextRule {
    pub mode: MatchMode,
    pub pattern: MatchPattern,
}

impl ContextRule {
    pub fn matches(&self, snapshot: &ContextSnapshot) -> bool {
        match self.mode {
            MatchMode::ProcessName => snapshot
                .process_name
                .as_deref()
                .map(|value| self.pattern.matches(value))
                .unwrap_or(false),
            MatchMode::WindowTitle => snapshot
                .window_title
                .as_deref()
                .map(|value| self.pattern.matches(value))
                .unwrap_or(false),
            MatchMode::WindowClass => snapshot
                .window_class
                .as_deref()
                .map(|value| self.pattern.matches(value))
                .unwrap_or(false),
            MatchMode::ScreenArea => snapshot
                .screen_area
                .as_ref()
                .map(|area| {
                    self.pattern.matches(&format!(
                        "{}x{}:{}x{}",
                        area.x, area.y, area.width, area.height
                    ))
                })
                .unwrap_or(false),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScreenArea {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContextSnapshot {
    pub process_name: Option<String>,
    pub window_title: Option<String>,
    pub window_class: Option<String>,
    pub screen_area: Option<ScreenArea>,
}

impl ContextSnapshot {
    pub fn empty() -> Self {
        Self::default()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContextMatcher {
    pub rules: Vec<ContextRule>,
}

impl ContextMatcher {
    pub fn matches(&self, snapshot: &ContextSnapshot) -> bool {
        if self.rules.is_empty() {
            return true;
        }

        self.rules.iter().all(|rule| rule.matches(snapshot))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(process: &str, title: &str) -> ContextSnapshot {
        ContextSnapshot {
            process_name: Some(process.to_string()),
            window_title: Some(title.to_string()),
            window_class: None,
            screen_area: None,
        }
    }

    #[test]
    fn matches_with_exact_case_insensitive() {
        let matcher = ContextMatcher {
            rules: vec![ContextRule {
                mode: MatchMode::ProcessName,
                pattern: MatchPattern {
                    value: "NOTEPAD.EXE".to_string(),
                    is_regex: false,
                    case_sensitive: false,
                },
            }],
        };

        assert!(matcher.matches(&snapshot("notepad.exe", "Untitled")));
    }

    #[test]
    fn matches_with_regex() {
        let matcher = ContextMatcher {
            rules: vec![ContextRule {
                mode: MatchMode::WindowTitle,
                pattern: MatchPattern {
                    value: r"(?i)Visual Studio Code".to_string(),
                    is_regex: true,
                    case_sensitive: true,
                },
            }],
        };

        assert!(matcher.matches(&snapshot("code.exe", "Visual Studio Code - main.rs")));
    }

    #[test]
    fn fails_when_value_missing() {
        let matcher = ContextMatcher {
            rules: vec![ContextRule {
                mode: MatchMode::WindowClass,
                pattern: MatchPattern {
                    value: "Chrome_WidgetWin_1".to_string(),
                    is_regex: false,
                    case_sensitive: true,
                },
            }],
        };

        assert!(!matcher.matches(&snapshot("chrome.exe", "New Tab")));
    }
}
