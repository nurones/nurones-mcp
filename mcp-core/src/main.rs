use nurones_mcp::*;
use clap::Parser;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

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

    // Initialize tool executor
    let tool_executor = tool_executor::InMemoryToolExecutor::new();
    
    // Load tools from directory
    tracing::info!("Loading tools from: {}", args.tools_dir);
    if let Err(e) = tool_executor.load_tools(&args.tools_dir).await {
        tracing::warn!("Failed to load some tools: {}", e);
    }

    // Initialize observability
    let _observability = observability::ObservabilityService::new();

    // Start Prometheus metrics endpoint
    let prometheus_port = config.observability.prometheus_port;
    tokio::spawn(async move {
        if let Err(e) = start_prometheus_server(prometheus_port).await {
            tracing::error!("Prometheus server failed: {}", e);
        }
    });

    tracing::info!("Nurones MCP Server ready");
    tracing::info!("  Profile: {}", config.profile);
    tracing::info!("  Transports: {:?}", config.transports);
    tracing::info!("  Observability:");
    tracing::info!("    - OTel Exporter: {}", config.observability.otel_exporter);
    tracing::info!("    - Prometheus: http://localhost:{}/metrics", prometheus_port);
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

async fn start_prometheus_server(port: u16) -> anyhow::Result<()> {
    use axum::{routing::get, Router};

    let app = Router::new().route(
        "/metrics",
        get(|| async { "# Prometheus metrics endpoint\n# TODO: implement full metrics export\n" }),
    );

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Prometheus metrics server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
