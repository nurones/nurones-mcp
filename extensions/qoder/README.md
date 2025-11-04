# Nurones MCP Extension for Qoder IDE

This extension brings the self-adaptive Model Context Protocol (MCP) runtime to Qoder IDE.

## Features

- **MCP Server Management** - Start, stop, and monitor the Nurones MCP server directly from Qoder
- **Context-Aware Tool Execution** - Execute tools with automatic ContextFrame propagation
- **Context Engine Toggle** - Enable/disable adaptive tuning on the fly
- **Dashboard Integration** - Quick access to the admin web UI
- **Trace Viewer** - View context traces by ID
- **Status Bar Integration** - Real-time server status display

## Installation

### From Source

```bash
cd extensions/qoder
npm install
npm run build
```

### Using Qoder Extension Manager

1. Package the extension: `npm run pack`
2. Install in Qoder: Extensions > Install from VSIX > Select `nurones-mcp-qoder-0.5.0.vsix`

## Configuration

Add to your workspace settings (`.qoder/settings.json` or equivalent):

```json
{
  "nuronesMcp.serverBinary": "${workspaceFolder}/mcp-core/target/release/nurones-mcp",
  "nuronesMcp.serverConfig": "${workspaceFolder}/.mcp/config.json",
  "nuronesMcp.adminWebUrl": "http://localhost:3001",
  "nuronesMcp.autoStart": true,
  "nuronesMcp.contextEngine": true,
  "nuronesMcp.fsAllowlist": "${workspaceFolder},/tmp"
}
```

## Available Commands

Open Qoder Command Palette and search for "Nurones MCP":

- **Nurones MCP: Open Dashboard** - Opens the admin web UI in your browser
- **Nurones MCP: Execute Tool** - Execute a tool with custom arguments
- **Nurones MCP: View Context Trace** - View trace details by trace ID
- **Nurones MCP: Toggle Context Engine** - Enable/disable adaptive tuning
- **Nurones MCP: Show Status** - Display server status and quick actions

## Status Bar

Click the status bar item in the bottom-right to view server status:

- `✓ Nurones MCP [ON]` - Server running with Context Engine enabled
- `✓ Nurones MCP [OFF]` - Server running with Context Engine disabled  
- `✗ Nurones MCP [Stopped]` - Server not running

## Usage Example

### 1. Start the Server

The server auto-starts by default. To manually start:

1. Open Command Palette
2. Run "Nurones MCP: Show Status"
3. Click "Start Server"

### 2. Execute a Tool

```bash
Command: Nurones MCP: Execute Tool
Tool Name: fs.read
Arguments: {"path": "/workspace/README.md"}
```

The extension automatically creates a ContextFrame with:
- `reason_trace_id`: `qoder-<timestamp>-<random>`
- `tenant_id`: `"default"`
- `stage`: `"dev"`
- `risk_level`: `0`
- `context_confidence`: `0.7`

### 3. View Traces

```bash
Command: Nurones MCP: View Context Trace
Trace ID: qoder-1234567890-abc123
```

Check the output channel for trace details, or view in Prometheus/OTel Collector.

## Prerequisites

1. **Build MCP Core:**
   ```bash
   cd mcp-core
   cargo build --release
   ```

2. **Configure MCP Server:**
   - Ensure `.mcp/config.json` exists in your workspace
   - Verify transports include "stdio" or "ws"

3. **Start Admin Web (Optional):**
   ```bash
   cd admin-web
   npm install
   npm run dev
   ```

## Security Features

- **Filesystem Allowlist Validation** - Warns if paths are outside workspace
- **PII Redaction** - Automatically redacts file paths outside allowlist in logs
- **Context Propagation** - All operations include ContextFrame for traceability

## Troubleshooting

### Server won't start

- Check that `mcp-core/target/release/nurones-mcp` exists
- Verify `.mcp/config.json` is valid JSON
- View logs in Output Channel: "Nurones MCP"

### Commands not appearing

- Restart Qoder IDE
- Check extension is activated (status bar shows)
- Verify `package.json` is properly configured

### Dashboard won't open

- Ensure admin-web is running on the configured port (default: 3001)
- Check `nuronesMcp.adminWebUrl` setting
- Try manual URL: `http://localhost:3001`

## Differences from VS Code Extension

This extension is designed specifically for Qoder IDE with the following adaptations:

- Uses Qoder's extension API (compatible where possible with VS Code)
- Default admin web URL is `3001` (to avoid conflicts with VS Code on `3000`)
- Trace IDs prefixed with `qoder-` instead of `vscode-`
- Configuration updates may differ based on Qoder's settings API

## Development

```bash
# Watch mode for development
npm run watch

# Build for production
npm run build

# Package extension
npm run pack
```

## License

See root LICENSE file.

## Support

- GitHub Issues: https://github.com/nurones/nurones-mcp
- Documentation: See `docs/` directory in repository root
