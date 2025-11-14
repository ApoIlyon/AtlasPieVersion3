use crate::services::update_checker::UpdateChecker;
use crate::services::update_download::UpdateDownloader;
use crate::services::update_installer::UpdateInstaller;
use std::sync::Arc;

// Test struct to verify compilation
pub struct TestUpdatesState {
    pub checker: Arc<UpdateChecker>,
    pub downloader: Option<Arc<UpdateDownloader>>,
    pub installer: Option<Arc<UpdateInstaller>>,
}

// Test function to verify set_update_channel exists
pub fn test_set_update_channel(checker: &UpdateChecker, channel: String) {
    let _status = checker.set_update_channel(channel);
}