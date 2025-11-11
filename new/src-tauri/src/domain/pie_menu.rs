#![allow(dead_code)]

use super::action::ActionId;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct PieMenuId(pub Uuid);

impl PieMenuId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for PieMenuId {
    fn default() -> Self {
        Self::new()
    }
}

impl From<Uuid> for PieMenuId {
    fn from(value: Uuid) -> Self {
        Self(value)
    }
}

impl std::fmt::Display for PieMenuId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct PieSliceId(pub Uuid);

impl PieSliceId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for PieSliceId {
    fn default() -> Self {
        Self::new()
    }
}

impl From<Uuid> for PieSliceId {
    fn from(value: Uuid) -> Self {
        Self(value)
    }
}

impl std::fmt::Display for PieSliceId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PieMenu {
    pub id: PieMenuId,
    pub title: String,
    #[serde(default)]
    pub appearance: PieAppearance,
    #[serde(default)]
    pub slices: Vec<PieSlice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PieSlice {
    pub id: PieSliceId,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hotkey: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<ActionId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub child_menu: Option<PieMenuId>,
    #[serde(default)]
    pub order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PieAppearance {
    #[serde(default = "default_radius")]
    pub radius: u32,
    #[serde(default = "default_inner_radius")]
    pub inner_radius: u32,
    #[serde(default = "default_font_size")]
    pub font_size: u32,
}

const fn default_radius() -> u32 {
    240
}

const fn default_inner_radius() -> u32 {
    64
}

const fn default_font_size() -> u32 {
    16
}
