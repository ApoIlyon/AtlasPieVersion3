use crate::domain::custom_command::{
    CommandStep, Condition, ConditionOperator, ConditionType, CustomCommand, MouseButton,
    StepAction,
};
use anyhow::{Context, Result};
use std::thread;
use std::time::Duration;

pub struct MacroEngine {
    dry_run: bool,
}

impl MacroEngine {
    pub fn new() -> Self {
        Self { dry_run: false }
    }

    pub fn with_dry_run(dry_run: bool) -> Self {
        Self { dry_run }
    }

    pub async fn execute_command(&self, command: &CustomCommand) -> Result<ExecutionResult> {
        // Validate command first
        command
            .validate()
            .map_err(|e| anyhow::anyhow!("Command validation failed: {}", e))?;

        let mut result = ExecutionResult {
            command_id: command.id.clone(),
            success: true,
            steps_executed: 0,
            steps_skipped: 0,
            errors: Vec::new(),
            duration_ms: 0,
        };

        let start = std::time::Instant::now();

        for (index, step) in command.steps.iter().enumerate() {
            // Check condition if present
            if let Some(condition) = &step.condition {
                if !self.evaluate_condition(condition).await? {
                    result.steps_skipped += 1;
                    continue;
                }
            }

            // Execute step
            match self.execute_step(step).await {
                Ok(_) => {
                    result.steps_executed += 1;
                }
                Err(e) => {
                    result.success = false;
                    result
                        .errors
                        .push(format!("Step {}: {}", index + 1, e));
                }
            }

            // Apply delay if specified
            if let Some(delay_ms) = step.delay_ms {
                thread::sleep(Duration::from_millis(delay_ms as u64));
            }
        }

        result.duration_ms = start.elapsed().as_millis() as u64;

        Ok(result)
    }

    async fn execute_step(&self, step: &CommandStep) -> Result<()> {
        if self.dry_run {
            // In dry run mode, just log the action
            println!("DRY RUN: Would execute {:?}", step.action);
            return Ok(());
        }

        match &step.action {
            StepAction::KeyPress { key, modifiers } => {
                self.execute_key_press(key, modifiers).await?;
            }
            StepAction::KeySequence { keys } => {
                self.execute_key_sequence(keys).await?;
            }
            StepAction::MouseClick { button, x, y } => {
                self.execute_mouse_click(button, *x, *y).await?;
            }
            StepAction::MouseMove { x, y, relative } => {
                self.execute_mouse_move(*x, *y, *relative).await?;
            }
            StepAction::SystemCommand { command, args } => {
                self.execute_system_command(command, args).await?;
            }
            StepAction::LaunchApp { path, args } => {
                self.execute_launch_app(path, args).await?;
            }
            StepAction::OpenUrl { url } => {
                self.execute_open_url(url).await?;
            }
            StepAction::Delay { milliseconds } => {
                thread::sleep(Duration::from_millis(*milliseconds as u64));
            }
            StepAction::Script { code, language } => {
                self.execute_script(code, language).await?;
            }
        }

        Ok(())
    }

    async fn execute_key_press(&self, key: &str, modifiers: &[String]) -> Result<()> {
        // TODO: Implement with enigo crate
        // For now, just a placeholder
        println!("Executing key press: {} with modifiers: {:?}", key, modifiers);
        Ok(())
    }

    async fn execute_key_sequence(&self, keys: &[String]) -> Result<()> {
        // TODO: Implement with enigo crate
        println!("Executing key sequence: {:?}", keys);
        Ok(())
    }

    async fn execute_mouse_click(
        &self,
        button: &MouseButton,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<()> {
        // TODO: Implement with enigo crate
        println!("Executing mouse click: {:?} at ({:?}, {:?})", button, x, y);
        Ok(())
    }

    async fn execute_mouse_move(&self, x: i32, y: i32, relative: bool) -> Result<()> {
        // TODO: Implement with enigo crate
        println!("Executing mouse move to ({}, {}) relative: {}", x, y, relative);
        Ok(())
    }

    async fn execute_system_command(&self, command: &str, args: &[String]) -> Result<()> {
        use std::process::Command;

        let output = Command::new(command)
            .args(args)
            .output()
            .with_context(|| format!("Failed to execute command: {}", command))?;

        if !output.status.success() {
            anyhow::bail!(
                "Command failed with status: {}",
                output.status.code().unwrap_or(-1)
            );
        }

        Ok(())
    }

    async fn execute_launch_app(&self, path: &str, args: &[String]) -> Result<()> {
        use std::process::Command;

        Command::new(path)
            .args(args)
            .spawn()
            .with_context(|| format!("Failed to launch app: {}", path))?;

        Ok(())
    }

    async fn execute_open_url(&self, url: &str) -> Result<()> {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("cmd")
                .args(["/C", "start", url])
                .spawn()
                .with_context(|| format!("Failed to open URL: {}", url))?;
        }

        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(url)
                .spawn()
                .with_context(|| format!("Failed to open URL: {}", url))?;
        }

        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(url)
                .spawn()
                .with_context(|| format!("Failed to open URL: {}", url))?;
        }

        Ok(())
    }

    async fn execute_script(&self, _code: &str, _language: &crate::domain::custom_command::ScriptLanguage) -> Result<()> {
        // TODO: Implement script execution
        // This would require embedding a scripting engine
        anyhow::bail!("Script execution not yet implemented");
    }

    async fn evaluate_condition(&self, condition: &Condition) -> Result<bool> {
        match condition.condition_type {
            ConditionType::WindowTitle => {
                // TODO: Get actual window title
                let window_title = ""; // Placeholder
                Ok(self.match_string(&window_title, &condition.value, &condition.operator))
            }
            ConditionType::ProcessName => {
                // TODO: Get actual process name
                let process_name = ""; // Placeholder
                Ok(self.match_string(&process_name, &condition.value, &condition.operator))
            }
            ConditionType::ClipboardContent => {
                // TODO: Get clipboard content
                Ok(false)
            }
            ConditionType::EnvironmentVariable => {
                let value = std::env::var(&condition.value).unwrap_or_default();
                Ok(!value.is_empty())
            }
        }
    }

    fn match_string(&self, text: &str, pattern: &str, operator: &ConditionOperator) -> bool {
        match operator {
            ConditionOperator::Equals => text == pattern,
            ConditionOperator::Contains => text.contains(pattern),
            ConditionOperator::StartsWith => text.starts_with(pattern),
            ConditionOperator::EndsWith => text.ends_with(pattern),
            ConditionOperator::Regex => {
                // TODO: Implement regex matching
                false
            }
        }
    }
}

impl Default for MacroEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct ExecutionResult {
    pub command_id: String,
    pub success: bool,
    pub steps_executed: usize,
    pub steps_skipped: usize,
    pub errors: Vec<String>,
    pub duration_ms: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::custom_command::{CommandStep, CommandType};

    #[tokio::test]
    async fn test_dry_run_execution() {
        let engine = MacroEngine::with_dry_run(true);
        let mut cmd = CustomCommand::new("Test".to_string(), CommandType::KeyboardMacro);
        
        cmd.add_step(CommandStep::new(
            0,
            StepAction::Delay { milliseconds: 100 },
        ));

        let result = engine.execute_command(&cmd).await.unwrap();
        assert!(result.success);
        assert_eq!(result.steps_executed, 1);
    }

    #[tokio::test]
    async fn test_validation_failure() {
        let engine = MacroEngine::new();
        let cmd = CustomCommand::new("".to_string(), CommandType::KeyboardMacro);

        let result = engine.execute_command(&cmd).await;
        assert!(result.is_err());
    }
}
