import { spawn, ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

// Qoder API interfaces (compatible with VS Code API where possible)
interface QoderExtensionContext {
  subscriptions: Array<{ dispose(): void }>;
  workspaceFolder?: QoderWorkspaceFolder;
}

interface QoderWorkspaceFolder {
  uri: { fsPath: string };
  name: string;
}

interface QoderStatusBarItem {
  text: string;
  tooltip?: string;
  backgroundColor?: string;
  command?: string;
  show(): void;
  hide(): void;
  dispose(): void;
}

interface QoderOutputChannel {
  appendLine(value: string): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

// Qoder global API (injected at runtime)
declare const qoder: {
  workspace: {
    getConfiguration(section: string): any;
    workspaceFolders?: QoderWorkspaceFolder[];
  };
  window: {
    createStatusBarItem(alignment: string, priority: number): QoderStatusBarItem;
    createOutputChannel(name: string): QoderOutputChannel;
    showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
    showWarningMessage(message: string, ...items: string[]): Promise<string | undefined>;
    showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>;
    showInputBox(options: { prompt?: string; placeHolder?: string }): Promise<string | undefined>;
    createTerminal(options: { name: string; message?: string }): QoderTerminal;
  };
  commands: {
    registerCommand(command: string, callback: (...args: any[]) => any): { dispose(): void };
    executeCommand(command: string, ...args: any[]): Promise<any>;
  };
  env: {
    openExternal(url: string): Promise<boolean>;
  };
};

interface QoderTerminal {
  show(): void;
  dispose(): void;
}

let mcpProcess: ChildProcess | null = null;
let statusBarItem: QoderStatusBarItem;
let contextEngineEnabled = true;
let outputChannel: QoderOutputChannel;
let connectionId: string | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

/**
 * Register this Qoder instance with the MCP server
 */
async function registerConnection(): Promise<void> {
  const cfg = qoder.workspace.getConfiguration("nuronesMcp");
  const adminWebUrl = cfg.get("adminWebUrl") ?? "http://localhost:4050";
  const apiUrl = adminWebUrl.replace(':4050', ':4055'); // MCP API is on 4055
  
  connectionId = `qoder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const response = await fetch(`${apiUrl}/api/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: connectionId,
        type: 'qoder'
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
 * Unregister this Qoder instance from the MCP server
 */
async function unregisterConnection(): Promise<void> {
  if (!connectionId) return;
  
  const cfg = qoder.workspace.getConfiguration("nuronesMcp");
  const adminWebUrl = cfg.get("adminWebUrl") ?? "http://localhost:3001";
  const apiUrl = adminWebUrl.replace(':3001', ':9464');
  
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
 * Create default ContextFrame for Qoder operations
 */
function createDefaultContext(): any {
  return {
    reason_trace_id: `qoder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
function resolvePath(configPath: string, workspaceFolder?: QoderWorkspaceFolder): string {
  if (!workspaceFolder) {
    return configPath;
  }
  return configPath.replace(/\$\{workspaceFolder\}/g, workspaceFolder.uri.fsPath);
}

/**
 * Validate filesystem allowlist against workspace
 */
function validateFsAllowlist(allowlist: string, workspaceFolder?: QoderWorkspaceFolder): { valid: boolean; warnings: string[] } {
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
async function startMcpServer(context: QoderExtensionContext): Promise<boolean> {
  const workspaceFolder = qoder.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    qoder.window.showErrorMessage("No workspace folder open. Please open a folder first.");
    return false;
  }

  const cfg = qoder.workspace.getConfiguration("nuronesMcp");
  const serverBinary = resolvePath(cfg.get("serverBinary") ?? "../mcp-core/target/release/nurones-mcp", workspaceFolder);
  const serverConfig = resolvePath(cfg.get("serverConfig") ?? "../.mcp/config.json", workspaceFolder);
  const fsAllowlist = resolvePath(cfg.get("fsAllowlist") ?? "${workspaceFolder},/tmp", workspaceFolder);
  contextEngineEnabled = cfg.get("contextEngine") ?? true;

  // Validate binary exists
  if (!fs.existsSync(serverBinary)) {
    qoder.window.showErrorMessage(`MCP server binary not found: ${serverBinary}. Please build mcp-core first.`);
    return false;
  }

  // Validate config exists
  if (!fs.existsSync(serverConfig)) {
    qoder.window.showErrorMessage(`MCP server config not found: ${serverConfig}`);
    return false;
  }

  // Validate filesystem allowlist
  const { valid, warnings } = validateFsAllowlist(fsAllowlist, workspaceFolder);
  if (!valid) {
    warnings.forEach(w => outputChannel.appendLine(w));
    const proceed = await qoder.window.showWarningMessage(
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
      qoder.window.showErrorMessage(`MCP server failed: ${err.message}`);
      updateStatusBar(false);
    });

    updateStatusBar(true);
    qoder.window.showInformationMessage("Nurones MCP server started");
    return true;
  } catch (error) {
    outputChannel.appendLine(`Failed to start server: ${error}`);
    qoder.window.showErrorMessage(`Failed to start MCP server: ${error}`);
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
    statusBarItem.text = `✓ Nurones MCP [${contextEngineEnabled ? "ON" : "OFF"}]`;
    statusBarItem.tooltip = `MCP Server Running\nContext Engine: ${contextEngineEnabled ? "ENABLED" : "DISABLED"}`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = "✗ Nurones MCP [Stopped]";
    statusBarItem.tooltip = "MCP Server Stopped";
    statusBarItem.backgroundColor = "#f44336";
  }
}

/**
 * Activate extension (Qoder entry point)
 */
export async function activate(context: QoderExtensionContext): Promise<void> {
  outputChannel = qoder.window.createOutputChannel("Nurones MCP");
  outputChannel.appendLine("Nurones MCP extension activated for Qoder IDE");

  // Create status bar item
  statusBarItem = qoder.window.createStatusBarItem("right", 100);
  statusBarItem.command = "nurones.mcp.showStatus";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  updateStatusBar(false);

  // Register commands
  context.subscriptions.push(
    qoder.commands.registerCommand("nurones.mcp.openDashboard", async () => {
      const cfg = qoder.workspace.getConfiguration("nuronesMcp");
      const url = cfg.get("adminWebUrl") ?? "http://localhost:4050";
      outputChannel.appendLine(`Opening dashboard: ${url}`);
      await qoder.env.openExternal(url);
    }),

    qoder.commands.registerCommand("nurones.mcp.execTool", async () => {
      if (!mcpProcess) {
        qoder.window.showWarningMessage("MCP server not running. Start it first.");
        return;
      }

      const toolName = await qoder.window.showInputBox({
        prompt: "Tool name (e.g., fs.read, fs.write, telemetry.push)",
        placeHolder: "fs.read",
      });

      if (!toolName) return;

      const argsInput = await qoder.window.showInputBox({
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

      qoder.window.showInformationMessage(`Sent tool execution: ${toolName} [${ctx.reason_trace_id}]`);
    }),

    qoder.commands.registerCommand("nurones.mcp.viewTrace", async () => {
      const traceId = await qoder.window.showInputBox({
        prompt: "Enter reason_trace_id to view",
        placeHolder: "qoder-1234567890-abc",
      });

      if (!traceId) return;

      outputChannel.appendLine(`Viewing trace: ${traceId}`);
      outputChannel.show();

      const terminal = qoder.window.createTerminal({
        name: `Nurones Trace: ${traceId}`,
        message: `Viewing context trace: ${traceId}\n\nCheck OTel Collector or Prometheus for full trace data.`,
      });
      terminal.show();
    }),

    qoder.commands.registerCommand("nurones.mcp.toggleContextEngine", async () => {
      contextEngineEnabled = !contextEngineEnabled;
      
      const cfg = qoder.workspace.getConfiguration("nuronesMcp");
      // Note: Qoder config update API may differ - adjust as needed
      // await cfg.update("contextEngine", contextEngineEnabled);

      outputChannel.appendLine(`Context Engine toggled: ${contextEngineEnabled ? "ON" : "OFF"}`);

      if (mcpProcess) {
        const choice = await qoder.window.showInformationMessage(
          `Context Engine ${contextEngineEnabled ? "enabled" : "disabled"}. Restart server to apply.`,
          "Restart Now"
        );
        
        if (choice === "Restart Now") {
          stopMcpServer();
          await startMcpServer(context);
        }
      }

      updateStatusBar(!!mcpProcess);
    }),

    qoder.commands.registerCommand("nurones.mcp.showStatus", async () => {
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

      const action = await qoder.window.showInformationMessage(
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
        qoder.commands.executeCommand("nurones.mcp.openDashboard");
      } else if (action === "View Logs") {
        outputChannel.show();
      }
    })
  );

  // Auto-start if configured
  const cfg = qoder.workspace.getConfiguration("nuronesMcp");
  if (cfg.get("autoStart")) {
    await startMcpServer(context);
  }

  // Register with MCP server
  await registerConnection();

  outputChannel.appendLine("Nurones MCP extension ready for Qoder IDE");
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
