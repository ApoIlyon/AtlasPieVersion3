#![allow(dead_code)]

use super::{ActionId, MatchMode, ProfileId};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveProfile {
    pub profile_id: ProfileId,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_rule: Option<ContextRuleMatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selector_score: Option<f32>,
    pub selected_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextRuleMatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<Uuid>,
    pub mode: MatchMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub process_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_title_pattern: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_matched_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActionEventStatus {
    Success,
    Failure,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionEventPayload {
    pub event_id: Uuid,
    pub id: ActionId,
    pub name: String,
    pub status: ActionEventStatus,
    pub duration_ms: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub timestamp: OffsetDateTime,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invocation_id: Option<Uuid>,
}

impl ActionEventPayload {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        action_id: ActionId,
        action_name: impl Into<String>,
        status: ActionEventStatus,
        duration_ms: u32,
        message: Option<String>,
        timestamp: OffsetDateTime,
        invocation_id: Option<Uuid>,
    ) -> Self {
        Self {
            event_id: Uuid::new_v4(),
            id: action_id,
            name: action_name.into(),
            status,
            duration_ms,
            message,
            timestamp,
            invocation_id,
        }
    }
}
