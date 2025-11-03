use serde::{Deserialize, Serialize};
use anyhow::Result;

/// ContextFrame - Contract SSOT for Rust
/// 
/// Rule: Any public API that mutates state MUST accept ContextFrame.
/// Read-only APIs MAY accept it (tiered propagation).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextFrame {
    pub reason_trace_id: String,
    pub tenant_id: String,
    pub stage: String,  // "dev" | "staging" | "prod"
    pub risk_level: u8, // 0 | 1 | 2
    #[serde(skip_serializing_if = "Option::is_none")]
    pub novelty_score: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_confidence: Option<f32>,
    pub ts: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub budgets: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flags: Option<serde_json::Value>,
}

impl ContextFrame {
    /// Validate ContextFrame meets contract requirements
    pub fn validate(&self) -> Result<()> {
        if self.reason_trace_id.is_empty() {
            anyhow::bail!("reason_trace_id is required");
        }
        if self.tenant_id.is_empty() {
            anyhow::bail!("tenant_id is required");
        }
        if !["dev", "staging", "prod"].contains(&self.stage.as_str()) {
            anyhow::bail!("stage must be dev, staging, or prod");
        }
        if self.risk_level > 2 {
            anyhow::bail!("risk_level must be 0, 1, or 2");
        }
        if let Some(score) = self.novelty_score {
            if !(0.0..=1.0).contains(&score) {
                anyhow::bail!("novelty_score must be between 0.0 and 1.0");
            }
        }
        if let Some(conf) = self.context_confidence {
            if !(0.0..=1.0).contains(&conf) {
                anyhow::bail!("context_confidence must be between 0.0 and 1.0");
            }
        }
        Ok(())
    }
}

/// EventMetadata - Contract for event correlation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventMetadata {
    pub correlation_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub causation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
}

/// IEventPersistence - Contract interface for event storage
pub trait IEventPersistence {
    fn append_event(
        &self,
        stream: &str,
        event_type: &str,
        data: &serde_json::Value,
        metadata: &EventMetadata,
        context: &ContextFrame,
    ) -> Result<String>;

    fn query_duplicate(&self, correlation_id: &str) -> Result<Option<String>>;
}

/// ToolManifest - Contract for tool configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolManifest {
    pub name: String,
    pub version: String,
    pub entry: String,
    pub permissions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_frame_validation() {
        let valid = ContextFrame {
            reason_trace_id: "test-trace".to_string(),
            tenant_id: "default".to_string(),
            stage: "dev".to_string(),
            risk_level: 0,
            novelty_score: Some(0.5),
            context_confidence: Some(0.7),
            ts: chrono::Utc::now().to_rfc3339(),
            budgets: None,
            flags: None,
        };
        assert!(valid.validate().is_ok());

        let invalid_stage = ContextFrame {
            stage: "invalid".to_string(),
            ..valid.clone()
        };
        assert!(invalid_stage.validate().is_err());

        let invalid_risk = ContextFrame {
            risk_level: 5,
            ..valid
        };
        assert!(invalid_risk.validate().is_err());
    }
}
