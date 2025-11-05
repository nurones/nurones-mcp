use nurones_mcp::*;
use clap::Parser;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use std::sync::{Arc, Mutex};

mod connector_virtual;
mod settings;
use connector_virtual::VirtualConnector;
use settings::{settings_router, SettingsState};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Path to configuration file
    #[arg(short, long, default_value = ".mcp/config.json")]
    config: String,

    /// Override: disable context engine (deterministic mode)
    #[arg(long)]
    context_engine: Option<String>,

    /// Filesystem allowlist (comma-separated paths)
    #[arg(long, default_value = "/workspace,/tmp")]
    fs_allowlist: String,

    /// Tools directory
    #[arg(long, default_value = ".mcp/tools")]
    tools_dir: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "nurones_mcp=info,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let args = Args::parse();

    tracing::info!("Starting Nurones MCP Server v{}", VERSION);
    tracing::info!("Loading configuration from: {}", args.config);

    // Load configuration
    let mut config = ServerConfig::load(&args.config)?;
    config.validate()?;

    // Check context engine override
    if let Some(engine_mode) = args.context_engine {
        config.context_engine.enabled = engine_mode.to_lowercase() == "on";
        tracing::info!(
            "Context Engine: {}",
            if config.context_engine.enabled {
                "ENABLED"
            } else {
                "DISABLED (deterministic mode)"
            }
        );
    }

    // Initialize context engine
    let _context_engine = context::ContextEngine::new(
        config.context_engine.enabled,
        config.context_engine.change_cap_pct_per_day,
        config.context_engine.min_confidence,
    );

    // Initialize event bus
    let _event_bus = event_bus::InMemoryEventBus::new();

    // Load policies
    let policies_path = ".mcp/policies.json";
    let policies = if std::path::Path::new(policies_path).exists() {
        policies::Policies::load(policies_path)?
    } else {
        tracing::info!("No policies.json found, using defaults");
        let default_policies = policies::Policies::default();
        default_policies.save(policies_path)?;
        default_policies
    };
    let policies = Arc::new(tokio::sync::RwLock::new(policies));

    // Parse filesystem allowlist from args or policies
    let fs_allowlist: Vec<String> = if args.fs_allowlist != "/workspace,/tmp" {
        args.fs_allowlist.split(',').map(|s| s.trim().to_string()).collect()
    } else {
        policies.read().await.fs_allowlist.clone()
    };

    // Initialize tool executor with allowlist
    let tool_executor = tool_executor::InMemoryToolExecutor::with_allowlist(fs_allowlist.clone());
    
    // Load tools from directory
    tracing::info!("Loading tools from: {}", args.tools_dir);
    if let Err(e) = tool_executor.load_tools(&args.tools_dir).await {
        tracing::warn!("Failed to load some tools: {}", e);
    }

    // Clone tool executor for API server
    let tool_executor_for_api = Arc::new(tool_executor);

    // Initialize server state
    let server_state = Arc::new(server_state::ServerState::new());
    
    // Set initial context engine status
    server_state.set_context_engine(config.context_engine.enabled).await;
    
    // Register all tools in state
    let tool_manifests = [
        ("fs.read", "1.1.0", vec!["read"], "WASI"),
        ("fs.write", "1.1.0", vec!["write"], "WASI"),
        ("fs.list", "1.0.0", vec!["read"], "WASI"),
        ("fs.delete", "1.0.0", vec!["write", "delete"], "WASI"),
        ("fs.search", "1.0.0", vec!["read"], "WASI"),
        ("db.query", "1.0.0", vec!["read", "db"], "Native"),
        ("db.execute", "1.0.0", vec!["write", "db"], "Native"),
        ("db.schema", "1.0.0", vec!["read", "db"], "Native"),
        ("http.request", "1.0.0", vec!["network"], "Native"),
        ("fetch.url", "1.0.0", vec!["network"], "Native"),
        ("embedding.generate", "1.0.0", vec!["ai", "compute"], "Native"),
        ("completion.stream", "1.0.0", vec!["ai", "compute"], "Native"),
        ("process.execute", "1.0.0", vec!["execute", "system"], "Native"),
        ("env.get", "1.0.0", vec!["read", "system"], "Native"),
        ("telemetry.push", "1.0.0", vec!["emit"], "Native"),
    ];
    
    for (name, version, permissions, tool_type) in tool_manifests {
        server_state.register_tool(
            name.to_string(),
            server_state::ToolStatus {
                name: name.to_string(),
                version: version.to_string(),
                enabled: true,
                permissions: permissions.iter().map(|s| s.to_string()).collect(),
                tool_type: tool_type.to_string(),
            },
        ).await;
    }

    // Initialize observability
    let _observability = observability::ObservabilityService::new();

    // Initialize virtual connector
    let virtual_connector = Arc::new(VirtualConnector::new());

    // Prepare settings state
    let settings_state = SettingsState {
        cfg_path: args.config.clone(),
        server_port: Arc::new(Mutex::new(config.server.port)),
    };

    // Start unified API server on single port
    let port = config.server.port;
    let state_for_server = server_state.clone();
    let executor_for_server = tool_executor_for_api.clone();
    let policies_for_server = policies.clone();
    let vc_for_server = virtual_connector.clone();
    let transports_for_server: Vec<String> = config.transports.iter()
        .map(|t| format!("{:?}", t).to_lowercase())
        .collect();
    let otel_exporter_for_server = config.observability.otel_exporter.clone();
    tokio::spawn(async move {
        if let Err(e) = start_api_server(
            port,
            state_for_server,
            executor_for_server,
            policies_for_server,
            vc_for_server,
            settings_state,
            transports_for_server,
            otel_exporter_for_server,
        ).await {
            tracing::error!("API server failed: {}", e);
        }
    });

    tracing::info!("Nurones MCP Server ready");
    tracing::info!("  Profile: {}", config.profile);
    tracing::info!("  Transports: {:?}", config.transports);
    tracing::info!("  Server:");
    tracing::info!("    - HTTP API: http://localhost:{}", port);
    tracing::info!("    - Metrics: http://localhost:{}/metrics", port);
    tracing::info!("  Observability:");
    tracing::info!("    - OTel Exporter: {}", config.observability.otel_exporter);
    tracing::info!("  Context Engine:");
    tracing::info!("    - Enabled: {}", config.context_engine.enabled);
    tracing::info!("    - Change Cap: {}%/day", config.context_engine.change_cap_pct_per_day);
    tracing::info!("    - Min Confidence: {}", config.context_engine.min_confidence);
    tracing::info!("  Filesystem Allowlist: {}", args.fs_allowlist);

    // Keep server running
    tokio::signal::ctrl_c().await?;
    tracing::info!("Shutting down...");

    Ok(())
}

async fn start_api_server(
    port: u16,
    state: Arc<server_state::ServerState>,
    tool_executor: Arc<tool_executor::InMemoryToolExecutor>,
    policies: Arc<tokio::sync::RwLock<policies::Policies>>,
    virtual_connector: Arc<VirtualConnector>,
    settings_state: SettingsState,
    transports: Vec<String>,
    otel_exporter: String,
) -> anyhow::Result<()> {
    use axum::{
        extract::{Path, State},
        http::StatusCode,
        routing::{get, post, patch},
        Json, Router,
    };
    use tower_http::cors::{CorsLayer, Any};
    use tower_http::services::ServeDir;
    use serde_json::json;
    use prometheus::{TextEncoder, Encoder};

    // Initialize Prometheus metrics
    let registry = prometheus::Registry::new();
    
    // Register custom metrics
    let connections_gauge = prometheus::IntGauge::new(
        "mcp_active_connections",
        "Number of active IDE connections"
    ).unwrap();
    registry.register(Box::new(connections_gauge.clone())).unwrap();
    
    let tools_gauge = prometheus::IntGauge::new(
        "mcp_registered_tools",
        "Number of registered tools"
    ).unwrap();
    registry.register(Box::new(tools_gauge.clone())).unwrap();
    
    let context_engine_gauge = prometheus::IntGauge::new(
        "mcp_context_engine_enabled",
        "Context engine status (1=enabled, 0=disabled)"
    ).unwrap();
    registry.register(Box::new(context_engine_gauge.clone())).unwrap();
    
    // Clone state and metrics for the metrics endpoint
    let state_for_metrics = state.clone();
    let registry_clone = registry.clone();

    // Handler functions
    async fn get_metrics(
        State((state, registry, connections_gauge, tools_gauge, context_engine_gauge)): 
        State<(
            Arc<server_state::ServerState>,
            prometheus::Registry,
            prometheus::IntGauge,
            prometheus::IntGauge,
            prometheus::IntGauge
        )>
    ) -> Result<String, StatusCode> {
        // Update metrics with current values
        let connections = state.get_connections().await;
        connections_gauge.set(connections.len() as i64);
        
        let tools = state.get_tools().await;
        tools_gauge.set(tools.len() as i64);
        
        let context_engine = state.get_context_engine_status().await;
        context_engine_gauge.set(if context_engine { 1 } else { 0 });
        
        // Encode and return metrics
        let encoder = TextEncoder::new();
        let metric_families = registry.gather();
        let mut buffer = Vec::new();
        encoder.encode(&metric_families, &mut buffer)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        
        String::from_utf8(buffer)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    }
    async fn get_status(
        State((server_state, transports, native_available, wasi_available, otel_exporter)):
        State<(Arc<server_state::ServerState>, Vec<String>, bool, bool, String)>
    ) -> Json<serde_json::Value> {
        let connections = server_state.get_connections().await;
        let tools = server_state.get_tools().await;
        let context_engine = server_state.get_context_engine_status().await;
        
        Json(json!({
            "version": VERSION,
            "status": "running",
            "profile": "dev",
            "context_engine_enabled": context_engine,
            "tools_count": tools.len(),
            "connections": connections,
            "transports": transports,
            "runtimes": {
                "native_available": native_available,
                "wasi_available": wasi_available
            },
            "observability": {
                "otel_exporter": otel_exporter
            }
        }))
    }

    async fn get_tools(State(state): State<Arc<server_state::ServerState>>) -> Json<Vec<server_state::ToolStatus>> {
        Json(state.get_tools().await)
    }

    async fn create_tool(
        State(state): State<Arc<server_state::ServerState>>,
        Json(payload): Json<serde_json::Value>,
    ) -> Result<Json<serde_json::Value>, StatusCode> {
        let name = payload.get("name").and_then(|v| v.as_str())
            .ok_or(StatusCode::BAD_REQUEST)?;
        let version = payload.get("version").and_then(|v| v.as_str())
            .unwrap_or("1.0.0");
        let tool_type = payload.get("tool_type").and_then(|v| v.as_str())
            .unwrap_or("Native");
        let enabled = payload.get("enabled").and_then(|v| v.as_bool())
            .unwrap_or(true);
        let permissions = payload.get("permissions")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_else(Vec::new);

        // Check if tool already exists
        if state.get_tool(name).await.is_some() {
            return Err(StatusCode::CONFLICT);
        }

        let tool_status = server_state::ToolStatus {
            name: name.to_string(),
            version: version.to_string(),
            enabled,
            permissions,
            tool_type: tool_type.to_string(),
        };

        state.register_tool(name.to_string(), tool_status).await;
        tracing::info!("Tool created: {}", name);
        Ok(Json(json!({ "success": true, "name": name })))
    }

    async fn update_tool(
        State(state): State<Arc<server_state::ServerState>>,
        Path(tool_name): Path<String>,
        Json(payload): Json<serde_json::Value>,
    ) -> Result<Json<serde_json::Value>, StatusCode> {
        // Get existing tool
        let mut tool = state.get_tool(&tool_name).await
            .ok_or(StatusCode::NOT_FOUND)?;

        // Update fields if provided
        if let Some(version) = payload.get("version").and_then(|v| v.as_str()) {
            tool.version = version.to_string();
        }
        if let Some(tool_type) = payload.get("tool_type").and_then(|v| v.as_str()) {
            tool.tool_type = tool_type.to_string();
        }
        if let Some(enabled) = payload.get("enabled").and_then(|v| v.as_bool()) {
            tool.enabled = enabled;
        }
        if let Some(permissions_val) = payload.get("permissions") {
            if let Some(arr) = permissions_val.as_array() {
                tool.permissions = arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect();
            }
        }

        state.update_tool(&tool_name, tool).await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        
        tracing::info!("Tool updated: {}", tool_name);
        Ok(Json(json!({ "success": true, "name": tool_name })))
    }

    async fn delete_tool(
        State(state): State<Arc<server_state::ServerState>>,
        Path(tool_name): Path<String>,
    ) -> Result<Json<serde_json::Value>, StatusCode> {
        state.delete_tool(&tool_name).await
            .map_err(|_| StatusCode::NOT_FOUND)?;
        
        tracing::info!("Tool deleted: {}", tool_name);
        Ok(Json(json!({ "success": true, "name": tool_name })))
    }

    async fn get_tool_manifests() -> Json<serde_json::Value> {
        use std::fs;
        use std::path::Path;
        let dir = Path::new(".mcp/tools");
        let mut manifests: Vec<serde_json::Value> = Vec::new();
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            manifests.push(json);
                        }
                    }
                }
            }
        }
        Json(serde_json::json!({ "manifests": manifests }))
    }

    async fn get_plugins() -> Json<serde_json::Value> {
        use std::fs;
        use std::path::Path;
        let plugins_dir = Path::new("plugins");
        let mut plugins = Vec::new();

        if let Ok(entries) = fs::read_dir(plugins_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let plugin_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("unknown");
                    let package_json_path = path.join("package.json");
                    
                    if package_json_path.exists() {
                        if let Ok(content) = fs::read_to_string(&package_json_path) {
                            if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                                let commands = pkg.get("contributes")
                                    .and_then(|c| c.get("commands"))
                                    .and_then(|c| c.as_array())
                                    .map(|arr| arr.len())
                                    .unwrap_or(0);

                                plugins.push(json!({
                                    "name": pkg.get("displayName").and_then(|v| v.as_str()).unwrap_or(plugin_name),
                                    "description": pkg.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                                    "version": pkg.get("version").and_then(|v| v.as_str()).unwrap_or("0.0.0"),
                                    "path": format!("plugins/{}/", plugin_name),
                                    "language": "TypeScript",
                                    "commands": commands,
                                    "is_template": plugin_name == "template"
                                }));
                            }
                        }
                    } else if plugin_name == "template" {
                        // Handle template directory that might not have package.json
                        plugins.push(json!({
                            "name": "Extension Template",
                            "description": "Starting point for new IDE/tool integrations",
                            "version": "Template",
                            "path": "plugins/template/",
                            "language": "N/A",
                            "commands": 0,
                            "is_template": true
                        }));
                    }
                }
            }
        }

        Json(serde_json::json!({ "plugins": plugins }))
    }

    async fn get_extensions() -> Json<serde_json::Value> {
        use std::fs;
        use std::path::Path;
        let extensions_dir = Path::new("extensions");
        let mut extensions = Vec::new();

        if let Ok(entries) = fs::read_dir(extensions_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let ext_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("unknown");
                    let package_json_path = path.join("package.json");
                    
                    if package_json_path.exists() {
                        if let Ok(content) = fs::read_to_string(&package_json_path) {
                            if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                                extensions.push(json!({
                                    "name": pkg.get("name").and_then(|v| v.as_str()).unwrap_or(ext_name),
                                    "description": pkg.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                                    "version": pkg.get("version").and_then(|v| v.as_str()).unwrap_or("0.0.0"),
                                    "path": format!("extensions/{}/", ext_name),
                                    "language": "TypeScript/Node.js",
                                }));
                            }
                        }
                    }
                }
            }
        }

        Json(serde_json::json!({ "extensions": extensions }))
    }

    async fn get_connectors(State(state): State<Arc<server_state::ServerState>>) -> Json<serde_json::Value> {
        use std::fs;
        
        // Read config from file
        let config_data = fs::read_to_string(".mcp/config.json")
            .and_then(|content| {
                serde_json::from_str::<serde_json::Value>(&content)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
            })
            .unwrap_or_else(|_| json!({}));

        let transports = config_data.get("transports")
            .and_then(|t| t.as_array())
            .map(|arr| {
                arr.iter().filter_map(|t| t.as_str()).map(|t| {
                    json!({
                        "name": t,
                        "type": match t {
                            "stdio" => "Standard I/O",
                            "ws" => "WebSocket",
                            "http" => "HTTP",
                            _ => "Unknown"
                        },
                        "enabled": true,
                        "port": match t {
                            "ws" | "http" => config_data.get("server").and_then(|s| s.get("port")),
                            _ => None
                        },
                        "description": match t {
                            "stdio" => "Process standard input/output communication",
                            "ws" => "WebSocket bidirectional communication on server port",
                            "http" => "HTTP request/response communication",
                            _ => ""
                        }
                    })
                }).collect::<Vec<_>>()
            })
            .unwrap_or_else(Vec::new);

        let connections = state.get_connections().await;
        
        Json(json!({
            "transports": transports,
            "server_port": config_data.get("server").and_then(|s| s.get("port")).and_then(|p| p.as_u64()).unwrap_or(50550),
            "virtual_connector": {
                "enabled": true,
                "type": "In-Process Broker",
                "description": "Virtual connector for in-IDE connections via unified server port",
                "active_connections": connections.len()
            },
            "connections": connections
        }))
    }

    async fn toggle_context_engine(
        State(state): State<Arc<server_state::ServerState>>,
        Json(payload): Json<serde_json::Value>,
    ) -> Result<Json<serde_json::Value>, StatusCode> {
        if let Some(enabled) = payload.get("enabled").and_then(|v| v.as_bool()) {
            state.set_context_engine(enabled).await;
            tracing::info!("Context engine {}", if enabled { "enabled" } else { "disabled" });
            Ok(Json(json!({ "success": true, "enabled": enabled })))
        } else {
            Err(StatusCode::BAD_REQUEST)
        }
    }

    async fn toggle_tool(
        State(state): State<Arc<server_state::ServerState>>,
        Path(tool_name): Path<String>,
        Json(payload): Json<serde_json::Value>,
    ) -> Result<Json<serde_json::Value>, StatusCode> {
        if let Some(enabled) = payload.get("enabled").and_then(|v| v.as_bool()) {
            match state.toggle_tool(&tool_name, enabled).await {
                Ok(_) => {
                    tracing::info!("Tool {} {}", tool_name, if enabled { "enabled" } else { "disabled" });
                    Ok(Json(json!({ "success": true, "tool": tool_name, "enabled": enabled })))
                }
                Err(e) => {
                    tracing::error!("Failed to toggle tool: {}", e);
                    Err(StatusCode::NOT_FOUND)
                }
            }
        } else {
            Err(StatusCode::BAD_REQUEST)
        }
    }

    async fn register_connection(
        State(state): State<Arc<server_state::ServerState>>,
        Json(payload): Json<serde_json::Value>,
    ) -> Result<Json<serde_json::Value>, StatusCode> {
        if let (Some(id), Some(conn_type)) = (
            payload.get("id").and_then(|v| v.as_str()),
            payload.get("type").and_then(|v| v.as_str()),
        ) {
            state.add_connection(id.to_string(), conn_type.to_string()).await;
            tracing::info!("Connection registered: {} ({})", id, conn_type);
            Ok(Json(json!({ "success": true, "id": id })))
        } else {
            Err(StatusCode::BAD_REQUEST)
        }
    }

    async fn disconnect(
        State(state): State<Arc<server_state::ServerState>>,
        Path(conn_id): Path<String>,
    ) -> Json<serde_json::Value> {
        state.remove_connection(&conn_id).await;
        tracing::info!("Connection removed: {}", conn_id);
        Json(json!({ "success": true }))
    }

    async fn heartbeat(
        State(state): State<Arc<server_state::ServerState>>,
        Path(conn_id): Path<String>,
    ) -> Json<serde_json::Value> {
        state.update_activity(&conn_id).await;
        Json(json!({ "success": true }))
    }

    async fn execute_tool(
        State((_state, executor)): State<(Arc<server_state::ServerState>, Arc<tool_executor::InMemoryToolExecutor>)>,
        Json(payload): Json<serde_json::Value>,
    ) -> Result<Json<serde_json::Value>, StatusCode> {
        use crate::tool_executor::ToolExecutor;
        
        tracing::debug!("Received tool execution request: {}", serde_json::to_string(&payload).unwrap_or_default());
        
        let tool_name = payload.get("tool").and_then(|v| v.as_str())
            .ok_or_else(|| {
                tracing::error!("Missing 'tool' field in request");
                StatusCode::BAD_REQUEST
            })?;
        let input = payload.get("input").cloned()
            .unwrap_or(json!({}));
        let context_data = payload.get("context")
            .ok_or_else(|| {
                tracing::error!("Missing 'context' field in request");
                StatusCode::BAD_REQUEST
            })?;
        
        let context: ContextFrame = serde_json::from_value(context_data.clone())
            .map_err(|e| {
                tracing::error!("Failed to parse ContextFrame: {}", e);
                StatusCode::BAD_REQUEST
            })?;
        
        tracing::info!("Executing tool: {} via API", tool_name);
        
        match executor.execute(tool_name, input, context).await {
            Ok(result) => {
                Ok(Json(json!({
                    "success": result.success,
                    "output": result.output,
                    "error": result.error,
                    "execution_time": result.execution_time,
                    "context_used": result.context_used
                })))
            }
            Err(e) => {
                tracing::error!("Tool execution failed: {}", e);
                Ok(Json(json!({
                    "success": false,
                    "error": e.to_string(),
                    "execution_time": 0
                })))
            }
        }
    }

    async fn get_policies(
        State(policies): State<Arc<tokio::sync::RwLock<policies::Policies>>>,
    ) -> Json<policies::Policies> {
        Json(policies.read().await.clone())
    }

    async fn update_policies(
        State(policies): State<Arc<tokio::sync::RwLock<policies::Policies>>>,
        Json(new_policies): Json<policies::Policies>,
    ) -> Result<Json<serde_json::Value>, StatusCode> {
        // Save to disk
        if let Err(e) = new_policies.save(".mcp/policies.json") {
            tracing::error!("Failed to save policies: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        
        // Update in-memory
        *policies.write().await = new_policies;
        tracing::info!("Policies updated successfully");
        
        Ok(Json(json!({ "success": true })))
    }

    // Virtual connector handlers
    async fn virtual_health(State(vc): State<Arc<VirtualConnector>>) -> String {
        format!("active_connections={}", vc.active())
    }

    async fn virtual_connect(
        State(vc): State<Arc<VirtualConnector>>,
        axum::extract::Json(payload): axum::extract::Json<serde_json::Value>
    ) -> Json<serde_json::Value> {
        vc.connect();
        
        let client_type = payload.get("client_type")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        let transport = payload.get("transport")
            .and_then(|v| v.as_str())
            .unwrap_or("ws");
        
        Json(json!({
            "status": "connected",
            "connection_id": format!("virtual-{}-{}", client_type, uuid::Uuid::new_v4().to_string().split('-').next().unwrap()),
            "transport": transport,
            "timestamp": chrono::Utc::now().to_rfc3339()
        }))
    }

    async fn virtual_disconnect(State(vc): State<Arc<VirtualConnector>>) -> Json<serde_json::Value> {
        vc.disconnect();
        Json(json!({
            "status": "disconnected",
            "timestamp": chrono::Utc::now().to_rfc3339()
        }))
    }

    async fn create_plugin(Json(payload): Json<serde_json::Value>) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
        use std::fs;
        use std::io::Write;

        let name = payload.get("name")
            .and_then(|v| v.as_str())
            .ok_or((axum::http::StatusCode::BAD_REQUEST, "Missing 'name' field".to_string()))?;
        
        let display_name = payload.get("displayName")
            .and_then(|v| v.as_str())
            .unwrap_or(name);
        
        let description = payload.get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("A new MCP IDE plugin");
        
        let version = payload.get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("0.1.0");
        
        let ide = payload.get("ide")
            .and_then(|v| v.as_str())
            .unwrap_or("vscode");
        
        let publisher = payload.get("publisher")
            .and_then(|v| v.as_str())
            .unwrap_or("your-publisher");

        // Create plugin directory
        let plugin_dir = format!("plugins/{}", name);
        if std::path::Path::new(&plugin_dir).exists() {
            return Err((axum::http::StatusCode::CONFLICT, format!("Plugin '{}' already exists", name)));
        }

        fs::create_dir_all(&plugin_dir)
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create directory: {}", e)))?;
        
        fs::create_dir_all(format!("{}/src", plugin_dir))
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create src directory: {}", e)))?;

        // Create package.json based on IDE
        let (engines, dev_deps, scripts) = match ide {
            "vscode" => (
                json!({ "vscode": "^1.90.0" }),
                json!({
                    "typescript": "^5.6.3",
                    "@types/vscode": "^1.90.0",
                    "@types/node": "^20.10.0",
                    "@vscode/vsce": "^2.22.0"
                }),
                json!({
                    "build": "tsc -p .",
                    "watch": "tsc -w -p .",
                    "pack": "vsce package",
                    "vscode:prepublish": "npm run build"
                })
            ),
            "qoder" => (
                json!({ "qoder": "^0.2.0" }),
                json!({
                    "typescript": "^5.6.3",
                    "@types/node": "^20.10.0"
                }),
                json!({
                    "build": "tsc -p .",
                    "watch": "tsc -w -p .",
                    "pack": "qoder-pack",
                    "prepublish": "npm run build"
                })
            ),
            _ => (
                json!({ "node": ">=20.0.0" }),
                json!({
                    "typescript": "^5.6.3",
                    "@types/node": "^20.10.0"
                }),
                json!({
                    "build": "tsc -p .",
                    "watch": "tsc -w -p ."
                })
            )
        };

        let package_json = json!({
            "name": name,
            "displayName": display_name,
            "description": description,
            "version": version,
            "publisher": publisher,
            "engines": engines,
            "categories": ["Other"],
            "activationEvents": [
                format!("onCommand:{}.openDashboard", name),
                "onStartupFinished"
            ],
            "main": "./dist/extension.js",
            "contributes": {
                "commands": [
                    {
                        "command": format!("{}.openDashboard", name),
                        "title": format!("{}: Open Dashboard", display_name)
                    },
                    {
                        "command": format!("{}.showStatus", name),
                        "title": format!("{}: Show Status", display_name)
                    }
                ],
                "configuration": {
                    "title": display_name,
                    "properties": {
                        format!("{}.serverUrl", name): {
                            "type": "string",
                            "default": "http://localhost:50550",
                            "description": "MCP server URL"
                        },
                        format!("{}.autoConnect", name): {
                            "type": "boolean",
                            "default": true,
                            "description": "Auto-connect on activation"
                        }
                    }
                }
            },
            "scripts": scripts,
            "dependencies": {},
            "devDependencies": dev_deps
        });

        let mut pkg_file = fs::File::create(format!("{}/package.json", plugin_dir))
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create package.json: {}", e)))?;
        pkg_file.write_all(serde_json::to_string_pretty(&package_json).unwrap().as_bytes())
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write package.json: {}", e)))?;

        // Create tsconfig.json
        let tsconfig = json!({
            "compilerOptions": {
                "target": "ES2020",
                "module": "commonjs",
                "lib": ["ES2020"],
                "outDir": "./dist",
                "rootDir": "./src",
                "strict": true,
                "esModuleInterop": true,
                "skipLibCheck": true,
                "forceConsistentCasingInFileNames": true,
                "sourceMap": true
            },
            "include": ["src/**/*"],
            "exclude": ["node_modules", "dist"]
        });

        let mut ts_file = fs::File::create(format!("{}/tsconfig.json", plugin_dir))
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create tsconfig.json: {}", e)))?;
        ts_file.write_all(serde_json::to_string_pretty(&tsconfig).unwrap().as_bytes())
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write tsconfig.json: {}", e)))?;

        // Create extension.ts
        let extension_content = format!(r#"import * as {} from "{}";

let statusBarItem: {}.StatusBarItem;
let outputChannel: {}.OutputChannel;

/**
 * Activate plugin
 */
export async function activate(context: {}.ExtensionContext): Promise<void> {{
  outputChannel = {}.window.createOutputChannel("{}");
  outputChannel.appendLine("{} plugin activated");

  // Create status bar item
  statusBarItem = {}.window.createStatusBarItem({}.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(check) {}";
  statusBarItem.command = "{}.showStatus";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    {}.commands.registerCommand("{}.openDashboard", async () => {{
      const config = {}.workspace.getConfiguration("{}");
      const url = config.get<string>("serverUrl") ?? "http://localhost:50550";
      outputChannel.appendLine(`Opening dashboard: ${{url}}`);
      await {}.env.openExternal({}.Uri.parse(url));
    }}),

    {}.commands.registerCommand("{}.showStatus", async () => {{
      {}.window.showInformationMessage("{} plugin is active");
      outputChannel.show();
    }})
  );

  // Auto-connect if configured
  const config = {}.workspace.getConfiguration("{}");
  if (config.get<boolean>("autoConnect")) {{
    outputChannel.appendLine("Auto-connecting to MCP server...");
    // TODO: Implement connection logic
  }}

  outputChannel.appendLine("{} plugin ready");
}}

/**
 * Deactivate plugin
 */
export function deactivate(): void {{
  outputChannel.appendLine("{} plugin deactivated");
}}
"#, 
        ide, ide, ide, ide, ide, ide, display_name, display_name, 
        ide, ide, display_name, name, ide, name, ide, name, 
        ide, ide, ide, name, ide, display_name, ide, name, display_name, display_name
        );

        let mut ext_file = fs::File::create(format!("{}/src/extension.ts", plugin_dir))
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create extension.ts: {}", e)))?;
        ext_file.write_all(extension_content.as_bytes())
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write extension.ts: {}", e)))?;

        // Create .gitignore
        let gitignore = "node_modules/\ndist/\n*.vsix\n*.log\n.DS_Store\n";
        let mut gitignore_file = fs::File::create(format!("{}/.gitignore", plugin_dir))
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create .gitignore: {}", e)))?;
        gitignore_file.write_all(gitignore.as_bytes())
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write .gitignore: {}", e)))?;

        // Create .vscodeignore for vscode plugins
        if ide == "vscode" {
            let vscodeignore = ".vscode/**\n.vscode-test/**\nsrc/**\ntsconfig.json\nnode_modules/**\n*.map\n";
            let mut vscodeignore_file = fs::File::create(format!("{}/.vscodeignore", plugin_dir))
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create .vscodeignore: {}", e)))?;
            vscodeignore_file.write_all(vscodeignore.as_bytes())
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write .vscodeignore: {}", e)))?;
        }

        // Create README.md
        let readme = format!(r#"# {}

{}

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Development

```bash
npm run watch
```

## Package

```bash
npm run pack
```

## Configuration

- **Version**: {}
- **IDE**: {}
- **Publisher**: {}

## Usage

This plugin connects to the Nurones MCP server and provides IDE integration.

## License

MIT
"#, display_name, description, version, ide, publisher);

        let mut readme_file = fs::File::create(format!("{}/README.md", plugin_dir))
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create README: {}", e)))?;
        readme_file.write_all(readme.as_bytes())
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write README: {}", e)))?;

        Ok(Json(json!({
            "success": true,
            "plugin": {
                "name": name,
                "path": plugin_dir,
                "version": version,
                "ide": ide
            },
            "next_steps": [
                format!("cd {}", plugin_dir),
                "npm install",
                "npm run build",
                format!("Install in {} using the built package", ide)
            ],
            "message": format!("Plugin '{}' created successfully!", name)
        })))
    }

    async fn create_extension(Json(payload): Json<serde_json::Value>) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
        use std::fs;
        use std::io::Write;

        let name = payload.get("name")
            .and_then(|v| v.as_str())
            .ok_or((axum::http::StatusCode::BAD_REQUEST, "Missing 'name' field".to_string()))?;
        
        let description = payload.get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("A new MCP extension");
        
        let version = payload.get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("1.0.0");
        
        let language = payload.get("language")
            .and_then(|v| v.as_str())
            .unwrap_or("TypeScript");
        
        let entry = payload.get("entry")
            .and_then(|v| v.as_str())
            .unwrap_or("dist/index.js");
        
        let permissions: Vec<String> = payload.get("permissions")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_else(|| vec!["read".to_string()]);
        
        let create_manifest = payload.get("createManifest")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        // Create extension directory
        let ext_dir = format!("extensions/{}", name);
        if std::path::Path::new(&ext_dir).exists() {
            return Err((axum::http::StatusCode::CONFLICT, format!("Extension '{}' already exists", name)));
        }

        fs::create_dir_all(&ext_dir)
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create directory: {}", e)))?;
        
        fs::create_dir_all(format!("{}/src", ext_dir))
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create src directory: {}", e)))?;

        // Create package.json
        let package_json = json!({
            "name": format!("@nurones/mcp-ext-{}", name),
            "version": version,
            "description": description,
            "main": entry,
            "scripts": {
                "build": if language == "TypeScript" { "tsc" } else { "echo 'No build needed for JavaScript'" },
                "dev": "tsc --watch",
                "test": "echo \"No tests configured\""
            },
            "keywords": ["mcp", "extension", name],
            "author": "",
            "license": "MIT",
            "devDependencies": if language == "TypeScript" {
                json!({
                    "typescript": "^5.0.0",
                    "@types/node": "^20.0.0"
                })
            } else {
                json!({})
            },
            "mcp": {
                "permissions": permissions,
                "entry": entry
            }
        });

        let mut pkg_file = fs::File::create(format!("{}/package.json", ext_dir))
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create package.json: {}", e)))?;
        pkg_file.write_all(serde_json::to_string_pretty(&package_json).unwrap().as_bytes())
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write package.json: {}", e)))?;

        // Create tsconfig.json if TypeScript
        if language == "TypeScript" {
            let tsconfig = json!({
                "compilerOptions": {
                    "target": "ES2020",
                    "module": "commonjs",
                    "lib": ["ES2020"],
                    "outDir": "./dist",
                    "rootDir": "./src",
                    "strict": true,
                    "esModuleInterop": true,
                    "skipLibCheck": true,
                    "forceConsistentCasingInFileNames": true,
                    "declaration": true,
                    "declarationMap": true,
                    "sourceMap": true
                },
                "include": ["src/**/*"],
                "exclude": ["node_modules", "dist"]
            });

            let mut ts_file = fs::File::create(format!("{}/tsconfig.json", ext_dir))
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create tsconfig.json: {}", e)))?;
            ts_file.write_all(serde_json::to_string_pretty(&tsconfig).unwrap().as_bytes())
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write tsconfig.json: {}", e)))?;
        }

        // Create main source file
        let main_ext = if language == "TypeScript" { "ts" } else { "js" };
        let main_content = if language == "TypeScript" {
            format!(r#"/**
 * MCP Extension: {}
 * {}
 */

export interface ToolInput {{
  [key: string]: any;
}}

export interface ToolOutput {{
  success: boolean;
  data?: any;
  error?: string;
}}

/**
 * Main extension entry point
 * This function is called when the extension is loaded
 */
export async function initialize(): Promise<void> {{
  console.log('Extension {{}} initialized', '{}');
}}

/**
 * Example tool implementation
 * Rename and modify this to implement your tool logic
 */
export async function executeTool(input: ToolInput): Promise<ToolOutput> {{
  try {{
    // Your tool logic here
    return {{
      success: true,
      data: {{
        message: 'Tool executed successfully',
        input
      }}
    }};
  }} catch (error) {{
    return {{
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }};
  }}
}}
"#, name, description, name)
        } else {
            format!(r#"/**
 * MCP Extension: {}
 * {}
 */

/**
 * Main extension entry point
 */
async function initialize() {{
  console.log('Extension {{}} initialized', '{}');
}}

/**
 * Example tool implementation
 */
async function executeTool(input) {{
  try {{
    return {{
      success: true,
      data: {{
        message: 'Tool executed successfully',
        input
      }}
    }};
  }} catch (error) {{
    return {{
      success: false,
      error: error.message
    }};
  }}
}}

module.exports = {{ initialize, executeTool }};
"#, name, description, name)
        };

        let mut main_file = fs::File::create(format!("{}/src/index.{}", ext_dir, main_ext))
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create main source file: {}", e)))?;
        main_file.write_all(main_content.as_bytes())
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write main source file: {}", e)))?;

        // Create README.md
        let readme = format!(r#"# {}

{}

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Development

```bash
npm run dev
```

## Configuration

- **Version**: {}
- **Language**: {}
- **Entry Point**: {}
- **Permissions**: {}

## Usage

This extension provides tools for the Nurones MCP server.

## License

MIT
"#, name, description, version, language, entry, permissions.join(", "));

        let mut readme_file = fs::File::create(format!("{}/README.md", ext_dir))
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create README: {}", e)))?;
        readme_file.write_all(readme.as_bytes())
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write README: {}", e)))?;

        // Create manifest in .mcp/tools/ if requested
        let mut manifest_path = None;
        if create_manifest {
            fs::create_dir_all(".mcp/tools")
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create .mcp/tools directory: {}", e)))?;

            let manifest = json!({
                "id": format!("ext.{}", name),
                "name": name,
                "version": version,
                "description": description,
                "type": "extension",
                "runtime": language,
                "entry": format!("extensions/{}/{}", name, entry),
                "permissions": permissions,
                "enabled": true,
                "metadata": {
                    "created": chrono::Utc::now().to_rfc3339(),
                    "author": "generated"
                }
            });

            let manifest_file_path = format!(".mcp/tools/{}.json", name);
            let mut manifest_file = fs::File::create(&manifest_file_path)
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create manifest: {}", e)))?;
            manifest_file.write_all(serde_json::to_string_pretty(&manifest).unwrap().as_bytes())
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write manifest: {}", e)))?;
            
            manifest_path = Some(manifest_file_path);
        }

        // Create .gitignore
        let gitignore = "node_modules/\ndist/\n*.log\n.DS_Store\n";
        let mut gitignore_file = fs::File::create(format!("{}/.gitignore", ext_dir))
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create .gitignore: {}", e)))?;
        gitignore_file.write_all(gitignore.as_bytes())
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write .gitignore: {}", e)))?;

        Ok(Json(json!({
            "success": true,
            "extension": {
                "name": name,
                "path": ext_dir,
                "version": version,
                "language": language,
                "manifest": manifest_path
            },
            "next_steps": [
                format!("cd {}", ext_dir),
                "npm install",
                "npm run build",
                "Restart MCP server to load the extension"
            ],
            "message": format!("Extension '{}' created successfully!", name)
        })))
    }

    // Build router
    let metrics_state = (
        state_for_metrics,
        registry_clone,
        connections_gauge,
        tools_gauge,
        context_engine_gauge
    );
    
    let executor_state = (state.clone(), tool_executor.clone());
    let policies_state = policies.clone();
    let vc_state = virtual_connector.clone();
    
    // Check runtime availability
    let native_available = which::which("node").is_ok();
    let wasi_available = which::which("wasmtime").is_ok();
    let status_state = (state.clone(), transports.clone(), native_available, wasi_available, otel_exporter.clone());
    
    // Static file serving for Admin UI
    let static_dir = std::path::PathBuf::from("admin-web/out");
    let serve_static = if static_dir.exists() {
        tracing::info!("Serving Admin UI from: {:?}", static_dir);
        Some(ServeDir::new(static_dir).append_index_html_on_directories(true))
    } else {
        tracing::warn!("Admin UI not built. Run 'cd admin-web && npm run build' to create static files");
        None
    };
    
    let mut app = Router::new()
        // Health & Metrics
        .route("/api/health", get(|| async { "OK" }))
        .route("/metrics", get(get_metrics).with_state(metrics_state))
        // Virtual Connector
        .route("/api/connector/virtual/health", get(virtual_health).with_state(vc_state.clone()))
        .route("/api/connector/virtual/connect", post(virtual_connect).with_state(vc_state.clone()))
        .route("/api/connector/virtual/disconnect", post(virtual_disconnect).with_state(vc_state))
        // Tools & Execution
        .route("/api/status", get(get_status).with_state(status_state))
        .route("/api/tools", get(get_tools).post(create_tool))
        .route("/api/tool-manifests", get(get_tool_manifests))
        .route("/api/plugins", get(get_plugins))
        .route("/api/plugins/create", post(create_plugin))
        .route("/api/extensions", get(get_extensions))
        .route("/api/extensions/create", post(create_extension))
        .route("/api/connectors", get(get_connectors))
        .route("/api/tools/execute", post(execute_tool).with_state(executor_state))
        .route("/api/context-engine", post(toggle_context_engine))
        .route("/api/tools/:name", patch(toggle_tool).put(update_tool).delete(delete_tool))
        // Connections
        .route("/api/connections", post(register_connection))
        .route("/api/connections/:id", axum::routing::delete(disconnect))
        .route("/api/connections/:id/heartbeat", post(heartbeat))
        // Policies
        .route("/api/policies", get(get_policies).post(update_policies).with_state(policies_state))
        // Settings (port configuration)
        .merge(settings_router(settings_state.cfg_path.clone(), settings_state))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);
    
    // Add static file serving if Admin UI is built
    if let Some(serve_dir) = serve_static {
        app = app.fallback_service(serve_dir);
    }

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("API server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
