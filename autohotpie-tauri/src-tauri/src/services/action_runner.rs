use crate::commands::AppError;
use crate::domain::{Action, ActionEventPayload, ActionEventStatus, ActionId, ActionPayload};
use crate::services::action_events::ActionEventsChannel;
use crate::services::audit_log::AuditLogger;
use std::collections::HashSet;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use std::time::Instant;
use time::OffsetDateTime;
use tokio::process::Command;
use tokio::sync::Semaphore;

pub const ACTION_EXECUTED_EVENT: &str = "actions://executed";
pub const ACTION_FAILED_EVENT: &str = "actions://failed";

type RunnerFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

#[derive(Clone)]
pub struct ActionRunner {
    audit: AuditLogger,
    data_dir: PathBuf,
    events: ActionEventsChannel,
    queue: Arc<Semaphore>,
}

pub trait ActionProvider: Send + Sync {
    fn get_action(&self, id: &ActionId) -> Option<Action>;
}

impl ActionRunner {
    pub fn new(data_dir: PathBuf, audit: AuditLogger, events: ActionEventsChannel) -> Self {
        Self {
            audit,
            data_dir,
            events,
            queue: Arc::new(Semaphore::new(1)),
        }
    }

    #[allow(dead_code)]
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
        let permit = self
            .queue
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| AppError::StatePoisoned)?;

        let timer = Instant::now();
        let result = self
            .execute_internal(action, provider, HashSet::new())
            .await;
        let duration_ms = timer.elapsed().as_millis().min(u32::MAX as u128) as u32;
        let timestamp = OffsetDateTime::now_utc();

        match result {
            Ok((status, message)) => {
                let outcome = self.handle_outcome(action, status, message, duration_ms, timestamp);
                drop(permit);
                outcome
            }
            Err(err) => {
                let message = err.to_string();
                self.log_error(&message);
                let payload = ActionEventPayload::new(
                    action.id,
                    action.name.clone(),
                    ActionEventStatus::Failure,
                    duration_ms,
                    Some(message),
                    timestamp,
                    None,
                );
                self.publish_payload(&payload)?;
                drop(permit);
                Err(err)
            }
        }
    }

    fn execute_internal<'a, P>(
        &'a self,
        action: &'a Action,
        provider: &'a P,
        mut visited: HashSet<ActionId>,
    ) -> RunnerFuture<'a, Result<(ActionEventStatus, Option<String>), AppError>>
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
                    (ActionEventStatus::Success, None)
                }
                ActionPayload::SendKeys { .. } => (
                    ActionEventStatus::Skipped,
                    Some(format!(
                        "Action '{}' skipped: SendKeys payload is not supported yet",
                        action.name
                    )),
                ),
                ActionPayload::RunScript { language, script } => {
                    self.run_script(language, script).await?;
                    (ActionEventStatus::Success, None)
                }
                ActionPayload::SystemCommand { command } => {
                    self.run_system_command(command).await?;
                    (ActionEventStatus::Success, None)
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
                            ActionEventStatus::Success => {}
                            ActionEventStatus::Skipped => {
                                if let Some(value) = msg {
                                    skipped_messages.push(value);
                                }
                            }
                            ActionEventStatus::Failure => {
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
                        (ActionEventStatus::Success, None)
                    } else {
                        let summary = skipped_messages.join("; ");
                        (
                            ActionEventStatus::Skipped,
                            Some(format!(
                                "Composite action '{}' completed with skipped steps: {}",
                                action.name, summary
                            )),
                        )
                    }
                }
                ActionPayload::Custom { handler, .. } => (
                    ActionEventStatus::Skipped,
                    Some(format!(
                        "Action '{}' skipped: custom payload '{}' is not supported",
                        action.name, handler
                    )),
                ),
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
            .map_err(|err| {
                AppError::Message(format!("failed to run system command '{command}': {err}"))
            })?;

        #[cfg(not(target_os = "windows"))]
        let status = Command::new("sh")
            .args(["-c", command])
            .status()
            .await
            .map_err(|err| {
                AppError::Message(format!("failed to run system command '{command}': {err}"))
            })?;

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

        let status = command
            .status()
            .await
            .map_err(|err| AppError::Message(format!("failed to run {label} script: {err}")))?;

        if status.success() {
            Ok(())
        } else {
            Err(AppError::Message(format!(
                "{label} script exited with status {status}"
            )))
        }
    }

    fn handle_outcome(
        &self,
        action: &Action,
        status: ActionEventStatus,
        message: Option<String>,
        duration_ms: u32,
        timestamp: OffsetDateTime,
    ) -> Result<ActionEventPayload, AppError> {
        let default_message = match status {
            ActionEventStatus::Success => {
                format!("Action '{}' executed", action.name)
            }
            ActionEventStatus::Skipped => {
                format!("Action '{}' skipped (not supported)", action.name)
            }
            ActionEventStatus::Failure => format!("Action '{}' failed", action.name),
        };

        let final_message = message.unwrap_or(default_message);
        match status {
            ActionEventStatus::Success => self.log_info(&final_message)?,
            ActionEventStatus::Skipped => self.log_warn(&final_message)?,
            ActionEventStatus::Failure => self.log_error(&final_message),
        }

        let payload = ActionEventPayload::new(
            action.id,
            action.name.clone(),
            status,
            duration_ms,
            Some(final_message.clone()),
            timestamp,
            None,
        );

        self.publish_payload(&payload)?;

        if status == ActionEventStatus::Failure {
            return Err(AppError::Message(final_message));
        }

        Ok(payload)
    }

    fn log_info(&self, message: &str) -> Result<(), AppError> {
        self.audit.log("INFO", message).map_err(AppError::from)
    }

    fn log_warn(&self, message: &str) -> Result<(), AppError> {
        self.audit.log("WARN", message).map_err(AppError::from)
    }

    fn log_error(&self, message: &str) {
        self.audit.log_err("ERROR", message);
    }

    fn publish_payload(&self, payload: &ActionEventPayload) -> Result<(), AppError> {
        self.audit.log_action_outcome(payload)?;
        self.events.emit(payload.clone());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::storage::StorageManager;
    use serde_json::Value;
    use std::collections::HashMap;
    use tauri::async_runtime::block_on;
    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
    #[derive(Default)]
    struct MapProvider {
        actions: HashMap<ActionId, Action>,
    }

    impl MapProvider {
        fn insert(&mut self, action: Action) {
            self.actions.insert(action.id, action);
        }
    }

    impl ActionProvider for MapProvider {
        fn get_action(&self, id: &ActionId) -> Option<Action> {
            self.actions.get(id).cloned()
        }
    }

    fn build_runner(app: &tauri::App<MockRuntime>) -> (ActionRunner, ActionEventsChannel) {
        let handle = app.handle();
        let storage = StorageManager::new(handle.clone()).expect("storage");
        let audit = AuditLogger::from_storage(&storage).expect("audit");
        let events = ActionEventsChannel::new(16);
        let data_dir = storage.base_dir().to_path_buf();
        let runner = ActionRunner::new(data_dir, audit, events.clone());
        (runner, events)
    }

    fn create_app() -> tauri::App<MockRuntime> {
        mock_builder()
            .build(mock_context(noop_assets()))
            .expect("build app")
    }

    fn composite_action(children: Vec<ActionId>, name: &str) -> Action {
        Action {
            id: ActionId::new(),
            name: name.to_string(),
            description: None,
            payload: ActionPayload::Composite { actions: children },
            enabled: true,
        }
    }

    fn skip_action(name: &str) -> Action {
        Action {
            id: ActionId::new(),
            name: name.to_string(),
            description: None,
            payload: ActionPayload::Custom {
                handler: "noop".to_string(),
                params: Value::Null,
            },
            enabled: true,
        }
    }

    #[test]
    fn emits_skipped_payload_for_composite_sequence() {
        let app = create_app();
        let (runner, events) = build_runner(&app);
        let mut provider = MapProvider::default();

        let child_success = composite_action(Vec::new(), "child-success");
        let child_skip = skip_action("child-skip");
        let parent = composite_action(vec![child_success.id, child_skip.id], "parent");

        provider.insert(child_success.clone());
        provider.insert(child_skip.clone());
        provider.insert(parent.clone());

        let payload = block_on(runner.run(&parent, &provider)).expect("run should succeed");
        assert_eq!(payload.id, parent.id);
        assert_eq!(payload.status, ActionEventStatus::Skipped);
        assert!(payload
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("child-skip"));

        let history = events.recent();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].status, ActionEventStatus::Skipped);
        assert_eq!(history[0].id, parent.id);
    }

    #[test]
    fn emits_failure_payload_when_child_missing() {
        let app = create_app();
        let (runner, events) = build_runner(&app);
        let mut provider = MapProvider::default();

        let missing_child = ActionId::new();
        let parent = composite_action(vec![missing_child], "parent");
        provider.insert(parent.clone());

        let result = block_on(runner.run(&parent, &provider));
        assert!(result.is_err());

        let history = events.recent();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].status, ActionEventStatus::Failure);
        assert_eq!(history[0].id, parent.id);
        assert!(history[0]
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("not found"));
    }
}
