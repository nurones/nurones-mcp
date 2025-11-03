# @nurones/mcp Bootstrap Guide

This guide provides step-by-step instructions to bootstrap the Nurones MCP server for Spiral-0 acceptance.

## Prerequisites Check

Run these commands to verify your environment:

```bash
# Rust
rustc --version    # Should be 1.70+
cargo --version

# Node
node --version     # Should be 20+
pnpm --version     # Should be 8+

# Docker (optional)
docker --version
```

## Step-by-Step Bootstrap

### Step 1: Build Rust Core

```bash
cd mcp-core
cargo build --release
```

**Expected output:** Binary at `target/release/nurones-mcp`

**Verify:**
```bash
./target/release/nurones-mcp --version
# Should output: nurones-mcp 0.5.0
```

### Step 2: Start Observability Stack

#### Using Docker Compose (Recommended)

Create `docker-compose.yml` in project root:

```yaml
version: '3.8'
services:
  otel-collector:
    image: otel/opentelemetry-collector:latest
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4318:4318"
      - "4317:4317"

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
```

Create `otel-collector-config.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

exporters:
  logging:
    loglevel: debug

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [logging]
```

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'nurones-mcp'
    static_configs:
      - targets: ['host.docker.internal:9464']
```

Start stack:

```bash
docker-compose up -d
```

**Verify:**
- Prometheus: http://localhost:9090
- OTel Collector: http://localhost:4318 (should respond to health checks)

### Step 3: Run MCP Server

```bash
cd mcp-core
export CONTEXT_ENGINE=on
export FS_ALLOWLIST=/workspace,/tmp
./target/release/nurones-mcp --config ../.mcp/config.json
```

**Expected output:**
```
[INFO] Starting Nurones MCP Server v0.5.0
[INFO] Loading configuration from: .mcp/config.json
[INFO] Context Engine: ENABLED
[INFO] Loading tools from: .mcp/tools
[INFO] Nurones MCP Server ready
[INFO]   Profile: qoder-prod
[INFO]   Transports: [Stdio, Ws]
[INFO]   Observability:
[INFO]     - OTel Exporter: http://localhost:4318
[INFO]     - Prometheus: http://localhost:9464/metrics
```

**Verify server is running:**
```bash
curl http://localhost:9464/metrics
# Should return metrics output
```

### Step 4: Build Node SDK

```bash
cd sdk-node
pnpm install
pnpm build
```

**Expected output:** Compiled files in `dist/`

**Verify:**
```bash
ls dist/
# Should show: index.js, index.d.ts, types.js, types.d.ts
```

### Step 5: Build Admin Web UI

```bash
cd admin-web
pnpm install
pnpm build
pnpm start
```

**Expected output:** Server running at http://localhost:3000

**Verify:** Open http://localhost:3000 in browser
- Should display Nurones MCP Admin dashboard
- All 5 tabs should be accessible
- Dashboard should show "Connected" status

### Step 6: Test Tool Execution

In a new terminal:

```bash
# Test fs.read tool (simulated)
cd mcp-core
cargo test tool_execution -- --nocapture
```

**Expected output:**
```
test tool_executor::tests::test_tool_execution ... ok
```

### Step 7: Verify Figma Integration Path

```bash
ls -la .figma/fe-design/
# Directory should exist (currently empty)
# Production: Will contain Figma exports
```

### Step 8: Qoder Integration (if Qoder available)

```bash
# Register extension
qoder ext add ./qoder-integration/extension.json

# Test commands
qoder run nurones.mcp.openDashboard
qoder run nurones.mcp.viewTrace --traceId bootstrap-000
```

## Spiral-0 Acceptance Checklist

Run through these checks:

### ✅ AT-CONTEXT-SCHEMA
```bash
cd mcp-core
cargo test context_validation
```

### ✅ AT-AUTO-SAFE
```bash
cd mcp-core
cargo test autotune_safety
```

### ✅ AT-QODER-INTEG
- [ ] Extension manifest loads without errors
- [ ] Commands registered in Qoder palette
- [ ] Telemetry visible in Qoder panel

### ✅ AT-FS-SEC
```bash
cd mcp-core
cargo test readonly_flag
```

### ✅ AT-ROLLBACK
```bash
cd mcp-core
cargo test rollback
```

### ✅ AT-UI-BUILD
- [ ] Admin web builds successfully
- [ ] All tabs render correctly
- [ ] No visual drift from baseline

## Troubleshooting

### Rust build fails

```bash
# Update Rust toolchain
rustup update stable
rustup default stable
```

### Node dependencies fail

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
pnpm install
```

### Prometheus not scraping metrics

Check that `host.docker.internal` resolves:
```bash
docker exec prometheus ping host.docker.internal
```

If not, use your machine's IP address in `prometheus.yml`.

### Admin web fails to start

```bash
# Check Next.js version
cd admin-web
pnpm list next
# Should be 14.0.4+

# Clear Next.js cache
rm -rf .next
pnpm build
```

## Safety Mode (Deterministic)

To run in fully deterministic mode (no autotune):

```bash
export CONTEXT_ENGINE=off
./target/release/nurones-mcp --config ../.mcp/config.json
```

All adaptive features will be disabled; configuration is static.

## Rollback Test

```bash
# Start server
./target/release/nurones-mcp --config ../.mcp/config.json

# In another terminal, trigger rollback test
cargo test test_rollback -- --nocapture
```

Expected: Metrics reset to baseline values.

## Next Steps

Once Spiral-0 acceptance passes, proceed to:

1. **Spiral-1:** Enhanced Rust runtime with full WASI support
2. **Spiral-2:** Deep Qoder integration (commands, panels, telemetry)
3. **Spiral-3:** Production context engine hardening
4. **Spiral-4:** 72h stress testing + final acceptance

---

**Questions?** Open an issue or contact the Nurones team.
