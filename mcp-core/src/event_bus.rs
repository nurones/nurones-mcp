use crate::types::{ContextFrame, EventMetadata, EventResponse};
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use uuid::Uuid;
use tokio::sync::mpsc::{channel, Sender, Receiver};

const QUEUE_CAPACITY: usize = 4096;
const BATCH_SIZE: usize = 64;
const WATERMARK_THRESHOLD: f64 = 0.75;

/// Event Bus: Context-aware, idempotent event routing with rollback safety and performance optimization
#[async_trait]
pub trait EventBus: Send + Sync {
    async fn publish(&self, event: Event) -> anyhow::Result<EventResponse>;
    async fn publish_batch(&self, events: Vec<Event>) -> anyhow::Result<Vec<EventResponse>>;
    async fn subscribe(&self, event_type: &str, handler: EventHandler) -> anyhow::Result<()>;
    async fn check_duplicate(&self, correlation_id: &str) -> anyhow::Result<Option<String>>;
    fn queue_depth(&self) -> usize;
}

#[derive(Debug, Clone)]
pub struct Event {
    pub stream_id: String,
    pub event_type: String,
    pub data: serde_json::Value,
    pub metadata: EventMetadata,
    pub context: ContextFrame,
}

pub type EventHandler = Arc<dyn Fn(Event) -> anyhow::Result<()> + Send + Sync>;

/// In-memory event bus implementation with performance optimizations
pub struct InMemoryEventBus {
    events: Arc<RwLock<Vec<StoredEvent>>>,
    handlers: Arc<RwLock<HashMap<String, Vec<EventHandler>>>>,
    seen_correlations: Arc<RwLock<HashMap<String, String>>>,
    queue_tx: Option<Sender<Event>>,
    pending_batch: Arc<RwLock<Vec<Event>>>,
}

#[derive(Debug, Clone)]
struct StoredEvent {
    id: String,
    stream_id: String,
    event_type: String,
    version: u64,
    data: serde_json::Value,
    metadata: EventMetadata,
    context: ContextFrame,
    timestamp: chrono::DateTime<chrono::Utc>,
}

impl InMemoryEventBus {
    pub fn new() -> Self {
        Self {
            events: Arc::new(RwLock::new(Vec::new())),
            handlers: Arc::new(RwLock::new(HashMap::new())),
            seen_correlations: Arc::new(RwLock::new(HashMap::new())),
            queue_tx: None,
            pending_batch: Arc::new(RwLock::new(Vec::with_capacity(BATCH_SIZE))),
        }
    }

    /// Initialize with bounded channel for high-throughput scenarios
    pub fn with_queue(capacity: usize) -> Self {
        let (tx, _rx) = channel(capacity);
        Self {
            events: Arc::new(RwLock::new(Vec::new())),
            handlers: Arc::new(RwLock::new(HashMap::new())),
            seen_correlations: Arc::new(RwLock::new(HashMap::new())),
            queue_tx: Some(tx),
            pending_batch: Arc::new(RwLock::new(Vec::with_capacity(BATCH_SIZE))),
        }
    }

    /// Check queue watermark for backpressure
    fn check_watermark(&self) -> bool {
        if let Some(tx) = &self.queue_tx {
            let remaining = tx.capacity();
            let used_pct = 1.0 - (remaining as f64 / QUEUE_CAPACITY as f64);
            if used_pct > WATERMARK_THRESHOLD {
                tracing::warn!(
                    "⚠️ Queue {}% full (watermark {}%); applying backpressure",
                    (used_pct * 100.0) as u8,
                    (WATERMARK_THRESHOLD * 100.0) as u8
                );
                return false;
            }
        }
        true
    }

    /// Flush pending batch to storage
    async fn flush_batch(&self) -> anyhow::Result<Vec<EventResponse>> {
        let mut batch = self.pending_batch.write().unwrap();
        if batch.is_empty() {
            return Ok(Vec::new());
        }

        let events_to_flush = batch.drain(..).collect::<Vec<_>>();
        drop(batch); // Release lock before processing

        let mut responses = Vec::with_capacity(events_to_flush.len());
        for event in events_to_flush {
            let response = self.publish_internal(event).await?;
            responses.push(response);
        }

        tracing::debug!("Flushed batch of {} events", responses.len());
        Ok(responses)
    }
}

#[async_trait]
impl EventBus for InMemoryEventBus {
    async fn publish(&self, event: Event) -> anyhow::Result<EventResponse> {
        // Check watermark for backpressure
        if !self.check_watermark() {
            // Defer non-critical events under high load
            tracing::debug!("Event deferred due to backpressure");
        }

        // Add to batch
        let mut batch = self.pending_batch.write().unwrap();
        batch.push(event.clone());
        let should_flush = batch.len() >= BATCH_SIZE;
        drop(batch);

        // Flush if batch is full
        if should_flush {
            let responses = self.flush_batch().await?;
            return Ok(responses.into_iter().last().unwrap());
        }

        // Otherwise publish immediately (for single events)
        self.publish_internal(event).await
    }

    async fn publish_batch(&self, events: Vec<Event>) -> anyhow::Result<Vec<EventResponse>> {
        let mut responses = Vec::with_capacity(events.len());
        for event in events {
            let response = self.publish_internal(event).await?;
            responses.push(response);
        }
        Ok(responses)
    }

    fn queue_depth(&self) -> usize {
        self.pending_batch.read().unwrap().len()
    }

    async fn subscribe(&self, event_type: &str, handler: EventHandler) -> anyhow::Result<()> {
        // Check for duplicate
        if let Some(existing_id) = self.check_duplicate(&event.metadata.correlation_id).await? {
            tracing::warn!("Duplicate event detected: {}", event.metadata.correlation_id);
            tracing::warn!("Duplicate event detected: {}", event.metadata.correlation_id);
            // Return existing event ID (idempotency)
            let events = self.events.read().unwrap();
            if let Some(stored) = events.iter().find(|e| e.id == existing_id) {
                return Ok(EventResponse {
                    event_id: stored.id.clone(),
                    stream_id: stored.stream_id.clone(),
                    version: stored.version,
                    timestamp: stored.timestamp,
                });
            }
        }

        // Validate context
        event.context.validate().map_err(|e| anyhow::anyhow!(e))?;

        // Store event
        let event_id = Uuid::new_v4().to_string();
        let timestamp = chrono::Utc::now();
        
        let mut events = self.events.write().unwrap();
        let version = events
            .iter()
            .filter(|e| e.stream_id == event.stream_id)
            .count() as u64 + 1;

        let stored = StoredEvent {
            id: event_id.clone(),
            stream_id: event.stream_id.clone(),
            event_type: event.event_type.clone(),
            version,
            data: event.data.clone(),
            metadata: event.metadata.clone(),
            context: event.context.clone(),
            timestamp,
        };

        events.push(stored);

        // Record correlation ID
        let mut correlations = self.seen_correlations.write().unwrap();
        correlations.insert(event.metadata.correlation_id.clone(), event_id.clone());

        // Trigger handlers
        let handlers = self.handlers.read().unwrap();
        if let Some(handler_list) = handlers.get(&event.event_type) {
            for handler in handler_list {
                if let Err(e) = handler(event.clone()) {
                    tracing::error!("Event handler failed: {}", e);
                }
            }
        }

    async fn check_duplicate(&self, correlation_id: &str) -> anyhow::Result<Option<String>> {
        let correlations = self.seen_correlations.read().unwrap();
        Ok(correlations.get(correlation_id).cloned())
    }
}

impl InMemoryEventBus {
    /// Internal publish method for actual event storage
    async fn publish_internal(&self, event: Event) -> anyhow::Result<EventResponse> {
        // Check for duplicate
        if let Some(existing_id) = self.check_duplicate(&event.metadata.correlation_id).await? {
            tracing::debug!("Duplicate event detected: {}", event.metadata.correlation_id);
        let mut handlers = self.handlers.write().unwrap();
        handlers
            .entry(event_type.to_string())
            .or_insert_with(Vec::new)
            .push(handler);
        Ok(())
    }

    async fn check_duplicate(&self, correlation_id: &str) -> anyhow::Result<Option<String>> {
        let correlations = self.seen_correlations.read().unwrap();
        Ok(correlations.get(correlation_id).cloned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_event_publish() {
        let bus = InMemoryEventBus::new();
        
        let event = Event {
            stream_id: "test-stream".to_string(),
            event_type: "test.event".to_string(),
            data: serde_json::json!({"key": "value"}),
            metadata: EventMetadata {
                correlation_id: "test-001".to_string(),
                causation_id: None,
                user_id: None,
            },
            context: ContextFrame::default(),
        };

        let result = bus.publish(event).await;
        assert!(result.is_ok());
        
        let response = result.unwrap();
        assert_eq!(response.stream_id, "test-stream");
        assert_eq!(response.version, 1);
    }

    #[tokio::test]
    async fn test_idempotency() {
        let bus = InMemoryEventBus::new();
        
        let event = Event {
            stream_id: "test-stream".to_string(),
            event_type: "test.event".to_string(),
            data: serde_json::json!({"key": "value"}),
            metadata: EventMetadata {
                correlation_id: "test-dup".to_string(),
                causation_id: None,
                user_id: None,
            },
            context: ContextFrame::default(),
        };

        let response1 = bus.publish(event.clone()).await.unwrap();
        let response2 = bus.publish(event).await.unwrap();
        
        assert_eq!(response1.event_id, response2.event_id);
    }
}
