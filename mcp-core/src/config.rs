use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Server network configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerNetConfig {
    #[serde(default = "default_port")]
    pub port: u16,
}

fn default_port() -> u16 { 50550 }

impl Default for ServerNetConfig {
    fn default() -> Self {
        Self { port: 50550 }
    }
}

/// Server configuration (loaded from .mcp/config.json)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    #[serde(default)]
    pub server: ServerNetConfig,
    pub profile: String,
    pub transports: Vec<Transport>,
    pub rbac: RbacConfig,
    pub observability: ObservabilityConfig,
    pub context_engine: ContextEngineConfig,
    #[serde(default)]
    pub performance: PerformanceConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Transport {
    Stdio,
    Ws,
    Http,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RbacConfig {
    #[serde(rename = "defaultRole")]
    pub default_role: String,
    #[serde(default)]
    pub roles: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObservabilityConfig {
    #[serde(rename = "otelExporter")]
    pub otel_exporter: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextEngineConfig {
    pub enabled: bool,
    #[serde(rename = "changeCapPctPerDay")]
    pub change_cap_pct_per_day: u8,
    #[serde(rename = "minConfidence")]
    pub min_confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceConfig {
    #[serde(rename = "maxInflight", default = "default_max_inflight")]
    pub max_inflight: usize,
    #[serde(rename = "batchSize", default = "default_batch_size")]
    pub batch_size: usize,
    #[serde(rename = "queueWatermark", default = "default_queue_watermark")]
    pub queue_watermark: f64,
}

fn default_max_inflight() -> usize { 2048 }
fn default_batch_size() -> usize { 64 }
fn default_queue_watermark() -> f64 { 0.75 }

impl Default for PerformanceConfig {
    fn default() -> Self {
        Self {
            max_inflight: 2048,
            batch_size: 64,
            queue_watermark: 0.75,
        }
    }
}

impl ServerConfig {
    /// Load configuration from file
    pub fn load(path: &str) -> anyhow::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let config: ServerConfig = serde_json::from_str(&content)?;
        Ok(config)
    }

    /// Validate configuration
    pub fn validate(&self) -> anyhow::Result<()> {
        if self.transports.is_empty() {
            anyhow::bail!("At least one transport must be configured");
        }
        if self.context_engine.min_confidence < 0.0 || self.context_engine.min_confidence > 1.0 {
            anyhow::bail!("minConfidence must be between 0.0 and 1.0");
        }
        if self.context_engine.change_cap_pct_per_day > 100 {
            anyhow::bail!("changeCapPctPerDay must be <= 100");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_validation() {
        let config = ServerConfig {
            server: ServerNetConfig { port: 50550 },
            profile: "test".to_string(),
            transports: vec![Transport::Stdio],
            rbac: RbacConfig {
                default_role: "operator".to_string(),
                roles: HashMap::new(),
            },
            observability: ObservabilityConfig {
                otel_exporter: "http://localhost:4318".to_string(),
            },
            context_engine: ContextEngineConfig {
                enabled: true,
                change_cap_pct_per_day: 10,
                min_confidence: 0.6,
            },
            performance: PerformanceConfig::default(),
        };
        assert!(config.validate().is_ok());
    }
}
