use crate::commands::AppError;
use crate::domain::{Action, ActionId, ActionPayload};
use crate::services::audit_log::AuditLogger;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter};

const ACTION_EXECUTED_EVENT: &str = "actions://executed";
const ACTION_FAILED_EVENT: &str = "actions://failed";

#[derive(Clone)]
pub struct ActionRunner {
    app: AppHandle,
    audit: AuditLogger,
    data_dir: PathBuf,
}

pub trait ActionProvider: Send + Sync {
    fn get_action(&self, id: &ActionId) -> Option<Action>;
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionRunStatus {
    Success,
    Skipped,
    Failure,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionEventPayload {
    pub id: String,
    pub name: String,
    pub status: ActionRunStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl ActionRunner {
    pub fn new(app: AppHandle, data_dir: PathBuf, audit: AuditLogger) -> Self {
        Self { app, audit, data_dir }
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub async fn run<P>(&self, action: &Action, provider: &P) -> Result<(), AppError>
    where
        P: ActionProvider,
    {
        let mut visited = HashSet::new();
        let result = self.execute(action, provider, &mut visited).await;

        match result {
            Ok(status) => {
                let message = match status {
                    ActionRunStatus::Success => {
                        Some(format!("Action '{}' executed", action.name))
                    }
                    ActionRunStatus::Skipped => Some(format!(
                        "Action '{}' skipped (not implemented)",
                        action.name
                    )),
                    ActionRunStatus::Failure => None,
                };
                if let Some(msg) = message {
                    self.log_info(&msg)?;
                }
                self.emit_event(ACTION_EXECUTED_EVENT, action, status, None);
                Ok(())
            }
            Err(err) => {
                let message = err.to_string();
                self.log_error(&message);
                self.emit_event(
                    ACTION_FAILED_EVENT,
                    action,
                    ActionRunStatus::Failure,
                    Some(message.clone()),
                );
                Err(err)
            }
        }
    }

    async fn execute<P>(
        &self,
        action: &Action,
        provider: &P,
        visited: &mut HashSet<ActionId>,
    ) -> Result<ActionRunStatus, AppError>
    where
        P: ActionProvider,
    {
        if !visited.insert(action.id) {
            return Err(AppError::Message(format!(
                "cycle detected while executing action {}",
                action.id
            )));
        }

        let status = match &action.payload {
            ActionPayload::LaunchProgram {
                executable,
                arguments,
                working_dir,
            } => {
                self.launch_program(executable, arguments, working_dir.as_deref())?;
                ActionRunStatus::Success
            }
            ActionPayload::SendKeys { .. } => {
                self.log_info(&format!(
                    "SendKeys payload for action '{}' is not yet implemented",
                    action.name
                ))?;
                ActionRunStatus::Skipped
            }
            ActionPayload::RunScript { language, script } => {
                self.log_info(&format!(
                    "RunScript payload for action '{}' (language: {}) not yet implemented",
                    action.name,
                    language
                ))?;
                ActionRunStatus::Skipped
            }
            ActionPayload::SystemCommand { command } => {
                self.run_system_command(command)?;
                ActionRunStatus::Success
            }
            ActionPayload::Composite { actions } => {
                for action_id in actions {
                    let Some(next_action) = provider.get_action(action_id) else {
                        return Err(AppError::Message(format!(
                            "referenced action {action_id} not found"
                        )));
                    };
                    let status = self.execute(&next_action, provider, visited).await?;
                    if matches!(status, ActionRunStatus::Failure) {
                        return Ok(ActionRunStatus::Failure);
                    }
                }
                ActionRunStatus::Success
            }
            ActionPayload::Custom { kind, .. } => {
                self.log_info(&format!(
                    "Custom payload '{}' for action '{}' is not supported",
                    kind,
                    action.name
                ))?;
                ActionRunStatus::Skipped
            }
        };

        visited.remove(&action.id);
        Ok(status)
    }

    fn launch_program(
        &self,
        executable: &str,
        arguments: &[String],
        working_dir: Option<&str>,
    ) -> Result<(), AppError> {
        let mut command = if executable.contains(':') || Path::new(executable).is_absolute() {
            Command::new(executable)
        } else {
            let resolved = self.resolve_relative(executable);
            Command::new(resolved)
        };

        if let Some(dir) = working_dir {
            command.current_dir(self.resolve_relative(dir));
        }

        if !arguments.is_empty() {
            command.args(arguments);
        }

        command.spawn().map_err(|err| {
            AppError::Message(format!("failed to launch program '{executable}': {err}"))
        })?;

        Ok(())
    }

    fn run_system_command(&self, command: &str) -> Result<(), AppError> {
        #[cfg(target_os = "windows")]
        let mut process = {
            let mut cmd = Command::new("cmd");
            cmd.args(["/C", command]);
            cmd
        };

        #[cfg(not(target_os = "windows"))]
        let mut process = {
            let mut cmd = Command::new("sh");
            cmd.args(["-c", command]);
            cmd
        };

        process.spawn().map_err(|err| {
            AppError::Message(format!("failed to run system command '{command}': {err}"))
        })?;

        Ok(())
    }

    fn resolve_relative(&self, value: &str) -> PathBuf {
        let path = PathBuf::from(value);
        if path.is_absolute() || !(value.contains('/') || value.contains('\\')) {
            path
        } else {
            self.data_dir.join(path)
        }
    }

    fn emit_event(
        &self,
        event: &str,
        action: &Action,
        status: ActionRunStatus,
        message: Option<String>,
    ) {
        let payload = ActionEventPayload {
            id: action.id.to_string(),
            name: action.name.clone(),
            status,
            message,
        };

        if let Err(err) = self.app.emit(event, payload) {
            eprintln!("failed to emit '{event}' event: {err}");
        }
    }

    fn log_info(&self, message: &str) -> Result<(), AppError> {
        self.audit
            .log("INFO", message)
            .map_err(AppError::from)
    }

    fn log_error(&self, message: &str) {
        self.audit.log_err("ERROR", message);
    }
}
