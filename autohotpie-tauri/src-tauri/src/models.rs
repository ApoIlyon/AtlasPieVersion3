use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_global")]
    pub global: Value,
    #[serde(default)]
    pub app_profiles: Vec<AppProfile>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            global: default_global(),
            app_profiles: vec![AppProfile::default_default_profile()],
        }
    }
}

impl Settings {
    fn global_map_mut(&mut self) -> &mut Map<String, Value> {
        if !self.global.is_object() {
            self.global = default_global();
        }
        match self.global {
            Value::Object(ref mut map) => map,
            _ => unreachable!("global should always be object"),
        }
    }

    pub fn set_app_version(&mut self, version: &str) -> bool {
        let global_map = self.global_map_mut();
        let app_entry = global_map
            .entry("app".to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        let app_obj = app_entry
            .as_object_mut()
            .expect("app should always be stored as object");
        let current_version = app_obj
            .get("version")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        if current_version == version {
            return false;
        }
        app_obj.insert("version".to_string(), Value::String(version.to_string()));
        true
    }
}

fn default_global() -> Value {
    json!({
        "pieTips": true,
        "enableEscapeKeyMenuCancel": true,
        "app": {
            "sourceFileName": "AHPSettings.json",
            "version": "0.0.0"
        },
        "startup": {
            "runOnStartup": false,
            "runAHKPieMenus": false,
            "runOnAppQuit": true,
            "alwaysRunOnAppQuit": false
        },
        "globalAppearance": {
            "font": "Arial",
            "fontSize": 14,
            "fontColors": {
                "white": [255, 255, 255],
                "grey": [180, 180, 180],
                "black": [35, 35, 35]
            },
            "minimumLabelWidth": 0,
            "pieIconFolder": "%A_ScriptDir%\\icons",
            "iconSize": 24,
            "safetyStrokeColor": [123, 123, 123, 255],
            "labelStrokeThickness": 1
        },
        "functionConfig": {
            "common": [],
            "custom": []
        },
        "htmlAhkKeyConversionTable": []
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppProfile {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub ahk_handles: Vec<String>,
    #[serde(default = "default_true")]
    pub enable: bool,
    #[serde(default)]
    pub hover_activation: bool,
    #[serde(default)]
    pub pie_enable_key: PieEnableKey,
    #[serde(default)]
    pub pie_keys: Vec<PieKey>,
}

impl AppProfile {
    pub fn default_default_profile() -> Self {
        Self {
            name: "Default Profile".to_string(),
            ahk_handles: vec!["ahk_group regApps".to_string()],
            enable: true,
            hover_activation: false,
            pie_enable_key: PieEnableKey::default(),
            pie_keys: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PieEnableKey {
    #[serde(default)]
    pub use_enable_key: bool,
    #[serde(default = "default_capslock")]
    pub enable_key: String,
    #[serde(default)]
    pub toggle: bool,
    #[serde(default)]
    pub send_original_func: bool,
}

impl Default for PieEnableKey {
    fn default() -> Self {
        Self {
            use_enable_key: false,
            enable_key: default_capslock(),
            toggle: false,
            send_original_func: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PieKey {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub hotkey: String,
    #[serde(default = "default_true")]
    pub enable: bool,
    #[serde(default)]
    pub label_delay: u32,
    #[serde(default)]
    pub global_menu: bool,
    #[serde(default)]
    pub activation_mode: ActivationMode,
    #[serde(default)]
    pub pie_menus: Vec<PieMenu>,
}

impl Default for PieKey {
    fn default() -> Self {
        Self {
            name: String::new(),
            hotkey: String::new(),
            enable: true,
            label_delay: 0,
            global_menu: false,
            activation_mode: ActivationMode::default(),
            pie_menus: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationMode {
    #[serde(default = "default_submenu_mode")]
    pub submenu_mode: u8,
    #[serde(default = "default_pie_action")]
    pub pie_key_action: String,
    #[serde(default = "default_true")]
    pub clickable_functions: bool,
    #[serde(default)]
    pub escape_radius: EscapeRadius,
    #[serde(default)]
    pub open_menu_in_center: bool,
    #[serde(default)]
    pub decouple_mouse: bool,
    #[serde(default = "default_true")]
    pub key_release_delay: bool,
}

impl Default for ActivationMode {
    fn default() -> Self {
        Self {
            submenu_mode: default_submenu_mode(),
            pie_key_action: default_pie_action(),
            clickable_functions: true,
            escape_radius: EscapeRadius::default(),
            open_menu_in_center: false,
            decouple_mouse: false,
            key_release_delay: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscapeRadius {
    #[serde(default)]
    pub enable: bool,
    #[serde(default = "default_escape_radius")]
    pub radius: u32,
}

impl Default for EscapeRadius {
    fn default() -> Self {
        Self {
            enable: false,
            radius: default_escape_radius(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PieMenu {
    #[serde(default = "default_background_color")]
    pub background_color: Vec<u8>,
    #[serde(default = "default_selection_color")]
    pub selection_color: Vec<u8>,
    #[serde(default = "default_font_color")]
    pub font_color: Vec<u8>,
    #[serde(default = "default_radius")]
    pub radius: u32,
    #[serde(default = "default_thickness")]
    pub thickness: u32,
    #[serde(default = "default_label_radius")]
    pub label_radius: u32,
    #[serde(default = "default_label_roundness")]
    pub label_roundness: u32,
    #[serde(default)]
    pub pie_angle: i32,
    #[serde(default)]
    pub functions: Vec<PieFunction>,
}

impl Default for PieMenu {
    fn default() -> Self {
        Self {
            background_color: default_background_color(),
            selection_color: default_selection_color(),
            font_color: default_font_color(),
            radius: default_radius(),
            thickness: default_thickness(),
            label_radius: default_label_radius(),
            label_roundness: default_label_roundness(),
            pie_angle: 0,
            functions: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PieFunction {
    #[serde(default = "default_function_kind")]
    pub function: String,
    #[serde(default = "default_params")]
    pub params: Value,
    #[serde(default = "default_label")]
    pub label: String,
    #[serde(default)]
    pub hotkey: String,
    #[serde(default)]
    pub clickable: bool,
    #[serde(default)]
    pub return_mouse_pos: bool,
    #[serde(default)]
    pub icon: Icon,
}

impl Default for PieFunction {
    fn default() -> Self {
        Self {
            function: default_function_kind(),
            params: default_params(),
            label: default_label(),
            hotkey: String::new(),
            clickable: false,
            return_mouse_pos: false,
            icon: Icon::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Icon {
    #[serde(default)]
    pub file_path: String,
    #[serde(default = "default_true")]
    pub wb_only: bool,
}

impl Default for Icon {
    fn default() -> Self {
        Self {
            file_path: String::new(),
            wb_only: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomFunction {
    #[serde(flatten)]
    pub data: Map<String, Value>,
}

fn default_true() -> bool {
    true
}

fn default_capslock() -> String {
    "capslock".to_string()
}

fn default_submenu_mode() -> u8 {
    1
}

fn default_pie_action() -> String {
    "None".to_string()
}

fn default_escape_radius() -> u32 {
    150
}

fn default_background_color() -> Vec<u8> {
    vec![35, 35, 35, 255]
}

fn default_selection_color() -> Vec<u8> {
    vec![30, 232, 226, 255]
}

fn default_font_color() -> Vec<u8> {
    vec![255, 255, 255, 255]
}

fn default_radius() -> u32 {
    20
}

fn default_thickness() -> u32 {
    10
}

fn default_label_radius() -> u32 {
    80
}

fn default_label_roundness() -> u32 {
    10
}

fn default_function_kind() -> String {
    "none".to_string()
}

fn default_params() -> Value {
    Value::Object(Map::new())
}

fn default_label() -> String {
    "New Slice".to_string()
}
