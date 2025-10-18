use crate::commands::AppError;
use crate::domain::{Action, ActionId, ActionPayload};
use crate::services::audit_log::AuditLogger;
use serde::Serialize;
use std::collections::HashSet;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;

const ACTION_EXECUTED_EVENT: &str = "actions://executed";
const ACTION_FAILED_EVENT: &str = "actions://failed";

type RunnerFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

#[derive(Clone)]
pub struct ActionRunner {
    app: AppHandle,
    audit: AuditLogger,
    data_dir: PathBuf,
}

pub trait ActionProvider: Send + Sync {
    fn get_action(&self, id: &ActionId) -> Option<Action>;
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum ActionRunStatus {
    Success,
    Skipped,
    Failure,
}

#[derive(Debug, Serialize, Clone)]
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

    pub async fn run<P>(
        &self,
        action: &Action,
        provider: &P,
    ) -> Result<ActionEventPayload, AppError>
    where
        P: ActionProvider,
    {
        match self.execute_internal(action, provider, HashSet::new()).await {
            Ok((status, message)) => {
                match status {
                    ActionRunStatus::Success => {
                        let info = message
                            .unwrap_or_else(|| format!("Action '{}' executed", action.name));
                        self.log_info(&info)?;
                        let payload = ActionEventPayload {
                            id: action.id.to_string(),
                            name: action.name.clone(),
                            status: ActionRunStatus::Success,
                            message: Some(info),
                        };
                        self.emit_payload_event(ACTION_EXECUTED_EVENT, &payload);
                        Ok(payload)
                    }
                    ActionRunStatus::Skipped => {
                        let note = message.unwrap_or_else(|| {
                            format!("Action '{}' skipped (not supported)", action.name)
                        });
                        self.log_warn(&note)?;
                        let payload = ActionEventPayload {
                            id: action.id.to_string(),
                            name: action.name.clone(),
                            status: ActionRunStatus::Skipped,
                            message: Some(note),
                        };
                        self.emit_payload_event(ACTION_EXECUTED_EVENT, &payload);
                        Ok(payload)
                    }
                    ActionRunStatus::Failure => {
                        // Currently we should not reach this branch via Ok-path, treat as error.
                        let failure = message.unwrap_or_else(|| {
                            format!("Action '{}' failed", action.name)
                        });
                        self.log_error(&failure);
                        let failure_payload = ActionEventPayload {
                            id: action.id.to_string(),
                            name: action.name.clone(),
                            status: ActionRunStatus::Failure,
                            message: Some(failure.clone()),
                        };
                        self.emit_payload_event(ACTION_FAILED_EVENT, &failure_payload);
                        Err(AppError::Message(failure))
                    }
                }
            }
            Err(err) => {
                let message = err.to_string();
                self.log_error(&message);
                let payload = ActionEventPayload {
                    id: action.id.to_string(),
                    name: action.name.clone(),
                    status: ActionRunStatus::Failure,
                    message: Some(message.clone()),
                };
                self.emit_payload_event(ACTION_FAILED_EVENT, &payload);
                Err(err)
            }
        }
    }

    fn execute_internal<'a, P>(
        &'a self,
        action: &'a Action,
        provider: &'a P,
        mut visited: HashSet<ActionId>,
    ) -> RunnerFuture<'a, Result<(ActionRunStatus, Option<String>), AppError>>
    where
        P: ActionProvider + 'a,
    {
        Box::pin(async move {
            if !visited.insert(action.id) {
                return Err(AppError::Message(format!(
                    "cycle detected while executing action {}",
                    action.id
                )));
            }

            let outcome = match &action.payload {
                ActionPayload::LaunchProgram {
                    executable,
                    arguments,
                    working_dir,
                } => {
                    self.launch_program(executable, arguments, working_dir.as_deref())?;
                    (ActionRunStatus::Success, None)
                }
                ActionPayload::SendKeys { .. } => (
                    ActionRunStatus::Skipped,
                    Some(format!(
                        "Action '{}' skipped: SendKeys payload is not supported yet",
                        action.name
                    )),
                ),
                ActionPayload::RunScript { language, script } => {
                    self.run_script(language, script).await?;
                    (ActionRunStatus::Success, None)
                }
                ActionPayload::SystemCommand { command } => {
                    self.run_system_command(command).await?;
                    (ActionRunStatus::Success, None)
                }
                ActionPayload::Composite { actions } => {
                    let mut skipped_messages: Vec<String> = Vec::new();
                    for action_id in actions {
                        let Some(next_action) = provider.get_action(action_id) else {
                            return Err(AppError::Message(format!(
                                "referenced action {action_id} not found"
                            )));
                        };
                        let (status, msg) = self
                            .execute_internal(&next_action, provider, visited.clone())
                            .await?;
                        match status {
                            ActionRunStatus::Success => {}
                            ActionRunStatus::Skipped => {
                                if let Some(value) = msg {
                                    skipped_messages.push(value);
                                }
                            }
                            ActionRunStatus::Failure => {
                                return Err(AppError::Message(msg.unwrap_or_else(|| {
                                    format!(
                                        "Composite action '{}' failed while executing child {}",
                                        action.name, action_id
                                    )
                                })));
                            }
                        }
                    }

                    if skipped_messages.is_empty() {
                        (ActionRunStatus::Success, None)
                    } else {
                        let summary = skipped_messages.join("; ");
                        (
                            ActionRunStatus::Skipped,
                            Some(format!(
                                "Composite action '{}' completed with skipped steps: {}",
                                action.name, summary
                            )),
                        )
                    }
                }
                ActionPayload::Custom { handler, .. } => {
                    (
                        ActionRunStatus::Skipped,
                        Some(format!(
                            "Action '{}' skipped: custom payload '{}' is not supported",
                            action.name, handler
                        )),
                    )
                }
            };

            Ok(outcome)
        })
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

    async fn run_system_command(&self, command: &str) -> Result<(), AppError> {
        #[cfg(target_os = "windows")]
        let status = Command::new("cmd")
            .args(["/C", command])
            .status()
            .await
            .map_err(|err| AppError::Message(format!(
                "failed to run system command '{command}': {err}"
            )))?;

        #[cfg(not(target_os = "windows"))]
        let status = Command::new("sh")
            .args(["-c", command])
            .status()
            .await
            .map_err(|err| AppError::Message(format!(
                "failed to run system command '{command}': {err}"
            )))?;

        if status.success() {
            Ok(())
        } else {
            Err(AppError::Message(format!(
                "system command '{command}' exited with status {status}"
            )))
        }
    }

    fn resolve_relative(&self, value: &str) -> PathBuf {
        let path = PathBuf::from(value);
        if path.is_absolute() || !(value.contains('/') || value.contains('\\')) {
            path
        } else {
            self.data_dir.join(path)
        }
    }

    async fn run_script(&self, language: &str, script: &str) -> Result<(), AppError> {
        let lang = language.trim().to_ascii_lowercase();
        let (mut command, label) = match lang.as_str() {
            "powershell" | "pwsh" => {
                let shell = if cfg!(target_os = "windows") {
                    "powershell"
                } else {
                    "pwsh"
                };
                let mut cmd = Command::new(shell);
                cmd.args(["-NoLogo", "-NoProfile", "-Command", script]);
                (cmd, shell.to_string())
            }
            "cmd" => {
                if cfg!(not(target_os = "windows")) {
                    return Err(AppError::Message(
                        "cmd scripts are only supported on Windows".to_string(),
                    ));
                }
                let mut cmd = Command::new("cmd");
                cmd.args(["/C", script]);
                (cmd, "cmd".to_string())
            }
            "bash" | "sh" => {
                let shell = if lang == "bash" { "bash" } else { "sh" };
                let mut cmd = Command::new(shell);
                cmd.args(["-c", script]);
                (cmd, shell.to_string())
            }
            "python" => {
                let mut cmd = Command::new("python");
                cmd.args(["-c", script]);
                (cmd, "python".to_string())
            }
            "node" | "javascript" | "js" => {
                let mut cmd = Command::new("node");
                cmd.args(["-e", script]);
                (cmd, "node".to_string())
            }
            other => {
                return Err(AppError::Message(format!(
                    "unsupported script language '{}'",
                    other
                )))
            }
        };

        let status = command.status().await.map_err(|err| {
            AppError::Message(format!("failed to run {label} script: {err}"))
        })?;

        if status.success() {
            Ok(())
        } else {
            Err(AppError::Message(format!(
                "{label} script exited with status {status}"
            )))
        }
    }

    fn emit_payload_event(&self, event: &str, payload: &ActionEventPayload) {
        if let Err(err) = self.app.emit(event, payload) {
            eprintln!("failed to emit '{event}' event: {err}");
        }
    }

    fn log_info(&self, message: &str) -> Result<(), AppError> {
        self.audit
            .log("INFO", message)
            .map_err(AppError::from)
    }

    fn log_warn(&self, message: &str) -> Result<(), AppError> {
        self.audit
            .log("WARN", message)
            .map_err(AppError::from)
    }

    fn log_error(&self, message: &str) {
        self.audit.log_err("ERROR", message);
    }
}
