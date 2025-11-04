// API client for MCP server

export interface ServerStatus {
  version: string
  status: string
  profile: string
  context_engine_enabled: boolean
  tools_count: number
  connections: Connection[]
  transports: string[]
  runtimes: {
    native_available: boolean
    wasi_available: boolean
  }
}

export interface Connection {
  id: string
  type: 'vscode' | 'qoder' | 'cli' | 'web' | 'other'
  connected_at: string
  last_activity: string
}

export interface Tool {
  name: string
  version: string
  enabled: boolean
  permissions: string[]
  tool_type: string
}

export interface ExtensionModule {
  entry: string
  tools: Tool[]
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

export async function fetchServerStatus(): Promise<ServerStatus> {
  const response = await fetch(`${API_BASE}/api/status`)
  if (!response.ok) {
    throw new Error(`Failed to fetch status: ${response.statusText}`)
  }
  return response.json()
}

export async function toggleContextEngine(enabled: boolean): Promise<void> {
  const response = await fetch(`${API_BASE}/api/context-engine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  if (!response.ok) {
    throw new Error(`Failed to toggle context engine: ${response.statusText}`)
  }
}

export async function toggleTool(toolName: string, enabled: boolean): Promise<void> {
  const response = await fetch(`${API_BASE}/api/tools/${toolName}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  if (!response.ok) {
    throw new Error(`Failed to toggle tool: ${response.statusText}`)
  }
}

export async function fetchTools(): Promise<Tool[]> {
  const response = await fetch(`${API_BASE}/api/tools`)
  if (!response.ok) {
    throw new Error(`Failed to fetch tools: ${response.statusText}`)
  }
  return response.json()
}

// Virtual connector API
export async function virtualConnectorHealth(): Promise<{ active_connections: number }> {
  const response = await fetch(`${API_BASE}/api/connector/virtual/health`)
  if (!response.ok) {
    throw new Error(`Failed to fetch virtual connector health: ${response.statusText}`)
  }
  const text = await response.text()
  const match = text.match(/active_connections=(\d+)/)
  const active = match ? parseInt(match[1], 10) : 0
  return { active_connections: active }
}

export async function virtualConnect(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/connector/virtual/connect`, { method: 'POST' })
  if (!response.ok) {
    throw new Error(`Failed to connect virtual connector: ${response.statusText}`)
  }
}

export async function virtualDisconnect(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/connector/virtual/disconnect`, { method: 'POST' })
  if (!response.ok) {
    throw new Error(`Failed to disconnect virtual connector: ${response.statusText}`)
  }
}

// Fetch extension modules (grouped by manifest entry)
export async function fetchExtensionModules(): Promise<ExtensionModule[]> {
  const response = await fetch(`${API_BASE}/api/tool-manifests`)
  if (!response.ok) {
    throw new Error(`Failed to fetch tool manifests: ${response.statusText}`)
  }
  const data = await response.json()
  
  // Group by entry point
  const grouped = new Map<string, Tool[]>()
  
  if (data.manifests && Array.isArray(data.manifests)) {
    for (const manifest of data.manifests) {
      const entry = manifest.entry || 'unknown'
      const tool: Tool = {
        name: manifest.name || 'unknown',
        version: manifest.version || '0.0.0',
        enabled: true,
        permissions: manifest.permissions || [],
        tool_type: manifest.type || 'Unknown'
      }
      
      if (!grouped.has(entry)) {
        grouped.set(entry, [])
      }
      grouped.get(entry)!.push(tool)
    }
  }
  
  // Convert to array of ExtensionModule
  return Array.from(grouped.entries()).map(([entry, tools]) => ({
    entry,
    tools
  }))
}
