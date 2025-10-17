use super::pie_menu::PieMenuId;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ProfileId(pub Uuid);

impl ProfileId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for ProfileId {
    fn default() -> Self {
        Self::new()
    }
}

impl From<Uuid> for ProfileId {
    fn from(value: Uuid) -> Self {
        Self(value)
    }
}

impl std::fmt::Display for ProfileId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: ProfileId,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub global_hotkey: Option<String>,
    #[serde(default)]
    pub activation_rules: Vec<ActivationRule>,
    pub root_menu: PieMenuId,
}

impl Profile {
    pub fn new(name: impl Into<String>, root_menu: PieMenuId) -> Self {
        Self {
            id: ProfileId::new(),
            name: name.into(),
            description: None,
            enabled: true,
            global_hotkey: None,
            activation_rules: Vec::new(),
            root_menu,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivationMatchMode {
    Always,
    ProcessName,
    WindowTitle,
    WindowClass,
    Custom,
}

impl Default for ActivationMatchMode {
    fn default() -> Self {
        Self::Always
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ActivationRule {
    #[serde(default)]
    pub mode: ActivationMatchMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub negate: Option<bool>,
}
