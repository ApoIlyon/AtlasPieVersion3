use crate::services::{
    update_checker::UpdateChecker,
    update_download::UpdateDownloader,
    update_installer::UpdateInstaller,
};
use std::sync::Arc;

/// State management for update-related functionality
pub struct UpdatesState {
    pub checker: Arc<UpdateChecker>,
    pub downloader: Option<Arc<UpdateDownloader>>,
    pub installer: Option<Arc<UpdateInstaller>>,
}

impl UpdatesState {
    pub fn new(checker: Arc<UpdateChecker>) -> Self {
        Self {
            checker,
            downloader: None,
            installer: None,
        }
    }
    
    pub fn with_services(
        checker: Arc<UpdateChecker>,
        downloader: Arc<UpdateDownloader>,
        installer: Arc<UpdateInstaller>,
    ) -> Self {
        Self {
            checker,
            downloader: Some(downloader),
            installer: Some(installer),
        }
    }
}