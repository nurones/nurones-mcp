import * as vscode from "vscode";
import { spawn, ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

let mcpProcess: ChildProcess | null = null;
let statusBarItem: vscode.StatusBarItem;
let contextEngineEnabled = true;
let outputChannel: vscode.OutputChannel;
let connectionId: string | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

/**
 * Register this VS Code instance with the MCP server
 */
async function registerConnection(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("nuronesMcp");
  const adminWebUrl = cfg.get<string>("adminWebUrl") ?? "http://localhost:4050";
  const apiUrl = adminWebUrl; // Same port now - unified server
  
  connectionId = `vscode-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const response = await fetch(`${apiUrl}/api/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: connectionId,
        type: 'vscode'
      })
    });
    
    if (response.ok) {
      outputChannel.appendLine(`✅ Registered with MCP server: ${connectionId}`);
      
      // Start heartbeat (every 30 seconds)
      heartbeatInterval = setInterval(async () => {
        try {
          await fetch(`${apiUrl}/api/connections/${connectionId}/heartbeat`, {
            method: 'POST'
          });
        } catch (err) {
          outputChannel.appendLine(`Heartbeat failed: ${err}`);
        }
      }, 30000);
    } else {
      outputChannel.appendLine(`⚠️ Failed to register: ${response.statusText}`);
    }
  } catch (err) {
    outputChannel.appendLine(`⚠️ Could not connect to MCP API: ${err}`);
  }
}

/**
 * Unregister this VS Code instance from the MCP server
 */
async function unregisterConnection(): Promise<void> {
  if (!connectionId) return;
  
  const cfg = vscode.workspace.getConfiguration("nuronesMcp");
  const adminWebUrl = cfg.get<string>("adminWebUrl") ?? "http://localhost:4050";
  const apiUrl = adminWebUrl; // Same port - unified server
  
  try {
    await fetch(`${apiUrl}/api/connections/${connectionId}`, {
      method: 'DELETE'
    });
    outputChannel.appendLine(`✅ Unregistered from MCP server: ${connectionId}`);
  } catch (err) {
    outputChannel.appendLine(`⚠️ Failed to unregister: ${err}`);
  }
  
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  
  connectionId = null;
}

/**
 * Create default ContextFrame for VS Code operations
 */
function createDefaultContext(): any {
  return {
    reason_trace_id: `vscode-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tenant_id: "default",
    stage: "dev",
    risk_level: 0,
    context_confidence: 0.7,
    ts: new Date().toISOString(),
  };
}

/**
 * Resolve workspace-relative path variables
 */
function resolvePath(configPath: string, workspaceFolder?: vscode.WorkspaceFolder): string {
  if (!workspaceFolder) {
    return configPath;
  }
  return configPath.replace(/\$\{workspaceFolder\}/g, workspaceFolder.uri.fsPath);
}

/**
 * Validate filesystem allowlist against workspace
 */
function validateFsAllowlist(allowlist: string, workspaceFolder?: vscode.WorkspaceFolder): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const paths = allowlist.split(',').map(p => p.trim());
  
  if (workspaceFolder) {
    const workspacePath = workspaceFolder.uri.fsPath;
    const hasWorkspace = paths.some(p => {
      const resolved = resolvePath(p, workspaceFolder);
      return resolved.startsWith(workspacePath);
    });
    
    if (!hasWorkspace) {
      warnings.push(`⚠️ Allowlist does not include workspace folder: ${workspacePath}`);
    }
    
    paths.forEach(p => {
      const resolved = resolvePath(p, workspaceFolder);
      if (!resolved.startsWith(workspacePath) && !resolved.startsWith('/tmp')) {
        warnings.push(`⚠️ Path outside workspace: ${resolved}`);
      }
    });
  }
  
  return { valid: warnings.length === 0, warnings };
}

/**
 * Start MCP server process
 */
async function startMcpServer(context: vscode.ExtensionContext): Promise<boolean> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder open. Please open a folder first.");
    return false;
  }

  const cfg = vscode.workspace.getConfiguration("nuronesMcp");
  const serverBinary = resolvePath(cfg.get<string>("serverBinary") ?? "../mcp-core/target/release/nurones-mcp", workspaceFolder);
  const serverConfig = resolvePath(cfg.get<string>("serverConfig") ?? "../.mcp/config.json", workspaceFolder);
  const fsAllowlist = resolvePath(cfg.get<string>("fsAllowlist") ?? "${workspaceFolder},/tmp", workspaceFolder);
  contextEngineEnabled = cfg.get<boolean>("contextEngine") ?? true;

  // Validate binary exists
  if (!fs.existsSync(serverBinary)) {
    vscode.window.showErrorMessage(`MCP server binary not found: ${serverBinary}. Please build mcp-core first.`);
    return false;
  }

  // Validate config exists
  if (!fs.existsSync(serverConfig)) {
    vscode.window.showErrorMessage(`MCP server config not found: ${serverConfig}`);
    return false;
  }

  // Validate filesystem allowlist
  const { valid, warnings } = validateFsAllowlist(fsAllowlist, workspaceFolder);
  if (!valid) {
    warnings.forEach(w => outputChannel.appendLine(w));
    const proceed = await vscode.window.showWarningMessage(
      "Filesystem allowlist has warnings. Proceed?",
      "Yes", "No"
    );
    if (proceed !== "Yes") {
      return false;
    }
  }

  // Set environment variables
  const env = {
    ...process.env,
    CONTEXT_ENGINE: contextEngineEnabled ? "on" : "off",
    FS_ALLOWLIST: fsAllowlist,
  };

  outputChannel.appendLine(`Starting MCP server: ${serverBinary}`);
  outputChannel.appendLine(`Config: ${serverConfig}`);
  outputChannel.appendLine(`Context Engine: ${contextEngineEnabled ? "ENABLED" : "DISABLED"}`);
  outputChannel.appendLine(`FS Allowlist: ${fsAllowlist}`);

  try {
    mcpProcess = spawn(serverBinary, ["--config", serverConfig], {
      cwd: workspaceFolder.uri.fsPath,
      stdio: "pipe",
      env,
    });

    mcpProcess.stdout?.on("data", (data) => {
      const output = data.toString();
      outputChannel.appendLine(`[stdout] ${output}`);
      
      // Parse for context trace IDs
      const traceMatch = output.match(/reason_trace_id[:\s]+([^\s,}]+)/);
      if (traceMatch) {
        outputChannel.appendLine(`🔍 Context Trace: ${traceMatch[1]}`);
      }
    });

    mcpProcess.stderr?.on("data", (data) => {
      const output = data.toString();
      // Redact potential PII file paths outside allowlist
      const redacted = output.replace(/\/[^\s]+\/[^\s]+/g, (match: string) => {
        const allowedPaths = fsAllowlist.split(',').map(p => p.trim());
        if (allowedPaths.some(ap => match.startsWith(ap))) {
          return match;
        }
        return "[REDACTED_PATH]";
      });
      outputChannel.appendLine(`[stderr] ${redacted}`);
    });

    mcpProcess.on("exit", (code) => {
      outputChannel.appendLine(`MCP server exited with code ${code}`);
      updateStatusBar(false);
      mcpProcess = null;
    });

    mcpProcess.on("error", (err) => {
      outputChannel.appendLine(`MCP server error: ${err.message}`);
      vscode.window.showErrorMessage(`MCP server failed: ${err.message}`);
      updateStatusBar(false);
    });

    updateStatusBar(true);
    vscode.window.showInformationMessage("Nurones MCP server started");
    return true;
  } catch (error) {
    outputChannel.appendLine(`Failed to start server: ${error}`);
    vscode.window.showErrorMessage(`Failed to start MCP server: ${error}`);
    return false;
  }
}

/**
 * Stop MCP server process
 */
function stopMcpServer(): void {
  if (mcpProcess) {
    outputChannel.appendLine("Stopping MCP server...");
    mcpProcess.kill();
    mcpProcess = null;
    updateStatusBar(false);
  }
}

/**
 * Update status bar item
 */
function updateStatusBar(running: boolean): void {
  if (running) {
    statusBarItem.text = `$(check) Nurones MCP [${contextEngineEnabled ? "ON" : "OFF"}]`;
    statusBarItem.tooltip = `MCP Server Running\nContext Engine: ${contextEngineEnabled ? "ENABLED" : "DISABLED"}`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = "$(x) Nurones MCP [Stopped]";
    statusBarItem.tooltip = "MCP Server Stopped";
    statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
  }
}

/**
 * Activate extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("Nurones MCP");
  outputChannel.appendLine("Nurones MCP extension activated");

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "nurones.mcp.showStatus";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  updateStatusBar(false);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("nurones.mcp.openDashboard", async () => {
      const cfg = vscode.workspace.getConfiguration("nuronesMcp");
      const url = cfg.get<string>("adminWebUrl") ?? "http://localhost:3000";
      outputChannel.appendLine(`Opening dashboard: ${url}`);
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }),

    vscode.commands.registerCommand("nurones.mcp.execTool", async () => {
      if (!mcpProcess) {
        vscode.window.showWarningMessage("MCP server not running. Start it first.");
        return;
      }

      const toolName = await vscode.window.showInputBox({
        prompt: "Tool name (e.g., fs.read, fs.write, telemetry.push)",
        placeHolder: "fs.read",
      });

      if (!toolName) return;

      const argsInput = await vscode.window.showInputBox({
        prompt: "Arguments (JSON)",
        placeHolder: '{"path": "/workspace/README.md"}',
      });

      const args = argsInput ? JSON.parse(argsInput) : {};
      const ctx = createDefaultContext();

      const message = JSON.stringify({
        op: "exec",
        tool: toolName,
        args,
        context: ctx,
      });

      outputChannel.appendLine(`Executing tool: ${toolName}`);
      outputChannel.appendLine(`Context: ${ctx.reason_trace_id}`);
      mcpProcess.stdin?.write(message + "\n");

      vscode.window.showInformationMessage(`Sent tool execution: ${toolName} [${ctx.reason_trace_id}]`);
    }),

    vscode.commands.registerCommand("nurones.mcp.viewTrace", async () => {
      const traceId = await vscode.window.showInputBox({
        prompt: "Enter reason_trace_id to view",
        placeHolder: "vscode-1234567890-abc",
      });

      if (!traceId) return;

      outputChannel.appendLine(`Viewing trace: ${traceId}`);
      outputChannel.show();

      const terminal = vscode.window.createTerminal({
        name: `Nurones Trace: ${traceId}`,
        message: `Viewing context trace: ${traceId}\n\nCheck OTel Collector or Prometheus for full trace data.`,
      });
      terminal.show();
    }),

    vscode.commands.registerCommand("nurones.mcp.toggleContextEngine", async () => {
      contextEngineEnabled = !contextEngineEnabled;
      
      const cfg = vscode.workspace.getConfiguration("nuronesMcp");
      await cfg.update("contextEngine", contextEngineEnabled, vscode.ConfigurationTarget.Workspace);

      outputChannel.appendLine(`Context Engine toggled: ${contextEngineEnabled ? "ON" : "OFF"}`);

      if (mcpProcess) {
        vscode.window.showInformationMessage(
          `Context Engine ${contextEngineEnabled ? "enabled" : "disabled"}. Restart server to apply.`,
          "Restart Now"
        ).then(async (choice) => {
          if (choice === "Restart Now") {
            stopMcpServer();
            await startMcpServer(context);
          }
        });
      }

      updateStatusBar(!!mcpProcess);
    }),

    vscode.commands.registerCommand("nurones.mcp.showStatus", async () => {
      const running = !!mcpProcess;
      const status = [
        `**Nurones MCP Server Status**`,
        ``,
        `Status: ${running ? "✅ Running" : "❌ Stopped"}`,
        `Context Engine: ${contextEngineEnabled ? "✅ Enabled" : "❌ Disabled"}`,
        ``,
        `Available Commands:`,
        `- Open Dashboard`,
        `- Execute Tool`,
        `- View Context Trace`,
        `- Toggle Context Engine`,
      ].join("\n");

      const action = await vscode.window.showInformationMessage(
        status,
        running ? "Stop Server" : "Start Server",
        "Open Dashboard",
        "View Logs"
      );

      if (action === "Start Server" && !running) {
        await startMcpServer(context);
      } else if (action === "Stop Server" && running) {
        stopMcpServer();
      } else if (action === "Open Dashboard") {
        vscode.commands.executeCommand("nurones.mcp.openDashboard");
      } else if (action === "View Logs") {
        outputChannel.show();
      }
    })
  );

  // Auto-start if configured
  const cfg = vscode.workspace.getConfiguration("nuronesMcp");
  if (cfg.get<boolean>("autoStart")) {
    await startMcpServer(context);
  }

  // Register with MCP server
  await registerConnection();

  outputChannel.appendLine("Nurones MCP extension ready");
}

/**
 * Deactivate extension
 */
export function deactivate(): void {
  // Unregister from MCP server
  unregisterConnection();
  stopMcpServer();
  outputChannel.appendLine("Nurones MCP extension deactivated");
}
