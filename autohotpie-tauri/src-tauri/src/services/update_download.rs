use anyhow::{anyhow, Context, Result};
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::fs as async_fs;
use tokio::io::AsyncWriteExt;
use tokio::io::AsyncReadExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub received: u64,
    pub total: Option<u64>,
    pub percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadComplete {
    pub path: String,
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadError {
    pub message: String,
}

pub const DOWNLOAD_START_EVENT: &str = "updates://download-start";
pub const DOWNLOAD_PROGRESS_EVENT: &str = "updates://download-progress";
pub const DOWNLOAD_COMPLETE_EVENT: &str = "updates://download-complete";
pub const DOWNLOAD_ERROR_EVENT: &str = "updates://download-error";

#[derive(Debug, Clone)]
pub struct DownloadState {
    pub url: String,
    pub path: PathBuf,
    pub total_size: Option<u64>,
    pub received: u64,
    pub is_cancelled: bool,
}

pub struct UpdateDownloader {
    client: Client,
    download_dir: PathBuf,
    active_download: Arc<Mutex<Option<DownloadState>>>,
}

impl UpdateDownloader {
    pub fn new(download_dir: PathBuf) -> Result<Self> {
        let client = Client::builder()
            .user_agent("autohotpie-tauri/1.0")
            .timeout(std::time::Duration::from_secs(300)) // 5 minute timeout
            .build()
            .context("failed to build HTTP client for downloads")?;

        // Ensure download directory exists
        std::fs::create_dir_all(&download_dir)
            .context("failed to create download directory")?;

        Ok(Self {
            client,
            download_dir,
            active_download: Arc::new(Mutex::new(None)),
        })
    }

    pub fn get_download_path(&self, filename: &str) -> PathBuf {
        self.download_dir.join(filename)
    }

    pub async fn download_update<R: Runtime>(
        &self,
        app: AppHandle<R>,
        url: &str,
        filename: &str,
    ) -> Result<PathBuf> {
        // Check if there's already an active download
        {
            let active = self.active_download.lock().unwrap();
            if active.is_some() {
                return Err(anyhow!("Download already in progress"));
            }
        }

        let download_path = self.get_download_path(filename);
        
        // Emit download start event
        app.emit(DOWNLOAD_START_EVENT, ())
            .ok();

        // Set up download state
        {
            let mut active = self.active_download.lock().unwrap();
            *active = Some(DownloadState {
                url: url.to_string(),
                path: download_path.clone(),
                total_size: None,
                received: 0,
                is_cancelled: false,
            });
        }

        // Perform the download
        let result = self.perform_download(&app, url, &download_path).await;

        // Clear active download
        {
            let mut active = self.active_download.lock().unwrap();
            *active = None;
        }

        match result {
            Ok(_) => {
                // Emit download complete event
                app.emit(DOWNLOAD_COMPLETE_EVENT, DownloadComplete {
                    path: download_path.to_string_lossy().to_string(),
                    checksum: None, // Will be added when we implement checksum verification
                })
                .ok();
                
                Ok(download_path)
            }
            Err(e) => {
                // Emit download error event
                app.emit(DOWNLOAD_ERROR_EVENT, DownloadError {
                    message: e.to_string(),
                })
                .ok();
                
                // Clean up partial download
                if download_path.exists() {
                    fs::remove_file(&download_path).ok();
                }
                
                Err(e)
            }
        }
    }

    async fn perform_download<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        url: &str,
        path: &Path,
    ) -> Result<()> {
        // Send GET request
        let response = self.client
            .get(url)
            .send()
            .await
            .context("failed to start download")?;

        let total_size = response.content_length();
        
        // Update total size in state
        if let Some(total) = total_size {
            let mut active = self.active_download.lock().unwrap();
            if let Some(ref mut state) = *active {
                state.total_size = Some(total);
            }
        }

        // Create temporary file
        let temp_path = path.with_extension("tmp");
        let mut file = async_fs::File::create(&temp_path)
            .await
            .context("failed to create temporary file")?;

        // Stream download
        let mut stream = response.bytes_stream();
        let mut received = 0u64;

        while let Some(chunk) = stream.next().await {
            // Check if download was cancelled
            {
                let active = self.active_download.lock().unwrap();
                if let Some(ref state) = *active {
                    if state.is_cancelled {
                        return Err(anyhow!("Download cancelled by user"));
                    }
                }
            }

            let chunk = chunk.context("failed to receive chunk")?;
            file.write_all(&chunk)
                .await
                .context("failed to write chunk")?;
            
            received += chunk.len() as u64;

            // Emit progress every 64KB
            if received % (64 * 1024) == 0 {
                let percent = if let Some(total) = total_size {
                    (received as f32 / total as f32) * 100.0
                } else {
                    0.0
                };

                app.emit(DOWNLOAD_PROGRESS_EVENT, DownloadProgress {
                    received,
                    total: total_size,
                    percent,
                })
                .ok();
            }
        }

        file.flush().await.context("failed to flush file")?;
        drop(file);

        // Move temp file to final location
        async_fs::rename(&temp_path, path)
            .await
            .context("failed to move downloaded file")?;

        Ok(())
    }

    pub fn cancel_download(&self) -> Result<()> {
        let mut active = self.active_download.lock().unwrap();
        if let Some(ref mut state) = *active {
            state.is_cancelled = true;
            Ok(())
        } else {
            Err(anyhow!("No active download to cancel"))
        }
    }

    pub fn is_downloading(&self) -> bool {
        let active = self.active_download.lock().unwrap();
        active.is_some()
    }

    pub async fn verify_checksum(&self, file_path: &Path, expected_checksum: &str) -> Result<bool> {
        let mut file = async_fs::File::open(file_path)
            .await
            .context("failed to open file for checksum verification")?;
        
        let mut hasher = Sha256::new();
        let mut buffer = vec![0; 8192];
        
        loop {
            let bytes_read = file.read(&mut buffer)
                .await
                .context("failed to read file")?;
            
            if bytes_read == 0 {
                break;
            }
            
            hasher.update(&buffer[..bytes_read]);
        }
        
        let result = hasher.finalize();
        let actual_checksum = hex::encode(result);
        
        Ok(actual_checksum.eq_ignore_ascii_case(expected_checksum))
    }

    pub fn cleanup_old_downloads(&self, keep_days: u64) -> Result<()> {
        let cutoff = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs() - (keep_days * 24 * 60 * 60);

        for entry in fs::read_dir(&self.download_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            // Skip if not a file
            if !path.is_file() {
                continue;
            }
            
            // Check file modification time
            if let Ok(metadata) = entry.metadata() {
                if let Ok(created) = metadata.created() {
                    if let Ok(duration) = created.duration_since(std::time::UNIX_EPOCH) {
                        if duration.as_secs() < cutoff {
                            fs::remove_file(&path).ok();
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

// Helper function to get the appropriate filename from a URL
pub fn get_filename_from_url(url: &str) -> String {
    url.split('/')
        .last()
        .unwrap_or("update.bin")
        .to_string()
}