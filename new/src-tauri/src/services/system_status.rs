use serde::{Deserialize, Serialize};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectivitySnapshot {
    pub is_offline: bool,
    pub last_checked: Option<String>,
}

impl ConnectivitySnapshot {
    pub fn new() -> Self {
        Self {
            is_offline: false,
            last_checked: None,
        }
    }

    pub fn update(&mut self, is_offline: bool) {
        self.is_offline = is_offline;
        self.last_checked = OffsetDateTime::now_utc().format(&Rfc3339).ok();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CursorPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScreenAreaSnapshot {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowSnapshot {
    pub process_name: Option<String>,
    pub window_title: Option<String>,
    pub window_class: Option<String>,
    pub cursor_position: Option<CursorPosition>,
    pub screen_area: Option<ScreenAreaSnapshot>,
    pub is_fullscreen: bool,
    pub timestamp: String,
}

impl WindowSnapshot {
    pub fn now() -> Self {
        Self {
            timestamp: OffsetDateTime::now_utc()
                .format(&Rfc3339)
                .unwrap_or_else(|_| "".into()),
            ..Default::default()
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StorageMode {
    ReadWrite,
    ReadOnly,
}

impl Default for StorageMode {
    fn default() -> Self {
        StorageMode::ReadWrite
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub connectivity: ConnectivitySnapshot,
    pub window: WindowSnapshot,
    pub safe_mode: bool,
    pub storage_mode: StorageMode,
}

impl SystemStatus {
    pub fn new(storage_mode: StorageMode) -> Self {
        let mut status = Self {
            connectivity: ConnectivitySnapshot::new(),
            window: WindowSnapshot::now(),
            storage_mode,
            safe_mode: false,
        };
        status.recalculate_safe_mode();
        status
    }

    pub fn set_storage_mode(&mut self, mode: StorageMode) {
        self.storage_mode = mode.clone();
        self.recalculate_safe_mode();
    }

    pub fn update_window(&mut self, snapshot: WindowSnapshot) {
        self.window = snapshot;
        self.recalculate_safe_mode();
    }

    fn recalculate_safe_mode(&mut self) {
        let storage_guard = matches!(self.storage_mode, StorageMode::ReadOnly);
        self.safe_mode = storage_guard || self.window.is_fullscreen;
    }
}
