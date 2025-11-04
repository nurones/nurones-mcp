# IDE Extensions Comparison

## Overview

Nurones MCP provides native extensions for both **VS Code** and **Qoder IDE**, enabling seamless integration of the Model Context Protocol runtime into your development workflow.

## Feature Matrix

| Feature | VS Code Extension | Qoder Extension | Notes |
|---------|------------------|-----------------|-------|
| **Server Management** | ✅ | ✅ | Start/stop/restart MCP server |
| **Auto-Start** | ✅ | ✅ | Configurable via settings |
| **Status Bar Integration** | ✅ | ✅ | Real-time server status |
| **Dashboard Access** | ✅ | ✅ | Opens admin web UI |
| **Tool Execution** | ✅ | ✅ | Execute tools with ContextFrame |
| **Trace Viewer** | ✅ | ✅ | View context traces by ID |
| **Context Engine Toggle** | ✅ | ✅ | Enable/disable adaptive tuning |
| **Output Channel** | ✅ | ✅ | Logs with PII redaction |
| **FS Allowlist Validation** | ✅ | ✅ | Security warnings |
| **ContextFrame Auto-Generation** | ✅ | ✅ | Trace ID prefixed by IDE type |

## Installation

### VS Code Extension

```bash
cd plugins/vscode
npm install
npm run build

# Option 1: Development mode
code --extensionDevelopmentPath=$(pwd)

# Option 2: Package and install
npm run pack
code --install-extension nurones-mcp-0.5.4.vsix
```

### Qoder Extension

```bash
cd plugins/qoder
npm install
npm run build

# Package for Qoder
npm run pack

# Install via Qoder Extension Manager
# Extensions > Install from VSIX > Select nurones-mcp-qoder-0.5.4.vsix
```

## Configuration

Both extensions use the same configuration schema:

```json
{
  "nuronesMcp.serverBinary": "${workspaceFolder}/mcp-core/target/release/nurones-mcp",
  "nuronesMcp.serverConfig": "${workspaceFolder}/.mcp/config.json",
  "nuronesMcp.adminWebUrl": "http://localhost:50550",
  "nuronesMcp.autoStart": true,
  "nuronesMcp.contextEngine": true,
  "nuronesMcp.fsAllowlist": "${workspaceFolder},/tmp"
}
```

**Default Differences:**
- VS Code: `adminWebUrl` defaults to `http://localhost:50550`
- Qoder: `adminWebUrl` defaults to `http://localhost:50550`

## Commands

Both extensions expose identical commands:

| Command | VS Code | Qoder | Description |
|---------|---------|-------|-------------|
| `nurones.mcp.openDashboard` | ✅ | ✅ | Opens admin web UI |
| `nurones.mcp.execTool` | ✅ | ✅ | Execute a tool with args |
| `nurones.mcp.viewTrace` | ✅ | ✅ | View trace by ID |
| `nurones.mcp.toggleContextEngine` | ✅ | ✅ | Toggle adaptive tuning |
| `nurones.mcp.showStatus` | ✅ | ✅ | Display server status |

## ContextFrame Generation

### VS Code
```typescript
{
  reason_trace_id: "vscode-1730672000-abc123",
  tenant_id: "default",
  stage: "dev",
  risk_level: 0,
  context_confidence: 0.7,
  ts: "2025-11-03T22:40:00.000Z"
}
```

### Qoder
```typescript
{
  reason_trace_id: "qoder-1730672000-xyz789",
  tenant_id: "default",
  stage: "dev",
  risk_level: 0,
  context_confidence: 0.7,
  ts: "2025-11-03T22:40:00.000Z"
}
```

**Key Difference:** Trace ID prefix (`vscode-` vs `qoder-`) for origin tracking.

## Status Bar Display

### VS Code
- `$(check) Nurones MCP [ON]` - Running with Context Engine
- `$(check) Nurones MCP [OFF]` - Running without Context Engine
- `$(x) Nurones MCP [Stopped]` - Server not running

### Qoder
- `✓ Nurones MCP [ON]` - Running with Context Engine
- `✓ Nurones MCP [OFF]` - Running without Context Engine
- `✗ Nurones MCP [Stopped]` - Server not running

## API Differences

### VS Code Extension
- Uses official `vscode` module
- Full TypeScript type support via `@types/vscode`
- Packaging via `@vscode/vsce`

### Qoder Extension
- Uses Qoder's extension API (VS Code-compatible subset)
- Custom type definitions for Qoder API
- Packaging via `qoder-pack` (or generic packaging)

## When to Use Which?

### Use VS Code Extension When:
- ✅ You primarily develop in VS Code
- ✅ You need the most mature IDE integration
- ✅ You're already familiar with VS Code ecosystem

### Use Qoder Extension When:
- ✅ You prefer AI-native IDE features
- ✅ You're working in Qoder IDE environment
- ✅ You want a modern, AI-focused development experience

### Use Both When:
- ✅ You switch between IDEs
- ✅ Your team uses different editors
- ✅ You want to compare IDE experiences

## Running Both Simultaneously

**Possible:** Yes. Use the unified Admin Web UI at `http://localhost:50550` in both IDEs.

**.vscode/settings.json** (VS Code):
```json
{
  "nuronesMcp.adminWebUrl": "http://localhost:50550"
}
```

**.qoder/settings.json** (Qoder):
```json
{
  "nuronesMcp.adminWebUrl": "http://localhost:50550"
}
```

## Development

### VS Code Extension Development
```bash
cd plugins/vscode
npm run watch  # Watch mode
code --extensionDevelopmentPath=$(pwd)  # Test
```

### Qoder Extension Development
```bash
cd plugins/qoder
npm run watch  # Watch mode
# Use Qoder's extension development host
```

## Support & Issues

- **Documentation:** See individual extension READMEs
- **Issues:** https://github.com/nurones/nurones-mcp/issues
- **Template:** Use `extensions/template/` for new IDE integrations

## License

Both extensions are MIT licensed (see root LICENSE file).
