use crate::types::ContextFrame;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// Context Engine: Manages adaptive configuration and learning
pub struct ContextEngine {
    enabled: bool,
    change_cap_pct: u8,
    min_confidence: f64,
    metrics: Arc<RwLock<HashMap<String, MetricData>>>,
}

#[derive(Debug, Clone)]
struct MetricData {
    current_value: f64,
    baseline: f64,
    last_update: chrono::DateTime<chrono::Utc>,
    consecutive_successes: u32,
}

impl ContextEngine {
    pub fn new(enabled: bool, change_cap_pct: u8, min_confidence: f64) -> Self {
        Self {
            enabled,
            change_cap_pct,
            min_confidence,
            metrics: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Check if autotune is permitted for given context
    pub fn can_autotune(&self, ctx: &ContextFrame) -> bool {
        if !self.enabled {
            return false;
        }
        ctx.can_autotune() && ctx.context_confidence.unwrap_or(0.0) >= self.min_confidence
    }

    /// Apply adaptive adjustment within safety boundaries
    pub fn adjust_metric(&self, key: &str, current: f64, ctx: &ContextFrame) -> f64 {
        if !self.can_autotune(ctx) {
            return current;
        }

        let mut metrics = self.metrics.write().unwrap();
        let metric = metrics.entry(key.to_string()).or_insert(MetricData {
            current_value: current,
            baseline: current,
            last_update: chrono::Utc::now(),
            consecutive_successes: 0,
        });

        // Calculate max allowed change (±10% per day default)
        let max_change = metric.baseline * (self.change_cap_pct as f64 / 100.0);
        let proposed = current;
        
        // Clamp to safety boundary
        let adjusted = if proposed > metric.baseline + max_change {
            metric.baseline + max_change
        } else if proposed < metric.baseline - max_change {
            metric.baseline - max_change
        } else {
            proposed
        };

        metric.current_value = adjusted;
        metric.last_update = chrono::Utc::now();
        
        adjusted
    }

    /// Record successful operation (for consecutive success tracking)
    pub fn record_success(&self, key: &str) {
        let mut metrics = self.metrics.write().unwrap();
        if let Some(metric) = metrics.get_mut(key) {
            metric.consecutive_successes += 1;
            
            // After 2 consecutive successes, update baseline
            if metric.consecutive_successes >= 2 {
                metric.baseline = metric.current_value;
                metric.consecutive_successes = 0;
            }
        }
    }

    /// Rollback to last stable baseline
    pub fn rollback(&self, key: &str) -> Option<f64> {
        let mut metrics = self.metrics.write().unwrap();
        if let Some(metric) = metrics.get_mut(key) {
            metric.current_value = metric.baseline;
            metric.consecutive_successes = 0;
            Some(metric.baseline)
        } else {
            None
        }
    }

    /// Get current metrics snapshot
    pub fn snapshot(&self) -> HashMap<String, (f64, f64)> {
        let metrics = self.metrics.read().unwrap();
        metrics
            .iter()
            .map(|(k, v)| (k.clone(), (v.current_value, v.baseline)))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::RiskLevel;

    #[test]
    fn test_autotune_safety() {
        let engine = ContextEngine::new(true, 10, 0.6);
        
        let mut ctx = ContextFrame::default();
        ctx.context_confidence = Some(0.7);
        assert!(engine.can_autotune(&ctx));

        ctx.risk_level = RiskLevel::Block;
        assert!(!engine.can_autotune(&ctx));
    }

    #[test]
    fn test_metric_adjustment() {
        let engine = ContextEngine::new(true, 10, 0.6);
        let ctx = ContextFrame::default();

        // Initial baseline = 100
        let adjusted = engine.adjust_metric("test_metric", 100.0, &ctx);
        assert_eq!(adjusted, 100.0);

        // Try to increase by 20% (should cap at 10%)
        let adjusted = engine.adjust_metric("test_metric", 120.0, &ctx);
        assert_eq!(adjusted, 110.0);
    }

    #[test]
    fn test_rollback() {
        let engine = ContextEngine::new(true, 10, 0.6);
        let ctx = ContextFrame::default();

        engine.adjust_metric("test", 100.0, &ctx);
        engine.adjust_metric("test", 105.0, &ctx);
        
        let baseline = engine.rollback("test");
        assert_eq!(baseline, Some(100.0));
    }
}
