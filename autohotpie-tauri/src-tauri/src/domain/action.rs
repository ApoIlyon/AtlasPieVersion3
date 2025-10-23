#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ActionId(pub Uuid);

impl ActionId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn as_uuid(&self) -> Uuid {
        self.0
    }
}

impl Default for ActionId {
    fn default() -> Self {
        Self::new()
    }
}

impl From<Uuid> for ActionId {
    fn from(value: Uuid) -> Self {
        Self(value)
    }
}

impl std::fmt::Display for ActionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    pub id: ActionId,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub payload: ActionPayload,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

impl Action {
    pub fn new(name: impl Into<String>, payload: ActionPayload) -> Self {
        Self {
            id: ActionId::new(),
            name: name.into(),
            description: None,
            payload,
            enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum ActionPayload {
    LaunchProgram {
        executable: String,
        #[serde(default)]
        arguments: Vec<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        working_dir: Option<String>,
    },
    SendKeys {
        sequence: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        delay_ms: Option<u32>,
    },
    RunScript {
        language: String,
        script: String,
    },
    SystemCommand {
        command: String,
    },
    Composite {
        actions: Vec<ActionId>,
    },
    Custom {
        handler: String,
        #[serde(default)]
        params: Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionDefinition {
    pub id: ActionId,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default = "default_macro_timeout")]
    pub timeout_ms: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_validated_at: Option<String>,
    #[serde(default)]
    pub steps: Vec<MacroStepDefinition>,
}

fn default_macro_timeout() -> u32 {
    3000
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MacroStepDefinition {
    pub id: ActionId,
    pub order: u32,
    #[serde(flatten)]
    pub kind: MacroStepKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MacroStepKind {
    Launch {
        app_path: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        arguments: Option<String>,
    },
    Keys {
        keys: String,
        #[serde(default = "default_repeat")]
        repeat: u32,
    },
    Delay {
        duration_ms: u32,
    },
    Script {
        language: String,
        script: String,
    },
}

fn default_repeat() -> u32 {
    1
}
