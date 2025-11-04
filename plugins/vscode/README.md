# VS Code Extension Development

## Build & Test

```bash
cd plugins/vscode

# Install dependencies
npm install

# Build
npm run build

# Package extension
npm run pack

# Development mode (watch)
npm run watch
```

## Testing in VS Code

### Option 1: Extension Development Host
```bash
cd plugins/vscode
npm install
npm run build
code --extensionDevelopmentPath=$(pwd)
```

### Option 2: Install .vsix
```bash
npm run pack
code --install-extension nurones-mcp-0.5.0.vsix
```

## Configuration

Add to your workspace `.vscode/settings.json`:

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

## Usage

1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Type "Nurones MCP"
3. Available commands:
   - **Open Dashboard** - Opens admin web UI
   - **Execute Tool** - Run a tool with context
   - **View Context Trace** - View trace by ID
   - **Toggle Context Engine** - Enable/disable adaptive tuning
   - **Show Status** - Display server status

## Status Bar

Click the status bar item to view server status:
- `✓ Nurones MCP [ON]` - Running with Context Engine enabled
- `✓ Nurones MCP [OFF]` - Running with Context Engine disabled
- `✗ Nurones MCP [Stopped]` - Server not running

## Notes

- Dependencies will be installed after running `npm install`
- TypeScript errors in the editor are expected before installation
- The extension will auto-start the MCP server if `autoStart` is enabled
