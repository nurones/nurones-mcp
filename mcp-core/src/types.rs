use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// ContextFrame schema v1.0 — Single Source of Truth for all MCP operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextFrame {
    /// Trace of reasoning flow — required
    pub reason_trace_id: String,
    /// Tenant isolation key — required
    pub tenant_id: String,
    /// Deployment stage — required
    pub stage: Stage,
    /// Risk level: 0=safe, 1=caution, 2=block autotune — required
    pub risk_level: RiskLevel,
    /// Measure of new behavior (0..1)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub novelty_score: Option<f64>,
    /// Determines eligibility for self-tuning (0..1)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_confidence: Option<f64>,
    /// Resource budgets
    #[serde(skip_serializing_if = "Option::is_none")]
    pub budgets: Option<Budgets>,
    /// Feature flags
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flags: Option<Flags>,
    /// ISO timestamp
    pub ts: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Dev,
    Staging,
    Prod,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskLevel {
    Safe = 0,
    Caution = 1,
    Block = 2,
}

impl Serialize for RiskLevel {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_u8(*self as u8)
    }
}

impl<'de> Deserialize<'de> for RiskLevel {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = u8::deserialize(deserializer)?;
        match value {
            0 => Ok(RiskLevel::Safe),
            1 => Ok(RiskLevel::Caution),
            2 => Ok(RiskLevel::Block),
            _ => Err(serde::de::Error::custom(format!(
                "invalid risk_level: {}, expected 0, 1, or 2",
                value
            ))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Budgets {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mem_mb: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rps: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Flags {
    #[serde(default)]
    pub allow_autotune: bool,
    #[serde(default)]
    pub read_only: bool,
}

impl Default for ContextFrame {
    fn default() -> Self {
        Self {
            reason_trace_id: "bootstrap-000".to_string(),
            tenant_id: "default".to_string(),
            stage: Stage::Dev,
            risk_level: RiskLevel::Safe,
            novelty_score: None,
            context_confidence: Some(0.7),
            budgets: None,
            flags: None,
            ts: Utc::now(),
        }
    }
}

impl ContextFrame {
    /// Validate ContextFrame meets requirements
    pub fn validate(&self) -> Result<(), String> {
        if self.reason_trace_id.is_empty() {
            return Err("reason_trace_id is required".to_string());
        }
        if self.tenant_id.is_empty() {
            return Err("tenant_id is required".to_string());
        }
        if let Some(score) = self.novelty_score {
            if !(0.0..=1.0).contains(&score) {
                return Err("novelty_score must be between 0.0 and 1.0".to_string());
            }
        }
        if let Some(conf) = self.context_confidence {
            if !(0.0..=1.0).contains(&conf) {
                return Err("context_confidence must be between 0.0 and 1.0".to_string());
            }
        }
        Ok(())
    }

    /// Check if autotune is allowed based on safety boundaries
    pub fn can_autotune(&self) -> bool {
        self.risk_level == RiskLevel::Safe
            && self.context_confidence.unwrap_or(0.0) >= 0.6
            && self.flags.as_ref().map_or(true, |f| f.allow_autotune)
    }
}

/// Event metadata for persistence layer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventMetadata {
    pub correlation_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub causation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
}

/// Event response structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventResponse {
    pub event_id: String,
    pub stream_id: String,
    pub version: u64,
    pub timestamp: DateTime<Utc>,
}

/// Tool execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub execution_time: u64,
    pub context_used: ContextFrame,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_context() {
        let ctx = ContextFrame::default();
        assert_eq!(ctx.tenant_id, "default");
        assert_eq!(ctx.stage, Stage::Dev);
        assert_eq!(ctx.risk_level, RiskLevel::Safe);
    }

    #[test]
    fn test_context_validation() {
        let ctx = ContextFrame::default();
        assert!(ctx.validate().is_ok());

        let mut invalid_ctx = ctx.clone();
        invalid_ctx.reason_trace_id = "".to_string();
        assert!(invalid_ctx.validate().is_err());
    }

    #[test]
    fn test_autotune_safety() {
        let mut ctx = ContextFrame::default();
        assert!(ctx.can_autotune()); // Safe with confidence 0.7

        ctx.risk_level = RiskLevel::Block;
        assert!(!ctx.can_autotune()); // Blocked

        ctx.risk_level = RiskLevel::Safe;
        ctx.context_confidence = Some(0.5);
        assert!(!ctx.can_autotune()); // Low confidence
    }
}
