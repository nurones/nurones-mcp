use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

/// Virtual connector for in-process IDE/tool connections
/// No external port - manages connections internally
#[derive(Clone, Default)]
pub struct VirtualConnector {
    connections: Arc<AtomicU64>,
}

impl VirtualConnector {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn connect(&self) {
        self.connections.fetch_add(1, Ordering::SeqCst);
        tracing::info!("Virtual connector: connection established");
    }

    pub fn disconnect(&self) {
        self.connections.fetch_sub(1, Ordering::SeqCst);
        tracing::info!("Virtual connector: connection closed");
    }

    pub fn active(&self) -> u64 {
        self.connections.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_virtual_connector() {
        let vc = VirtualConnector::new();
        assert_eq!(vc.active(), 0);

        vc.connect();
        assert_eq!(vc.active(), 1);

        vc.connect();
        assert_eq!(vc.active(), 2);

        vc.disconnect();
        assert_eq!(vc.active(), 1);

        vc.disconnect();
        assert_eq!(vc.active(), 0);
    }
}
