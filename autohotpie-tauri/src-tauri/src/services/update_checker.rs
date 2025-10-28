use anyhow::{anyhow, Context, Result};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

const OWNER_ENV: &str = "AUTOHOTPIE_UPDATE_OWNER";
const REPO_ENV: &str = "AUTOHOTPIE_UPDATE_REPO";
const TOKEN_ENV: &str = "AUTOHOTPIE_UPDATE_TOKEN";
const OWNER_DEFAULT: &str = "Atlas-Engineering";
const REPO_DEFAULT: &str = "AutoHotPie";
const RELEASES_ENDPOINT: &str = "https://api.github.com/repos";
const USER_AGENT: &str = "autohotpie-tauri/1.0";
const MIN_CHECK_INTERVAL: Duration = Duration::from_secs(60 * 60); // 1 hour throttle
const POLL_INTERVAL: Duration = Duration::from_secs(60 * 60 * 6); // 6 hours background polling
pub const UPDATE_EVENT: &str = "updates://status";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub is_update_available: bool,
    pub download_url: Option<String>,
    pub release_notes: Option<String>,
    pub last_checked: Option<String>,
    pub error: Option<String>,
}

impl UpdateStatus {
    fn new(current_version: String) -> Self {
        Self {
            current_version,
            latest_version: None,
            is_update_available: false,
            download_url: None,
            release_notes: None,
            last_checked: None,
            error: None,
        }
    }

    fn with_timestamp(mut self) -> Self {
        self.last_checked = OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .ok();
        self
    }
}

struct UpdateCache {
    last_check: Option<Instant>,
    status: UpdateStatus,
    in_progress: bool,
}

pub struct UpdateChecker {
    client: Client,
    state: Mutex<UpdateCache>,
}

impl UpdateChecker {
    pub fn new(current_version: String) -> Result<Self> {
        let client = Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(15))
            .build()
            .context("failed to build HTTP client")?;

        Ok(Self {
            client,
            state: Mutex::new(UpdateCache {
                last_check: None,
                status: UpdateStatus::new(current_version),
                in_progress: false,
            }),
        })
    }

    fn now() -> Instant {
        Instant::now()
    }

    pub fn cached_status(&self) -> UpdateStatus {
        self.state
            .lock()
            .expect("update checker cache poisoned")
            .status
            .clone()
    }

    pub async fn check_for_updates(&self, force: bool) -> Result<UpdateStatus> {
        let should_check = {
            let mut guard = self
                .state
                .lock()
                .expect("update checker cache poisoned");

            if guard.in_progress {
                return Ok(guard.status.clone());
            }

            if !force {
                if let Some(last) = guard.last_check {
                    if Self::now().saturating_duration_since(last) < MIN_CHECK_INTERVAL {
                        return Ok(guard.status.clone());
                    }
                }
            }

            guard.in_progress = true;
            true
        };

        if !should_check {
            return Ok(self.cached_status());
        }

        let result = self.perform_remote_check().await;

        let mut guard = self
            .state
            .lock()
            .expect("update checker cache poisoned");
        guard.last_check = Some(Self::now());
        guard.in_progress = false;

        match result {
            Ok(status) => {
                guard.status = status.with_timestamp();
            }
            Err(err) => {
                let mut status = guard.status.clone();
                status.error = Some(err.to_string());
                guard.status = status.with_timestamp();
            }
        }

        Ok(guard.status.clone())
    }

    async fn perform_remote_check(&self) -> Result<UpdateStatus> {
        let owner = std::env::var(OWNER_ENV).unwrap_or_else(|_| OWNER_DEFAULT.to_string());
        let repo = std::env::var(REPO_ENV).unwrap_or_else(|_| REPO_DEFAULT.to_string());
        let request_url = format!("{RELEASES_ENDPOINT}/{owner}/{repo}/releases");
        let mut request = self
            .client
            .get(&request_url)
            .header("Accept", "application/vnd.github+json");

        if let Ok(token) = std::env::var(TOKEN_ENV) {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                request = request.bearer_auth(trimmed);
            }
        }

        let response = request
            .send()
            .await
            .map_err(|err| anyhow!("updates.error.network:{err}"))?;

        match response.status() {
            StatusCode::OK => {}
            StatusCode::FORBIDDEN => {
                return Err(anyhow!("updates.error.rateLimit"));
            }
            StatusCode::UNAUTHORIZED => {
                return Err(anyhow!("updates.error.unauthorized"));
            }
            StatusCode::NOT_FOUND => {
                return Err(anyhow!("updates.error.notFound"));
            }
            other => {
                return Err(anyhow!("updates.error.http:{}", other.as_u16()));
            }
        }

        let releases: Vec<GitHubRelease> = response
            .json()
            .await
            .map_err(|err| anyhow!("updates.error.parse:{err}"))?;

        let mut status = {
            self
                .state
                .lock()
                .expect("update checker cache poisoned")
                .status
                .clone()
        };
        if let Some(release) = releases.into_iter().find(|r| !r.draft && !r.prerelease) {
            let latest_version = normalize_tag(&release.tag_name);
            let is_update_available = is_newer(&latest_version, &status.current_version);
            status.latest_version = Some(latest_version.clone());
            status.is_update_available = is_update_available;
            status.download_url = release
                .assets
                .iter()
                .find_map(|asset| asset.browser_download_url.clone())
                .or_else(|| release.html_url.clone());
            status.release_notes = release.body.clone();
            status.error = None;
        } else {
            status.latest_version = None;
            status.is_update_available = false;
            status.download_url = None;
            status.release_notes = None;
            status.error = Some("updates.error.noReleases".into());
        }

        Ok(status)
    }
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    prerelease: bool,
    draft: bool,
    html_url: Option<String>,
    body: Option<String>,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    #[serde(default)]
    browser_download_url: Option<String>,
}

pub fn start_polling<R: Runtime>(app: AppHandle<R>, checker: Arc<UpdateChecker>) {
    tauri::async_runtime::spawn(async move {
        loop {
            let status = checker
                .check_for_updates(false)
                .await
                .unwrap_or_else(|err| {
                    let mut cached = checker.cached_status();
                    cached.error = Some(err.to_string());
                    cached.with_timestamp()
                });

            let _ = app.emit(UPDATE_EVENT, status);
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    });
}

pub fn emit_status<R: Runtime>(app: &AppHandle<R>, status: &UpdateStatus) {
    let _ = app.emit(UPDATE_EVENT, status.clone());
}

fn normalize_tag(tag: &str) -> String {
    tag.trim_start_matches('v').to_string()
}

fn is_newer(latest: &str, current: &str) -> bool {
    let latest_vec = parse_version(latest);
    let mut current_vec = parse_version(current);

    let max_len = latest_vec.len().max(current_vec.len());
    let mut latest_vec = latest_vec;
    latest_vec.resize(max_len, 0);
    current_vec.resize(max_len, 0);

    for (l, c) in latest_vec.iter().zip(current_vec.iter()) {
        if l > c {
            return true;
        } else if l < c {
            return false;
        }
    }

    false
}

fn parse_version(version: &str) -> Vec<i32> {
    version
        .split(|c| c == '.' || c == '-' || c == '+')
        .filter(|component| !component.is_empty())
        .map(|component| match component {
            "rc" => -1,
            "beta" => -2,
            "alpha" => -3,
            other => other.parse::<i32>().unwrap_or(0),
        })
        .collect()
}
