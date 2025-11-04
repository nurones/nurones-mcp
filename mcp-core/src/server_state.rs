use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: String,
    #[serde(rename = "type")]
    pub conn_type: String,
    pub connected_at: DateTime<Utc>,
    pub last_activity: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolStatus {
    pub name: String,
    pub version: String,
    pub enabled: bool,
    pub permissions: Vec<String>,
    pub tool_type: String,
}

#[derive(Debug, Clone)]
pub struct ServerState {
    pub connections: Arc<RwLock<HashMap<String, Connection>>>,
    pub tools: Arc<RwLock<HashMap<String, ToolStatus>>>,
    pub context_engine_enabled: Arc<RwLock<bool>>,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
            tools: Arc::new(RwLock::new(HashMap::new())),
            context_engine_enabled: Arc::new(RwLock::new(true)),
        }
    }

    pub async fn add_connection(&self, id: String, conn_type: String) {
        let mut connections = self.connections.write().await;
        let now = Utc::now();
        connections.insert(
            id.clone(),
            Connection {
                id,
                conn_type,
                connected_at: now,
                last_activity: now,
            },
        );
    }

    pub async fn remove_connection(&self, id: &str) {
        let mut connections = self.connections.write().await;
        connections.remove(id);
    }

    pub async fn update_activity(&self, id: &str) {
        let mut connections = self.connections.write().await;
        if let Some(conn) = connections.get_mut(id) {
            conn.last_activity = Utc::now();
        }
    }

    pub async fn get_connections(&self) -> Vec<Connection> {
        let connections = self.connections.read().await;
        connections.values().cloned().collect()
    }

    pub async fn register_tool(&self, name: String, tool_status: ToolStatus) {
        let mut tools = self.tools.write().await;
        tools.insert(name, tool_status);
    }

    pub async fn toggle_tool(&self, name: &str, enabled: bool) -> Result<(), String> {
        let mut tools = self.tools.write().await;
        if let Some(tool) = tools.get_mut(name) {
            tool.enabled = enabled;
            Ok(())
        } else {
            Err(format!("Tool not found: {}", name))
        }
    }

    pub async fn get_tools(&self) -> Vec<ToolStatus> {
        let tools = self.tools.read().await;
        tools.values().cloned().collect()
    }

    pub async fn get_context_engine_status(&self) -> bool {
        *self.context_engine_enabled.read().await
    }

    pub async fn set_context_engine(&self, enabled: bool) {
        let mut status = self.context_engine_enabled.write().await;
        *status = enabled;
    }
}
