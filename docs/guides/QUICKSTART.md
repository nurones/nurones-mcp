# Nurones MCP Quick Start Guide

## Table of Contents
- [Prerequisites](#prerequisites)
- [One-Line Setup](#one-line-setup)
- [Starting Services](#starting-services)
- [Accessing Admin Web UI](#accessing-admin-web-ui)
- [IDE Extension Setup](#ide-extension-setup)
- [Testing Tool Execution](#testing-tool-execution)
- [Observability & Monitoring](#observability--monitoring)
- [Next Steps](#next-steps)

---

## Prerequisites

Verify your environment has the required tools:

```bash
# Rust (1.70+)
rustc --version
cargo --version

# Node.js (20+)
node --version
pnpm --version

# Docker (optional for observability)
docker --version
```

**Install missing tools:**
- Rust: https://rustup.rs/
- Node.js: https://nodejs.org/ (use nvm recommended)
- pnpm: `npm install -g pnpm`

---

## One-Line Setup

```bash
# Clone and build everything
git clone https://github.com/nurones/nurones-mcp.git && \
cd nurones-mcp && \
cd mcp-core && cargo build --release && cd .. && \
cd sdk-node && pnpm install && pnpm build && cd .. && \
cd admin-web && pnpm install && pnpm build && cd ..
```

**What this does:**
1. Clones the repository
2. Builds Rust MCP server (`mcp-core`)
3. Builds Node.js SDK (`sdk-node`)
4. Builds Admin Web UI (`admin-web`)

**Verify build:**
```bash
ls -lh mcp-core/target/release/nurones-mcp
ls -lh admin-web/.next
```

---

## Starting Services

### Automated Startup (Recommended)

```bash
./start-services.sh
```

**What this does:**
- Kills any existing services on ports 4050 and 4055
- Starts MCP Server on port **4055**
- Starts Admin Web on port **4050**
- Verifies both services are healthy

**Expected output:**
```
=== Services Started Successfully ===
MCP Server API:  http://localhost:4055
Admin Web UI:    http://localhost:4050
Logs:
  MCP Server:    tail -f /tmp/mcp-server.log
  Admin Web:     tail -f /tmp/admin-web.log
```

### Manual Startup (Alternative)

```bash
# Terminal 1: MCP Server
cd mcp-core
export RUST_LOG=info
export CONTEXT_ENGINE=on
export FS_ALLOWLIST=/workspace,/tmp
./target/release/nurones-mcp --config ../.mcp/config.json

# Terminal 2: Admin Web UI
cd admin-web
PORT=4050 npm run dev
```

---

## Accessing Admin Web UI

Open your browser: **http://localhost:4050**

### Available Tabs

1. **Dashboard** - System overview, connected IDEs, Context Engine status
2. **Tools** - View and manage all 15 registered tools
3. **Test Tools** - Execute tools with custom parameters
4. **Policies** - Configure RBAC, roles, and filesystem allowlist
5. **Telemetry** - View metrics and traces
6. **Context Monitor** - Real-time context engine activity

### Quick Test

1. Navigate to **Dashboard** tab
2. Verify "Active Tools: 15"
3. Click **Toggle** button next to Context Engine
4. Watch status change between ON/OFF
5. Navigate to **Tools** tab
6. Click **Disable** on any tool
7. Watch status change in real-time

---

## IDE Extension Setup

### VS Code Extension

```bash
cd extensions/vscode
npm install
npm run build

# Option 1: Development mode
code --extensionDevelopmentPath=$(pwd)

# Option 2: Package and install
npm run pack
code --install-extension nurones-mcp-0.5.0.vsix
```

**Configure VS Code:**

Add to `.vscode/settings.json`:
```json
{
  "nuronesMcp.serverBinary": "${workspaceFolder}/mcp-core/target/release/nurones-mcp",
  "nuronesMcp.serverConfig": "${workspaceFolder}/.mcp/config.json",
  "nuronesMcp.adminWebUrl": "http://localhost:4050",
  "nuronesMcp.autoStart": true,
  "nuronesMcp.contextEngine": true,
  "nuronesMcp.fsAllowlist": "${workspaceFolder},/tmp"
}
```

**Test extension:**
1. Open Command Palette (Cmd/Ctrl+Shift+P)
2. Run: `Nurones MCP: Open Dashboard`
3. Admin Web UI should open
4. Check Output Channel for connection logs

### Qoder Extension

```bash
cd extensions/qoder
npm install
npm run build
npm run pack

# Install via Qoder Extension Manager
# Extensions > Install from VSIX > Select nurones-mcp-qoder-0.5.0.vsix
```

**Configure Qoder:**
Same configuration as VS Code, use Qoder's settings UI.

---

## Testing Tool Execution

### Via Admin Web UI

1. Navigate to **Test Tools** tab
2. Select tool: `fs.read`
3. Enter input JSON:
   ```json
   {"path": "/tmp/test.txt"}
   ```
4. Click **Execute Tool**
5. View result in the Result panel

### Via API

```bash
# Create test file
echo "Hello from Nurones MCP" > /tmp/test.txt

# Execute fs.read tool
curl -X POST http://localhost:4055/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "fs.read",
    "input": {"path": "/tmp/test.txt"},
    "context": {
      "reason_trace_id": "quickstart-test",
      "tenant_id": "default",
      "stage": "dev",
      "risk_level": 0,
      "ts": "2025-11-04T00:00:00Z"
    }
  }'
```

**Expected response:**
```json
{
  "success": true,
  "output": {
    "content": "Hello from Nurones MCP",
    "path": "/tmp/test.txt",
    "size": 22
  },
  "execution_time": 5
}
```

### Via IDE Extension

**VS Code:**
1. Open Command Palette
2. Run: `Nurones MCP: Execute Tool`
3. Select tool: `fs.read`
4. Enter path: `/tmp/test.txt`
5. View result in Output Channel

---

## Observability & Monitoring

### Prometheus Metrics

```bash
# View all metrics
curl http://localhost:4055/metrics

# Key metrics
curl -s http://localhost:4055/metrics | grep mcp_
```

**Available metrics:**
- `mcp_active_connections` - Number of connected IDEs
- `mcp_registered_tools` - Total tools available (should be 15)
- `mcp_context_engine_enabled` - Context Engine status (0=off, 1=on)

### Server Status

```bash
curl http://localhost:4055/api/status
```

**Response:**
```json
{
  "version": "0.5.0",
  "status": "running",
  "profile": "dev",
  "context_engine_enabled": true,
  "tools_count": 15,
  "connections": [
    {
      "id": "vscode-1730678456-abc123",
      "type": "vscode",
      "connected_at": "2025-11-04T10:30:00Z",
      "last_activity": "2025-11-04T10:45:00Z"
    }
  ]
}
```

### Server Logs

```bash
# MCP Server logs
tail -f /tmp/mcp-server.log

# Admin Web logs
tail -f /tmp/admin-web.log

# Filter for specific events
tail -f /tmp/mcp-server.log | grep "Executing tool"
```

### OpenTelemetry (Optional)

**Using Docker Compose:**

```bash
# Start OTel stack
docker-compose up -d

# View traces in Jaeger
open http://localhost:16686

# View metrics in Prometheus
open http://localhost:9090
```

---

## Next Steps

### Learn More

1. **[Bootstrap Guide](BOOTSTRAP.md)** - Detailed setup instructions
2. **[Admin UI Guide](ADMIN_UI_GUIDE.md)** - Complete UI feature reference
3. **[Extensions Guide](EXTENSIONS.md)** - VS Code vs Qoder comparison
4. **[Port Configuration](PORT_CONFIGURATION.md)** - Service port reference

### Configure Security

```bash
# Edit policies
vim .mcp/policies.json

# Add custom allowlist paths
{
  "fs_allowlist": [
    "/workspace",
    "/tmp",
    "/your/custom/path"
  ]
}

# Restart server to apply
./start-services.sh
```

### Add Custom Tools

```bash
# Create tool manifest
cat > .mcp/tools/custom.json <<EOF
{
  "name": "custom.tool",
  "version": "1.0.0",
  "entry": "native://custom",
  "permissions": ["read"],
  "description": "My custom tool"
}
EOF

# Restart server
./start-services.sh
```

### Explore API

```bash
# Get all tools
curl http://localhost:4055/api/tools

# Get policies
curl http://localhost:4055/api/policies

# Toggle Context Engine
curl -X POST http://localhost:4055/api/context-engine \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

---

## Troubleshooting

### Services won't start

```bash
# Check if ports are in use
lsof -i :4050
lsof -i :4055

# Kill existing processes
pkill -f "nurones-mcp"
pkill -f "next dev"

# Restart
./start-services.sh
```

### Extension not connecting

1. Verify MCP server is running: `curl http://localhost:4055/api/status`
2. Check extension Output Channel for errors
3. Verify `adminWebUrl` setting: `http://localhost:4050`
4. Restart IDE

### Tool execution fails

```bash
# Check server logs
tail -20 /tmp/mcp-server.log

# Verify path is in allowlist
curl http://localhost:4055/api/policies | grep fs_allowlist

# Test with allowed path
curl -X POST http://localhost:4055/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool":"fs.read","input":{"path":"/tmp/test.txt"},"context":{"reason_trace_id":"test","tenant_id":"default","stage":"dev","risk_level":0,"ts":"2025-11-04T00:00:00Z"}}'
```

---

## Support

- **Documentation:** `/docs`
- **Issues:** https://github.com/nurones/nurones-mcp/issues
- **Discussions:** https://github.com/nurones/nurones-mcp/discussions

**You're all set! 🚀**
