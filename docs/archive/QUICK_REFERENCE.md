# Nurones MCP — Quick Reference Card

## 🚀 One-Minute Start (VS Code)

```bash
# 1. Build
cd mcp-core && cargo build --release

# 2. Install Extension
cd ../vscode-extension && npm install && npm run build

# 3. Open in VS Code
code --extensionDevelopmentPath=$(pwd) /path/to/workspace

# 4. Press Ctrl+Shift+P → "Nurones MCP: Show Status"
```

---

## 📋 Commands (Ctrl+Shift+P / Cmd+Shift+P)

| Command | Shortcut | Purpose |
|---------|----------|---------|
| **Open Dashboard** | — | Opens admin UI |
| **Execute Tool** | — | Run tool with context |
| **View Context Trace** | — | View trace by ID |
| **Toggle Context Engine** | — | ON/OFF switch |
| **Show Status** | — | Server status |

---

## 🎛️ Status Bar

| Display | Meaning |
|---------|---------|
| `✓ Nurones MCP [ON]` | Running, Context Engine enabled |
| `✓ Nurones MCP [OFF]` | Running, Context Engine disabled |
| `✗ Nurones MCP [Stopped]` | Server not running |

**Click status bar** → Quick status & controls

---

## ⚙️ Configuration (.vscode/settings.json)

```json
{
  "nuronesMcp.serverBinary": "${workspaceFolder}/mcp-core/target/release/nurones-mcp",
  "nuronesMcp.serverConfig": "${workspaceFolder}/.mcp/config.json",
  "nuronesMcp.autoStart": true,
  "nuronesMcp.contextEngine": true,
  "nuronesMcp.fsAllowlist": "${workspaceFolder},/tmp"
}
```

---

## 🔧 Troubleshooting

### Server won't start
```bash
# Check binary exists
ls -la mcp-core/target/release/nurones-mcp

# Rebuild
cd mcp-core && cargo build --release
```

### Extension not working
```bash
# Reload VS Code window
Ctrl+Shift+P → "Developer: Reload Window"

# Rebuild extension
cd vscode-extension && npm run build
```

### View logs
- **Output Channel**: View → Output → Select "Nurones MCP"
- **Command**: Ctrl+Shift+P → "Nurones MCP: Show Status" → "View Logs"

---

## 📊 Observability

| Service | URL | Purpose |
|---------|-----|---------|
| Admin UI | http://localhost:3000 | Dashboard |
| Prometheus | http://localhost:9090 | Metrics |
| Metrics Endpoint | http://localhost:9464/metrics | MCP metrics |
| OTel Collector | http://localhost:4318 | Traces |

**Start observability stack**:
```bash
docker-compose up -d
```

---

## 🛠️ Common Tasks

### Execute fs.read Tool
1. Ctrl+Shift+P → "Nurones MCP: Execute Tool"
2. Enter: `fs.read`
3. Enter: `{"path": "/workspace/README.md"}`
4. Check Output Channel for results

### Toggle Context Engine
1. Click status bar item
2. OR: Ctrl+Shift+P → "Nurones MCP: Toggle Context Engine"
3. Confirm restart when prompted

### View Context Trace
1. Note `reason_trace_id` from Output Channel
2. Ctrl+Shift+P → "Nurones MCP: View Context Trace"
3. Enter trace ID
4. View in terminal + OTel

---

## 📖 Documentation

| File | Purpose |
|------|---------|
| [VSCODE_EXTENSION.md](VSCODE_EXTENSION.md) | **Complete VS Code guide** |
| [SPIRAL_1_ROADMAP.md](SPIRAL_1_ROADMAP.md) | Next 3 weeks |
| [README.md](README.md) | Main overview |
| [BOOTSTRAP.md](BOOTSTRAP.md) | Initial setup |

---

## 🎯 Key Concepts

### ContextFrame
Every operation includes:
- `reason_trace_id`: Unique trace ID
- `tenant_id`: Isolation key
- `stage`: dev/staging/prod
- `risk_level`: 0/1/2 (safe/caution/block)
- `context_confidence`: 0.0-1.0

### Context Engine
- **ON**: Adaptive tuning (±10%/day)
- **OFF**: Deterministic mode

### Filesystem Allowlist
Only paths in allowlist accessible:
- Default: `${workspaceFolder},/tmp`
- Validates on server start
- Warns if workspace not included

---

## 🚨 Safety Features

✅ **Workspace validation** — Warns on non-workspace paths  
✅ **Log redaction** — Removes sensitive file paths  
✅ **Context integrity** — Validates before execution  
✅ **Risk levels** — Blocks autotune at risk_level=2  
✅ **Read-only flag** — Prevents writes when set

---

## 📞 Get Help

- **Logs**: Output Channel → "Nurones MCP"
- **Status**: Click status bar item
- **Issues**: GitHub Issues
- **Docs**: See [VSCODE_EXTENSION.md](VSCODE_EXTENSION.md)

---

**Version**: 0.5.0  
**Primary Host**: VS Code  
**Secondary Host**: Qoder
