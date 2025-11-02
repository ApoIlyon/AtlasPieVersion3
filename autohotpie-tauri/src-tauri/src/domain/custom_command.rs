use serde::{Deserialize, Serialize};
use std::time::SystemTime;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomCommand {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: CommandCategory,
    pub tags: Vec<String>,
    pub command_type: CommandType,
    pub steps: Vec<CommandStep>,
    pub created_at: u64,
    pub modified_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CommandCategory {
    Keyboard,
    Mouse,
    System,
    Application,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum CommandType {
    KeyboardMacro,
    MouseAction,
    SystemCommand,
    CompositeAction,
    ConditionalAction,
    CustomScript,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandStep {
    pub order: u32,
    pub action: StepAction,
    pub delay_ms: Option<u32>,
    pub condition: Option<Condition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StepAction {
    KeyPress {
        key: String,
        modifiers: Vec<String>,
    },
    KeySequence {
        keys: Vec<String>,
    },
    MouseClick {
        button: MouseButton,
        x: Option<i32>,
        y: Option<i32>,
    },
    MouseMove {
        x: i32,
        y: i32,
        relative: bool,
    },
    SystemCommand {
        command: String,
        args: Vec<String>,
    },
    LaunchApp {
        path: String,
        args: Vec<String>,
    },
    OpenUrl {
        url: String,
    },
    Delay {
        milliseconds: u32,
    },
    Script {
        code: String,
        language: ScriptLanguage,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
    X1,
    X2,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ScriptLanguage {
    JavaScript,
    Python,
    Shell,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Condition {
    pub condition_type: ConditionType,
    pub value: String,
    pub operator: ConditionOperator,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ConditionType {
    WindowTitle,
    ProcessName,
    ClipboardContent,
    EnvironmentVariable,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConditionOperator {
    Equals,
    Contains,
    StartsWith,
    EndsWith,
    Regex,
}

impl CustomCommand {
    pub fn new(name: String, command_type: CommandType) -> Self {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        Self {
            id: Uuid::new_v4().to_string(),
            name,
            description: None,
            category: CommandCategory::Custom,
            tags: Vec::new(),
            command_type,
            steps: Vec::new(),
            created_at: now,
            modified_at: now,
        }
    }

    pub fn add_step(&mut self, step: CommandStep) {
        self.steps.push(step);
        self.update_modified();
    }

    pub fn update_modified(&mut self) {
        self.modified_at = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs();
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.name.trim().is_empty() {
            return Err("Command name cannot be empty".to_string());
        }

        if self.steps.is_empty() {
            return Err("Command must have at least one step".to_string());
        }

        if self.steps.len() > 100 {
            return Err("Command cannot have more than 100 steps".to_string());
        }

        // Validate each step
        for (i, step) in self.steps.iter().enumerate() {
            if let Some(delay) = step.delay_ms {
                if delay > 60000 {
                    return Err(format!("Step {}: Delay cannot exceed 60 seconds", i + 1));
                }
            }
        }

        Ok(())
    }
}

impl CommandStep {
    pub fn new(order: u32, action: StepAction) -> Self {
        Self {
            order,
            action,
            delay_ms: None,
            condition: None,
        }
    }

    pub fn with_delay(mut self, delay_ms: u32) -> Self {
        self.delay_ms = Some(delay_ms);
        self
    }

    pub fn with_condition(mut self, condition: Condition) -> Self {
        self.condition = Some(condition);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_command() {
        let cmd = CustomCommand::new("Test Command".to_string(), CommandType::KeyboardMacro);
        assert_eq!(cmd.name, "Test Command");
        assert_eq!(cmd.steps.len(), 0);
    }

    #[test]
    fn test_validate_empty_name() {
        let cmd = CustomCommand::new("".to_string(), CommandType::KeyboardMacro);
        assert!(cmd.validate().is_err());
    }

    #[test]
    fn test_validate_no_steps() {
        let cmd = CustomCommand::new("Test".to_string(), CommandType::KeyboardMacro);
        assert!(cmd.validate().is_err());
    }

    #[test]
    fn test_add_step() {
        let mut cmd = CustomCommand::new("Test".to_string(), CommandType::KeyboardMacro);
        let step = CommandStep::new(
            0,
            StepAction::KeyPress {
                key: "a".to_string(),
                modifiers: vec![],
            },
        );
        cmd.add_step(step);
        assert_eq!(cmd.steps.len(), 1);
    }
}
