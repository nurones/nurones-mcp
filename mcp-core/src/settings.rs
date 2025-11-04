use axum::{extract::State, routing::{get, put}, Json, Router};
use serde::{Deserialize, Serialize};
use std::{fs, sync::{Arc, Mutex}};

#[derive(Clone, Serialize, Deserialize)]
pub struct ServerSettings {
    pub port: u16,
}

#[derive(Clone)]
pub struct SettingsState {
    pub cfg_path: String,
    pub server_port: Arc<Mutex<u16>>,
}

pub fn settings_router<S>(cfg_path: String, state: SettingsState) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/api/settings/server", get({
            let state = state.clone();
            move || get_server_settings(state.clone())
        }))
        .route("/api/settings/server", put({
            let state = state.clone();
            move |body| update_server_settings(state.clone(), body)
        }))
}

async fn get_server_settings(
    state: SettingsState,
) -> Json<ServerSettings> {
    let port = *state.server_port.lock().unwrap();
    Json(ServerSettings { port })
}

async fn update_server_settings(
    state: SettingsState,
    Json(body): Json<ServerSettings>,
) -> Json<ServerSettings> {
    // Validate port range
    if body.port < 1024 || body.port > 65535 {
        tracing::warn!("Invalid port {} requested, must be 1024-65535", body.port);
        return Json(ServerSettings { port: *state.server_port.lock().unwrap() });
    }

    // Persist to config file
    match fs::read_to_string(&state.cfg_path) {
        Ok(content) => {
            if let Ok(mut cfg) = serde_json::from_str::<serde_json::Value>(&content) {
                cfg["server"]["port"] = serde_json::json!(body.port);
                if let Ok(updated_content) = serde_json::to_string_pretty(&cfg) {
                    if let Err(e) = fs::write(&state.cfg_path, updated_content) {
                        tracing::error!("Failed to write config: {}", e);
                    } else {
                        tracing::info!("Updated server.port to {} in {}", body.port, state.cfg_path);
                    }
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to read config: {}", e);
        }
    }

    // Update in-memory value (restart required to rebind port)
    *state.server_port.lock().unwrap() = body.port;
    
    Json(body)
}
