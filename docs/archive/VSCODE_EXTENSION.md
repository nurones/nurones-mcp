# Nurones MCP — VS Code Extension Guide (Spiral-1 Ready)

## Overview

The **Nurones MCP VS Code Extension** is the **primary host** for the MCP runtime, providing seamless integration with VS Code while maintaining compatibility with Qoder as a secondary host.

---

## Installation & Setup

### Prerequisites

1. **Build MCP Core** (if not already done):
   ```bash
   cd mcp-core
   cargo build --release
   ```

2. **Start Admin Web** (optional, for dashboard):
   ```bash
   cd admin-web
   pnpm install
   pnpm build
   pnpm start  # Runs on http://localhost:3000
   ```

### Install Extension

#### Development Mode
```bash
cd vscode-extension
npm install
npm run build
code --extensionDevelopmentPath=$(pwd) /path/to/your/workspace
```

#### Package & Install
```bash
cd vscode-extension
npm install
npm run pack
code --install-extension nurones-mcp-0.5.0.vsix
```

---

## Configuration

### Workspace Settings

Create or update `.vscode/settings.json` in your workspace:

```json
{
  "nuronesMcp.serverBinary": "${workspaceFolder}/mcp-core/target/release/nurones-mcp",
  "nuronesMcp.serverConfig": "${workspaceFolder}/.mcp/config.json",
  "nuronesMcp.adminWebUrl": "http://localhost:3000",
  "nuronesMcp.autoStart": true,
  "nuronesMcp.contextEngine": true,
  "nuronesMcp.fsAllowlist": "${workspaceFolder},/tmp"
}
```

### Available Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `nuronesMcp.serverBinary` | string | `${workspaceFolder}/mcp-core/target/release/nurones-mcp` | Path to MCP server binary |
| `nuronesMcp.serverConfig` | string | `${workspaceFolder}/.mcp/config.json` | Path to server config |
| `nuronesMcp.adminWebUrl` | string | `http://localhost:3000` | Admin web UI URL |
| `nuronesMcp.autoStart` | boolean | `true` | Auto-start server on activation |
| `nuronesMcp.contextEngine` | boolean | `true` | Enable Context Engine |
| `nuronesMcp.fsAllowlist` | string | `${workspaceFolder},/tmp` | Filesystem allowlist |

---

## Features

### 1. Status Bar Integration

The extension adds a status bar item showing:
- **✓ Nurones MCP [ON]** - Server running, Context Engine enabled
- **✓ Nurones MCP [OFF]** - Server running, Context Engine disabled
- **✗ Nurones MCP [Stopped]** - Server not running

Click the status bar item to view detailed status and control server.

### 2. Commands

Access via Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

#### `Nurones MCP: Open Dashboard`
Opens the admin web UI in your default browser.

#### `Nurones MCP: Execute Tool`
Prompts for:
1. Tool name (e.g., `fs.read`, `fs.write`, `telemetry.push`)
2. Arguments as JSON

Automatically creates and propagates ContextFrame with:
- `reason_trace_id`: `vscode-{timestamp}-{random}`
- `tenant_id`: `default`
- `stage`: `dev`
- `risk_level`: `0`
- `context_confidence`: `0.7`

#### `Nurones MCP: View Context Trace`
Prompts for `reason_trace_id` and opens:
- Output channel with trace details
- Terminal with trace context

#### `Nurones MCP: Toggle Context Engine`
Toggles Context Engine on/off. Prompts to restart server to apply changes.

#### `Nurones MCP: Show Status`
Displays server status and provides quick actions:
- Start/Stop Server
- Open Dashboard
- View Logs

### 3. Safety Features

#### Filesystem Allowlist Validation
- Warns if workspace folder not in allowlist
- Alerts on paths outside workspace/tmp
- Prompts before starting with warnings

#### Log Redaction
- Automatically redacts file paths outside allowlist
- Prevents PII leakage in error logs
- Maintains security in shared environments

#### Context Propagation
All tool executions include full ContextFrame:
```json
{
  "reason_trace_id": "vscode-1730678400-abc123",
  "tenant_id": "default",
  "stage": "dev",
  "risk_level": 0,
  "context_confidence": 0.7,
  "ts": "2025-11-03T12:00:00.000Z"
}
```

---

## Usage Examples

### Example 1: Execute fs.read Tool

1. Open Command Palette
2. Select "Nurones MCP: Execute Tool"
3. Enter tool name: `fs.read`
4. Enter args: `{"path": "/workspace/README.md"}`
5. Check Output Channel for results

### Example 2: View Context Trace

1. Note `reason_trace_id` from previous execution (shown in output)
2. Open Command Palette
3. Select "Nurones MCP: View Context Trace"
4. Enter trace ID: `vscode-1730678400-abc123`
5. View trace in terminal and OTel Collector

### Example 3: Toggle Context Engine

1. Click status bar item showing "Nurones MCP [ON]"
2. Select "Toggle Context Engine"
3. Confirm restart
4. Status bar updates to "[OFF]"
5. All adaptive tuning disabled (deterministic mode)

---

## Spiral-1 Acceptance Checks

### ✅ VS Code Host Priority

- [x] Launch VS Code extension successfully
- [x] **Open Dashboard** opens admin-web at http://localhost:3000
- [x] **Execute Tool** with `fs.read` shows output in server logs
- [x] **View Context Trace** displays same `reason_trace_id` in OTel
- [x] Status bar shows Context Engine state (ON/OFF)

### ✅ ContextFrame Propagation

- [x] All tool executions include ContextFrame
- [x] Spans contain `reason_trace_id`, `tenant_id`, `risk_level`
- [x] Traces visible in OTel Collector
- [x] Context linkage maintained across operations

### ✅ Safety Switches

- [x] `CONTEXT_ENGINE=off` enforces deterministic behavior
- [x] Toggle Context Engine command works
- [x] Server restart required to apply changes
- [x] Status bar reflects current state

### ✅ Visual Parity

- [x] Admin web loads without errors
- [x] All 5 tabs render correctly
- [x] No UI drift from baseline
- [x] Dashboard accessible from VS Code

### ✅ Hardening Add-ons

- [x] **Status bar item** shows Context Engine state
- [x] **Secure FS allowlist** validates workspace paths
- [x] **Log redaction** removes PII from file paths
- [x] **Workspace-relative paths** supported

---

## Architecture

### Extension Activation Flow

```
1. Extension activates on VS Code startup
2. Reads workspace configuration
3. Validates server binary and config paths
4. Checks filesystem allowlist
5. Starts MCP server process (if autoStart=true)
6. Updates status bar
7. Registers all commands
8. Streams server output to Output Channel
```

### ContextFrame Creation

Each VS Code operation creates a unique ContextFrame:

```typescript
{
  reason_trace_id: `vscode-${Date.now()}-${randomId}`,
  tenant_id: "default",
  stage: "dev",
  risk_level: 0,
  context_confidence: 0.7,
  ts: new Date().toISOString()
}
```

### Server Communication

- **Protocol**: stdio pipe
- **Format**: JSON lines
- **Example message**:
  ```json
  {
    "op": "exec",
    "tool": "fs.read",
    "args": {"path": "/workspace/README.md"},
    "context": { ...ContextFrame }
  }
  ```

---

## Troubleshooting

### Server Won't Start

1. Verify binary exists:
   ```bash
   ls -la mcp-core/target/release/nurones-mcp
   ```

2. Check configuration:
   ```bash
   cat .mcp/config.json
   ```

3. View logs:
   - Open Command Palette
   - Select "Nurones MCP: Show Status"
   - Click "View Logs"

### Extension Not Loading

1. Check VS Code version: `1.90.0+` required
2. Rebuild extension:
   ```bash
   cd vscode-extension
   npm run build
   ```

3. Reload VS Code window:
   - Command Palette → "Developer: Reload Window"

### Context Engine Not Toggling

1. Verify workspace settings saved:
   ```bash
   cat .vscode/settings.json
   ```

2. Restart server manually:
   - Command Palette → "Nurones MCP: Show Status"
   - Click "Restart Server"

### Filesystem Allowlist Warnings

If you see warnings about paths outside workspace:

1. Update allowlist in settings:
   ```json
   {
     "nuronesMcp.fsAllowlist": "${workspaceFolder},/tmp,/other/allowed/path"
   }
   ```

2. Reload VS Code to apply changes

---

## Next Steps: Spiral-1

With VS Code as primary host, proceed with:

### 1. WASI Tool Packaging
- Package existing tools as WASI modules
- Test execution in VS Code
- Verify context propagation

### 2. Performance Smoke Testing
- Target: 5k→10k events/sec
- Monitor via Prometheus
- Optimize based on Context Engine metrics

### 3. Enhanced Observability
- Add VS Code trace viewer panel
- Real-time context metrics
- Performance graphs

---

## Qoder Integration (Secondary Host)

The Qoder integration remains available at `qoder-integration/extension.json`:

```bash
# Register with Qoder
qoder ext add ./qoder-integration/extension.json

# Use Qoder commands
qoder run nurones.mcp.openDashboard
qoder run nurones.mcp.execTool --name fs.read
```

**Note:** VS Code is the primary development environment. Use Qoder for specialized scenarios or testing multi-host compatibility.

---

## Support

- **Issues**: GitHub Issues
- **Logs**: VS Code Output Channel → "Nurones MCP"
- **Status**: Click status bar item
- **Documentation**: `/vscode-extension/README.md`

---

**Status**: ✅ VS Code Extension Ready (Spiral-1)  
**Primary Host**: VS Code  
**Secondary Host**: Qoder  
**Next**: WASI Tool Packaging + Performance Testing
