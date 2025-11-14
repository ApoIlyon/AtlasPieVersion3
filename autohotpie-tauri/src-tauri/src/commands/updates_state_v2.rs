use crate::services::update_checker::UpdateChecker;
use crate::services::update_download::UpdateDownloader;
use crate::services::update_installer::UpdateInstaller;
use std::sync::Arc;

/// Temporary workaround for compilation issues with UpdatesState
pub struct UpdatesStateV2 {
    pub checker: Arc<UpdateChecker>,
    pub downloader: Option<Arc<UpdateDownloader>>,
    pub installer: Option<Arc<UpdateInstaller>>,
}

impl UpdatesStateV2 {
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