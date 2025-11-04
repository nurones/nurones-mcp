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
    tokio::spawn(async move {
        if let Err(e) = start_api_server(
            port,
            state_for_server,
            executor_for_server,
            policies_for_server,
            vc_for_server,
            settings_state,
            transports_for_server,
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
        State((server_state, transports, native_available, wasi_available)):
        State<(Arc<server_state::ServerState>, Vec<String>, bool, bool)>
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
            }
        }))
    }

    async fn get_tools(State(state): State<Arc<server_state::ServerState>>) -> Json<Vec<server_state::ToolStatus>> {
        Json(state.get_tools().await)
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

    async fn virtual_connect(State(vc): State<Arc<VirtualConnector>>) -> &'static str {
        vc.connect();
        "connected"
    }

    async fn virtual_disconnect(State(vc): State<Arc<VirtualConnector>>) -> &'static str {
        vc.disconnect();
        "disconnected"
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
    let status_state = (state.clone(), transports.clone(), native_available, wasi_available);
    
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
        .route("/api/tools", get(get_tools))
        .route("/api/tool-manifests", get(get_tool_manifests))
        .route("/api/tools/execute", post(execute_tool).with_state(executor_state))
        .route("/api/context-engine", post(toggle_context_engine))
        .route("/api/tools/:name", patch(toggle_tool))
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
