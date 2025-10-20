use crate::domain::ActionEventPayload;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct ActionEventsChannel {
    sender: broadcast::Sender<ActionEventPayload>,
    history: Arc<Mutex<VecDeque<ActionEventPayload>>>,
    capacity: usize,
}

impl ActionEventsChannel {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self {
            sender,
            history: Arc::new(Mutex::new(VecDeque::with_capacity(capacity))),
            capacity,
        }
    }

    pub fn emit(&self, payload: ActionEventPayload) {
        if let Ok(mut history) = self.history.lock() {
            if history.len() == self.capacity {
                history.pop_front();
            }
            history.push_back(payload.clone());
        }

        let _ = self.sender.send(payload);
    }

    pub fn recent(&self) -> Vec<ActionEventPayload> {
        self.history
            .lock()
            .map(|guard| guard.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ActionEventPayload> {
        self.sender.subscribe()
    }
}

impl Default for ActionEventsChannel {
    fn default() -> Self {
        Self::new(64)
    }
}
