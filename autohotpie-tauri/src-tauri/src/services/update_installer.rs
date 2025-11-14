use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationProgress {
    pub stage: String,
    pub percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationComplete {
    pub success: bool,
    pub restart_required: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationError {
    pub stage: String,
    pub message: String,
}

pub const INSTALLATION_START_EVENT: &str = "updates://installation-start";
pub const INSTALLATION_PROGRESS_EVENT: &str = "updates://installation-progress";
pub const INSTALLATION_COMPLETE_EVENT: &str = "updates://installation-complete";
pub const INSTALLATION_ERROR_EVENT: &str = "updates://installation-error";
pub const INSTALLATION_CONSENT_REQUIRED_EVENT: &str = "updates://installation-consent-required";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallationConsent {
    pub title: String,
    pub message: String,
    pub details: Vec<String>,
    pub accept_label: String,
    pub decline_label: String,
}

pub struct UpdateInstaller {
    temp_dir: PathBuf,
}

impl UpdateInstaller {
    pub fn new(temp_dir: PathBuf) -> Result<Self> {
        // Ensure temp directory exists
        std::fs::create_dir_all(&temp_dir)
            .context("failed to create installation temp directory")?;

        Ok(Self { temp_dir })
    }

    pub async fn install_update<R: Runtime>(
        &self,
        app: AppHandle<R>,
        update_path: &Path,
        require_consent: bool,
    ) -> Result<()> {
        // Emit installation start event
        app.emit(INSTALLATION_START_EVENT, ())
            .context("failed to emit installation start event")?;

        // Verify the update file exists
        if !update_path.exists() {
            return Err(anyhow!("Update file not found: {}", update_path.display()));
        }

        // Get platform-specific installation info
        let platform_info = self.get_platform_info(update_path)?;

        // Request user consent if required
        if require_consent {
            let consent = self.create_consent_info(&platform_info);
            app.emit(INSTALLATION_CONSENT_REQUIRED_EVENT, consent)
                .context("failed to emit consent required event")?;
            
            // For now, we'll proceed without waiting for user response
            // In a full implementation, this would wait for user consent
        }

        // Perform the installation
        let result = self.perform_installation(&app, update_path, &platform_info).await;

        match &result {
            Ok(install_result) => {
                app.emit(INSTALLATION_COMPLETE_EVENT, install_result.clone())
                    .context("failed to emit installation complete event")?;
            }
            Err(e) => {
                let error = InstallationError {
                    stage: "installation".to_string(),
                    message: e.to_string(),
                };
                app.emit(INSTALLATION_ERROR_EVENT, error)
                    .context("failed to emit installation error event")?;
            }
        }

        result.map(|_| ())
    }

    fn get_platform_info(&self, update_path: &Path) -> Result<PlatformInstallationInfo> {
        #[cfg(target_os = "windows")]
        {
            if update_path.extension().and_then(|s| s.to_str()) == Some("exe") {
                Ok(PlatformInstallationInfo::WindowsExe {
                    installer_path: update_path.to_path_buf(),
                    silent_args: vec!["/S".to_string(), "/quiet".to_string()],
                })
            } else if update_path.extension().and_then(|s| s.to_str()) == Some("msi") {
                Ok(PlatformInstallationInfo::WindowsMsi {
                    msi_path: update_path.to_path_buf(),
                    silent_args: vec!["/quiet".to_string(), "/norestart".to_string()],
                })
            } else {
                Err(anyhow!("Unsupported Windows update format"))
            }
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
        {
            Err(anyhow!("Unsupported platform for updates"))
        }
    }

    fn create_consent_info(&self, platform_info: &PlatformInstallationInfo) -> InstallationConsent {
        let title = "Update Available".to_string();
        let message = "A new version of AutoHotPie is ready to install.".to_string();
        
        let mut details = vec![
            "This will update your application to the latest version.".to_string(),
            "Your settings and profiles will be preserved.".to_string(),
        ];

        #[cfg(target_os = "windows")]
        match platform_info {
            PlatformInstallationInfo::WindowsExe { .. } => {
                details.push("The installer will run in silent mode.".to_string());
            }
            PlatformInstallationInfo::WindowsMsi { .. } => {
                details.push("The MSI installer will run with minimal user interface.".to_string());
            }
        }

        InstallationConsent {
            title,
            message,
            details,
            accept_label: "Install Update".to_string(),
            decline_label: "Cancel".to_string(),
        }
    }

    async fn perform_installation<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        update_path: &Path,
        platform_info: &PlatformInstallationInfo,
    ) -> Result<InstallationComplete> {
        app.emit(INSTALLATION_PROGRESS_EVENT, InstallationProgress {
            stage: "preparing".to_string(),
            percent: 10.0,
        }).ok();

        // Stage 1: Verify the update file
        self.verify_update_file(update_path).await?;
        
        app.emit(INSTALLATION_PROGRESS_EVENT, InstallationProgress {
            stage: "verifying".to_string(),
            percent: 25.0,
        }).ok();

        // Stage 2: Prepare installation
        let prepared_installation = self.prepare_installation(update_path, platform_info).await?;
        
        app.emit(INSTALLATION_PROGRESS_EVENT, InstallationProgress {
            stage: "installing".to_string(),
            percent: 50.0,
        }).ok();

        // Stage 3: Execute installation
        let installation_result = self.execute_installation(&prepared_installation).await?;
        
        app.emit(INSTALLATION_PROGRESS_EVENT, InstallationProgress {
            stage: "finalizing".to_string(),
            percent: 75.0,
        }).ok();

        // Stage 4: Cleanup
        self.cleanup_installation(&prepared_installation).await?;
        
        app.emit(INSTALLATION_PROGRESS_EVENT, InstallationProgress {
            stage: "complete".to_string(),
            percent: 100.0,
        }).ok();

        Ok(installation_result)
    }

    async fn verify_update_file(&self, update_path: &Path) -> Result<()> {
        // Check file size (minimum reasonable size)
        let metadata = fs::metadata(update_path).await?;
        if metadata.len() < 1024 {
            // Less than 1KB is suspicious
            return Err(anyhow!("Update file too small"));
        }

        // Basic file integrity check
        // In a production system, you might want to verify a digital signature
        Ok(())
    }

    async fn prepare_installation(
        &self,
        _update_path: &Path,
        platform_info: &PlatformInstallationInfo,
    ) -> Result<PreparedInstallation> {
        #[cfg(target_os = "windows")]
        match platform_info {
            PlatformInstallationInfo::WindowsExe { installer_path, .. } => {
                Ok(PreparedInstallation::WindowsExe {
                    installer_path: installer_path.clone(),
                })
            }
            PlatformInstallationInfo::WindowsMsi { msi_path, .. } => {
                Ok(PreparedInstallation::WindowsMsi {
                    msi_path: msi_path.clone(),
                })
            }
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
        {
            Err(anyhow!("Update installation is not supported on this platform"))
        }
    }

    async fn execute_installation(&self, prepared: &PreparedInstallation) -> Result<InstallationComplete> {
        #[cfg(target_os = "windows")]
        match prepared {
            PreparedInstallation::WindowsExe { installer_path } => {
                let output = Command::new(installer_path)
                    .args(&["/S", "/quiet"])
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .output()
                    .context("failed to execute Windows installer")?;

                if output.status.success() {
                    Ok(InstallationComplete {
                        success: true,
                        restart_required: false, // Most app updates don't require restart
                        message: "Windows installer completed successfully".to_string(),
                    })
                } else {
                    let error_msg = String::from_utf8_lossy(&output.stderr);
                    Err(anyhow!("Windows installer failed: {}", error_msg))
                }
            }
            PreparedInstallation::WindowsMsi { msi_path } => {
                let output = Command::new("msiexec")
                    .args(&["/i", msi_path.to_str().unwrap(), "/quiet", "/norestart"])
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .output()
                    .context("failed to execute MSI installer")?;

                if output.status.success() {
                    Ok(InstallationComplete {
                        success: true,
                        restart_required: false,
                        message: "MSI installer completed successfully".to_string(),
                    })
                } else {
                    let error_msg = String::from_utf8_lossy(&output.stderr);
                    Err(anyhow!("MSI installer failed: {}", error_msg))
                }
            }
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
        {
            Err(anyhow!("Update installation is not supported on this platform"))
        }
    }

    async fn cleanup_installation(&self, _prepared: &PreparedInstallation) -> Result<()> {
        // Clean up temporary files created during installation
        // For now, no special cleanup is needed for Windows installers
        Ok(())
    }
}

#[derive(Debug, Clone)]
enum PlatformInstallationInfo {
    #[cfg(target_os = "windows")]
    WindowsExe {
        installer_path: PathBuf,
        silent_args: Vec<String>,
    },
    #[cfg(target_os = "windows")]
    WindowsMsi {
        msi_path: PathBuf,
        silent_args: Vec<String>,
    },
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    Unsupported,
}

enum PreparedInstallation {
    #[cfg(target_os = "windows")]
    WindowsExe {
        installer_path: PathBuf,
    },
    #[cfg(target_os = "windows")]
    WindowsMsi {
        msi_path: PathBuf,
    },
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    Unsupported,
}