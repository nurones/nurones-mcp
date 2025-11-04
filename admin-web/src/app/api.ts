// API client for MCP server

export interface ServerStatus {
  version: string
  status: string
  profile: string
  context_engine_enabled: boolean
  tools_count: number
  connections: Connection[]
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4050'

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
