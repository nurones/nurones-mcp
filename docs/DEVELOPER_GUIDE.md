# Nurones MCP Developer Guide

**Version:** 0.5.0  
**Last Updated:** November 6, 2025

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture Overview](#architecture-overview)
3. [Quick Start](#quick-start)
4. [Configuration](#configuration)
5. [API Reference](#api-reference)
6. [Extension Development](#extension-development)
7. [Plugin Development](#plugin-development)
8. [Deployment](#deployment)
9. [Troubleshooting](#troubleshooting)

---

## 1. Introduction

Nurones MCP is a self-adaptive Model Context Protocol runtime that provides:
- **20+ Built-in Tools** (fs.*, db.*, http.*, ai.*, process.*, env.*, scraping, compression)
- **Extension System** for server-side tool development (TypeScript/Node.js, WASI)
- **Plugin System** for IDE integrations (VS Code, Qoder, Custom)
- **Admin Web UI** for complete visual management
- **Context Engine** with autotune capabilities
- **Observability** via Prometheus + OpenTelemetry

### Key Features
✅ Multi-transport support (stdio, WebSocket, HTTP)  
✅ Security policies with FS allowlisting  
✅ Tool execution with context-aware governance  
✅ Real-time health monitoring  
✅ IDE plugin scaffolding (VS Code, Qoder)  
✅ Web scraping extensions (scrape.url, scrape.site, parse.html, extract.links)  
✅ Session compression with LLM tiers  

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Admin Web UI                        │
│           (http://localhost:50550)                      │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐   │
│  │Dash  │Tools │Plugs │Exts  │Conns │Setti │Health│   │
│  └──────┴──────┴──────┴──────┴──────┴──────┴──────┘   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP/JSON API
┌──────────────────────┴──────────────────────────────────┐
│              MCP Core (Rust/Axum)                       │
│  ┌──────────────┬──────────────┬────────────────────┐  │
│  │ Tool Exec    │ Policy Eng   │ Context Engine     │  │
│  │ (WASI+Native)│ (Security)   │ (Autotune)         │  │
│  └──────────────┴──────────────┴────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Virtual Connector (Transports)           │  │
│  │         stdio | ws | http                        │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                    │                   │
    ┌────┴────┐         ┌─────┴─────┐      ┌─────┴────┐
    │ VS Code │         │   Qoder   │      │ Custom   │
    │ Plugin  │         │  Plugin   │      │  Client  │
    └─────────┘         └───────────┘      └──────────┘
```

### Components

- **mcp-core/** - Rust server with Axum framework
- **admin-web/** - Next.js static export admin UI
- **extensions/** - Server-side tools (Node.js/WASI)
- **plugins/** - IDE integration code (TypeScript)
- **sdk-node/** - TypeScript SDK for client development
- **.mcp/** - Runtime configuration and tool manifests

---

## 3. Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)
- Rust nightly (for core development)

### Run with Docker (Recommended)
```bash
docker compose up -d
```

Access:
- **Admin Web**: http://localhost:50550
- **API**: http://localhost:50550/api/*
- **Metrics**: http://localhost:50550/metrics
- **Prometheus**: http://localhost:9090

### Run Locally (Development)
```bash
# Terminal 1: Start MCP Core
cd mcp-core
cargo run

# Terminal 2: Start Admin Web
cd admin-web
PORT=50550 npm run dev
```

### First Steps
1. Open http://localhost:50550
2. Navigate to **Tools** tab → See all 20 tools
3. Try **Test Tools** → Execute `scrape.url` with `{"url": "https://example.com"}`
4. Create a plugin: **Plugins** tab → **Create New Plugin**
5. Create an extension: **Extensions** tab → **Create New Extension**

---

## 4. Configuration

### Main Config: `.mcp/config.json`
```json
{
  "profile": "dev",
  "server": {
    "port": 50550
  },
  "transports": ["stdio", "ws"],
  "observability": {
    "otel_exporter": "http://localhost:4318"
  },
  "context_engine": {
    "enabled": true,
    "change_cap_pct_per_day": 10,
    "min_confidence": 0.6
  }
}
```

### Policies: `.mcp/policies.json`
```json
{
  "fs_allowlist": ["/workspace", "/tmp"],
  "max_tool_execution_time_ms": 30000,
  "require_reason_trace_id": true
}
```

### Environment Variables
- `RUST_LOG` - Logging level (info, debug, trace)
- `FS_ALLOWLIST` - Filesystem access paths
- `DATABASE_URL` - For db.* tools
- `OPENAI_API_KEY` - For AI tools

---

## 5. API Reference

### Base URL: `http://localhost:50550/api`

#### Status & Health
```http
GET /api/health          # Simple health check
GET /api/status          # Full system status
GET /api/metrics         # Prometheus metrics
```

#### Tools Management
```http
GET    /api/tools                    # List all tools
POST   /api/tools                    # Create tool
GET    /api/tools/:name              # Get tool details
PATCH  /api/tools/:name              # Toggle enable/disable
PUT    /api/tools/:name              # Update tool
DELETE /api/tools/:name              # Delete tool
POST   /api/tools/execute            # Execute a tool
```

**Execute Tool Example:**
```bash
curl -X POST http://localhost:50550/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "scrape.url",
    "input": {"url": "https://example.com"},
    "context": {
      "reason_trace_id": "demo-001",
      "tenant_id": "default",
      "stage": "dev",
      "risk_level": 0,
      "ts": "2025-11-06T00:00:00Z"
    }
  }'
```

#### Plugins & Extensions
```http
GET  /api/plugins                # List IDE plugins
POST /api/plugins/create         # Create new plugin
GET  /api/extensions             # List extensions
POST /api/extensions/create      # Create new extension
```

#### Connectors
```http
GET  /api/connectors                           # List connectors
GET  /api/connector/virtual/health             # Virtual connector health
POST /api/connector/virtual/connect            # Connect
POST /api/connector/virtual/disconnect         # Disconnect
```

#### Settings
```http
GET /api/settings/server         # Get server settings
PUT /api/settings/server         # Update server settings
```

#### Policies
```http
GET  /api/policies               # Get current policies
POST /api/policies               # Update policies
```

#### Context Engine
```http
POST /api/context-engine         # Toggle context engine
```

---

## 6. Extension Development

Extensions are server-side tools written in TypeScript or compiled to WASI.

### Create Extension via Admin Web
1. Go to **Extensions** tab
2. Click **Create New Extension**
3. Fill in:
   - Name: `my-tool`
   - Description: What it does
   - Version: `1.0.0`
   - Permissions: `["network", "read"]`
4. Click **Create Extension**
5. Code appears in `extensions/my-tool/`

### Extension Structure
```
extensions/my-tool/
├── src/
│   └── index.ts          # Main entry point
├── dist/
│   └── index.js          # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

### Example Extension (`extensions/web-scraper/src/index.ts`)
```typescript
export async function executeTool(toolName: string, input: any) {
  switch (toolName) {
    case 'scrape.url':
      return await scrapeUrl(input)
    default:
      return { success: false, error: `Unknown tool: ${toolName}` }
  }
}

async function scrapeUrl(input: { url: string }) {
  const response = await fetch(input.url)
  const html = await response.text()
  return {
    success: true,
    data: { html, length: html.length }
  }
}
```

### Build & Register
```bash
cd extensions/my-tool
npm install
npm run build

# Register in .mcp/tools/my-tool.json
{
  "name": "my.tool",
  "version": "1.0.0",
  "entry": "nodejs://extensions/my-tool/dist/index.js",
  "permissions": ["network", "read"],
  "description": "My custom tool"
}

# Restart MCP server
docker compose restart core
```

### Tool Manifest Schema
```json
{
  "name": "string",              // Tool identifier (e.g., "scrape.url")
  "version": "string",           // Semantic version
  "entry": "string",             // nodejs://, wasm://, or native://
  "permissions": ["string"],     // read, write, network, execute, etc.
  "description": "string",
  "inputSchema": {               // JSON Schema for input validation
    "type": "object",
    "properties": {...},
    "required": [...]
  }
}
```

---

## 7. Plugin Development

Plugins are IDE integrations that connect to the MCP server.

### Create Plugin via Admin Web
1. Go to **Plugins** tab
2. Click **Create New Plugin**
3. Select IDE: VS Code, Qoder, or Custom
4. Fill in details
5. Code appears in `plugins/my-plugin/`

### Plugin Structure
```
plugins/vscode/
├── src/
│   └── extension.ts       # IDE extension entry
├── package.json
├── tsconfig.json
└── README.md
```

### VS Code Plugin Example
```typescript
import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand('mcp.connect', async () => {
    // Connect to MCP server
    const ws = new WebSocket('ws://localhost:50550')
    ws.on('open', () => {
      vscode.window.showInformationMessage('Connected to MCP')
    })
  })
  context.subscriptions.push(command)
}
```

### Build & Install
```bash
cd plugins/vscode
npm install
npm run build

# For VS Code
code --install-extension ./vscode-mcp-1.0.0.vsix

# For Qoder
# Copy to Qoder extensions directory
```

---

## 8. Deployment

### Docker Production Deployment
```bash
# Build image
docker compose build

# Run with restart policy
docker compose up -d

# Check logs
docker logs nurones-mcp-core

# Update
git pull origin main
docker compose down
docker compose build
docker compose up -d
```

### Environment Configuration
```bash
# .env file
RUST_LOG=info
FS_ALLOWLIST=/workspace,/tmp,/data
DATABASE_URL=sqlite:///data/mcp.db
OPENAI_API_KEY=sk-...
```

### Health Checks
- **Liveness**: `GET /api/health` (returns "OK")
- **Readiness**: `GET /api/status` (returns full status JSON)

### Monitoring
- **Prometheus**: http://localhost:9090
- **Metrics Endpoint**: http://localhost:50550/metrics
- **Health Status Bar**: Bottom of Admin Web UI

---

## 9. Troubleshooting

### Common Issues

#### Tools Not Showing in Admin Web
1. Check logs: `docker logs nurones-mcp-core`
2. Verify manifest: `cat .mcp/tools/my-tool.json`
3. Restart server: `docker compose restart core`
4. Hard refresh browser: Ctrl+Shift+R

#### Extension Not Executing
1. Check extension build: `ls extensions/my-tool/dist/`
2. Verify Node.js in container: `docker exec nurones-mcp-core node --version`
3. Check tool registration: `curl http://localhost:50550/api/tools | grep my-tool`
4. Review logs for errors

#### Database Tools Failing
```bash
# Set DATABASE_URL environment variable
docker compose down
echo "DATABASE_URL=sqlite:///workspace/mcp.db" >> .env
docker compose up -d
```

#### AI Tools Not Working
```bash
# Set OPENAI_API_KEY
docker compose down
echo "OPENAI_API_KEY=sk-your-key" >> .env
docker compose up -d
```

#### Filesystem Permission Denied
1. Check allowlist: `cat .mcp/policies.json`
2. Add path to `fs_allowlist`
3. Restart server

### Debug Mode
```bash
RUST_LOG=debug docker compose up
```

### Reset Everything
```bash
docker compose down
rm -rf admin-web/out admin-web/.next
docker compose build --no-cache
docker compose up -d
```

---

## Appendix A: Tool Categories

### Filesystem Tools (WASI)
- `fs.read` - Read file contents
- `fs.write` - Write file contents
- `fs.list` - List directory
- `fs.delete` - Delete file/directory
- `fs.search` - Search files by pattern

### Database Tools (Native)
- `db.query` - Execute SELECT query
- `db.execute` - Execute INSERT/UPDATE/DELETE
- `db.schema` - Get database schema

### HTTP/Network Tools (Native)
- `http.request` - HTTP request with full control
- `fetch.url` - Simple URL fetch

### Web Scraping Tools (Extension)
- `scrape.url` - Scrape single URL with selectors
- `scrape.site` - Crawl entire website
- `parse.html` - Parse HTML with CSS selectors
- `extract.links` - Extract links from page

### AI Tools (Native)
- `embedding.generate` - Generate embeddings
- `completion.stream` - Stream completions

### System Tools (Native)
- `process.execute` - Execute shell command
- `env.get` - Get environment variable
- `telemetry.push` - Push telemetry event

### Session Tools (Extension)
- `session.compress` - Compress conversation sessions

---

## Appendix B: Admin Web Features

All backend features are fully manageable from Admin Web:

✅ **Dashboard** - System overview, metrics, IDE connections  
✅ **Tools** - View all 20 tools, toggle, test execution  
✅ **Plugins** - Create/manage IDE plugins  
✅ **Extensions** - Create/manage server extensions  
✅ **Connectors** - Connect/disconnect, view transports  
✅ **Settings** - Configure server port, transports, observability  
✅ **Test Tools** - Execute any tool with custom input  
✅ **Policies** - Manage security policies, FS allowlist  
✅ **Telemetry** - View Prometheus metrics  
✅ **Context Monitor** - Monitor context engine state  
✅ **Health Status Bar** - Real-time service health at bottom  

---

## Support & Resources

- **GitHub**: https://github.com/nurones/nurones-mcp
- **Issues**: https://github.com/nurones/nurones-mcp/issues
- **License**: MIT

---

**Built with ❤️ by Nurones**  
*Self-adaptive Model Context Protocol for the AI age*
