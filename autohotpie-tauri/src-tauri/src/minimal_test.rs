// Minimal test to verify UpdatesState compilation
use std::sync::Arc;
use crate::services::update_checker::UpdateChecker;
use crate::services::update_download::UpdateDownloader;
use crate::services::update_installer::UpdateInstaller;

pub struct MinimalUpdatesState {
    pub checker: Arc<UpdateChecker>,
    pub downloader: Option<Arc<UpdateDownloader>>,
    pub installer: Option<Arc<UpdateInstaller>>,
}

pub fn test_minimal_state() {
    // This should compile if the types are correct
    let _state = MinimalUpdatesState {
        checker: Arc::new(UpdateChecker::new("1.0.0".to_string()).unwrap()),
        downloader: None,
        installer: None,
    };
}