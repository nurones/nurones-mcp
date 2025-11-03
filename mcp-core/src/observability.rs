use crate::types::ContextFrame;
use std::sync::Arc;
use std::collections::HashMap;

/// Observability Service: OTel + Prometheus integration with context propagation
pub struct ObservabilityService {
    metrics: Arc<prometheus::Registry>,
    active_traces: Arc<tokio::sync::RwLock<HashMap<String, TraceSpan>>>,
}

#[derive(Debug, Clone)]
struct TraceSpan {
    name: String,
    start_time: std::time::Instant,
    context: Option<ContextFrame>,
}

impl ObservabilityService {
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(prometheus::Registry::new()),
            active_traces: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
        }
    }

    /// Record a metric value with optional tags and context
    pub fn record(
        &self,
        metric: &str,
        value: f64,
        tags: Option<HashMap<String, String>>,
        context: Option<ContextFrame>,
    ) {
        tracing::info!(
            metric = metric,
            value = value,
            tags = ?tags,
            reason_trace_id = context.as_ref().map(|c| c.reason_trace_id.as_str()),
            "Recording metric"
        );

        // In production, this would push to Prometheus
        // For now, we log it
    }

    /// Start a new trace span
    pub async fn start_trace(&self, name: &str, context: Option<ContextFrame>) -> String {
        let trace_id = uuid::Uuid::new_v4().to_string();
        
        let span = TraceSpan {
            name: name.to_string(),
            start_time: std::time::Instant::now(),
            context: context.clone(),
        };

        let mut traces = self.active_traces.write().await;
        traces.insert(trace_id.clone(), span);

        tracing::debug!(
            trace_id = %trace_id,
            name = name,
            reason_trace_id = context.as_ref().map(|c| c.reason_trace_id.as_str()),
            "Started trace"
        );

        trace_id
    }

    /// End a trace span
    pub async fn end_trace(&self, trace_id: &str, status: TraceStatus) {
        let mut traces = self.active_traces.write().await;
        
        if let Some(span) = traces.remove(trace_id) {
            let duration = span.start_time.elapsed();
            
            tracing::info!(
                trace_id = trace_id,
                name = span.name,
                duration_ms = duration.as_millis(),
                status = ?status,
                reason_trace_id = span.context.as_ref().map(|c| c.reason_trace_id.as_str()),
                "Ended trace"
            );

            // In production, export to OTel collector
        }
    }

    /// Get Prometheus registry for metrics export
    pub fn registry(&self) -> Arc<prometheus::Registry> {
        Arc::clone(&self.metrics)
    }

    /// Get active traces snapshot
    pub async fn active_traces(&self) -> Vec<String> {
        let traces = self.active_traces.read().await;
        traces.keys().cloned().collect()
    }
}

#[derive(Debug, Clone, Copy)]
pub enum TraceStatus {
    Ok,
    Error,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_trace_lifecycle() {
        let service = ObservabilityService::new();
        let ctx = ContextFrame::default();

        let trace_id = service.start_trace("test_operation", Some(ctx)).await;
        assert!(!trace_id.is_empty());

        let active = service.active_traces().await;
        assert_eq!(active.len(), 1);

        service.end_trace(&trace_id, TraceStatus::Ok).await;

        let active = service.active_traces().await;
        assert_eq!(active.len(), 0);
    }

    #[test]
    fn test_metric_recording() {
        let service = ObservabilityService::new();
        let ctx = ContextFrame::default();

        let mut tags = HashMap::new();
        tags.insert("environment".to_string(), "test".to_string());

        service.record("test_metric", 42.0, Some(tags), Some(ctx));
        // Should not panic
    }
}
