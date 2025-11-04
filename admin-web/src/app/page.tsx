'use client'

import { useState, useEffect } from 'react'
import { fetchServerStatus, toggleContextEngine, fetchTools, toggleTool, virtualConnectorHealth, virtualConnect, virtualDisconnect, fetchExtensionModules, type ServerStatus, type Connection, type Tool, type ExtensionModule } from './api'
import dynamic from 'next/dynamic'

const PoliciesPage = dynamic(() => import('./policies/page'), { ssr: false })
const TestToolsPage = dynamic(() => import('./test-tools/page'), { ssr: false })

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch server status on mount and poll every 5 seconds
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const status = await fetchServerStatus()
        setServerStatus(status)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch server status:', err)
        setError('Failed to connect to MCP server')
      } finally {
        setLoading(false)
      }
    }

    loadStatus()
    const interval = setInterval(loadStatus, 5000)

    return () => clearInterval(interval)
  }, [])

  const handleToggleContextEngine = async () => {
    if (!serverStatus) return
    try {
      await toggleContextEngine(!serverStatus.context_engine_enabled)
      // Refresh status
      const status = await fetchServerStatus()
      setServerStatus(status)
    } catch (err) {
      console.error('Failed to toggle context engine:', err)
      setError('Failed to toggle context engine')
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-cyan-400">@nurones/mcp</h1>
              <p className="text-sm text-gray-400 mt-1">
                Self-adaptive Model Context Protocol Runtime v{serverStatus?.version || '0.5'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {loading && <span className="text-sm text-gray-400">Loading...</span>}
              {error && <span className="text-sm text-red-400">{error}</span>}
              {!loading && !error && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  <span className="text-sm text-gray-400">Connected</span>
                  {serverStatus?.connections && serverStatus.connections.length > 0 && (
                    <span className="ml-2 text-sm text-cyan-400">
                      {serverStatus.connections.length} IDE{serverStatus.connections.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-800 bg-gray-950">
        <div className="container mx-auto px-6">
          <nav className="flex gap-8">
            {['Dashboard', 'Extensions', 'Tools', 'Connectors', 'Test Tools', 'Policies', 'Telemetry', 'Context Monitor'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab.toLowerCase().replace(' ', '-'))}
                className={`py-4 px-2 border-b-2 transition-colors ${
                  activeTab === tab.toLowerCase().replace(' ', '-')
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content Area */}
      <main className="container mx-auto px-6 py-8">
        {activeTab === 'dashboard' && <DashboardTab serverStatus={serverStatus} onToggleContextEngine={handleToggleContextEngine} />}
        {activeTab === 'extensions' && <ExtensionsTab />}
        {activeTab === 'tools' && <ToolsTab />}
        {activeTab === 'connectors' && <ConnectorsTab />}
        {activeTab === 'test-tools' && <TestToolsPage />}
        {activeTab === 'policies' && <PoliciesPage />}
        {activeTab === 'telemetry' && <TelemetryTab />}
        {activeTab === 'context-monitor' && <ContextMonitorTab serverStatus={serverStatus} />}
      </main>
    </div>
  )
}

function DashboardTab({ serverStatus, onToggleContextEngine }: {
  serverStatus: ServerStatus | null
  onToggleContextEngine: () => void
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">System Overview</h2>
        {serverStatus?.connections && serverStatus.connections.length > 0 && (
          <div className="text-sm text-gray-400">
            Active IDEs: {serverStatus.connections.map((c: Connection) => c.type).join(', ')}
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="Active Tools"
          value={serverStatus?.tools_count?.toString() || "15"}
          status="operational"
          description="All tools operational"
        />
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Context Engine</h3>
          <div className="flex items-center justify-between">
            <p className="text-3xl font-bold text-white mb-2">
              {serverStatus?.context_engine_enabled ? "ON" : "OFF"}
            </p>
            <button
              onClick={onToggleContextEngine}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded transition-colors text-sm font-medium"
            >
              Toggle
            </button>
          </div>
          <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
            serverStatus?.context_engine_enabled
              ? 'bg-green-900 text-green-300'
              : 'bg-gray-700 text-gray-300'
          }`}>
            {serverStatus?.context_engine_enabled ? 'operational' : 'disabled'}
          </span>
          <p className="text-xs text-gray-500 mt-2">
            Autotune: ±10%/day, min confidence: 0.6
          </p>
        </div>
        <MetricCard
          title="Event Throughput"
          value="0 evt/s"
          status="idle"
          description="Ready to process"
        />
      </div>

      {/* IDE Connections */}
      {serverStatus?.connections && serverStatus.connections.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Connected IDEs</h3>
          <div className="space-y-3">
            {serverStatus.connections.map((conn: Connection) => (
              <div key={conn.id} className="flex items-center justify-between p-3 bg-gray-700 rounded">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span className="font-medium capitalize">{conn.type}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">ID: {conn.id}</p>
                </div>
                <div className="text-right text-xs text-gray-400">
                  <div>Connected: {new Date(conn.connected_at).toLocaleTimeString()}</div>
                  <div>Last activity: {new Date(conn.last_activity).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Configuration Profile</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Profile:</span>
            <span className="ml-2 text-white">{serverStatus?.profile || 'dev'}</span>
          </div>
          <div>
            <span className="text-gray-400">Transports:</span>
            <span className="ml-2 text-white">{serverStatus?.transports?.join(', ') || 'n/a'}</span>
          </div>
          <div>
            <span className="text-gray-400">Default Role:</span>
            <span className="ml-2 text-white">operator</span>
          </div>
          <div>
            <span className="text-gray-400">OTel Exporter:</span>
            <span className="ml-2 text-white">http://localhost:4318</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolsTab() {
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadTools = async () => {
      try {
        const data = await fetchTools()
        setTools(data)
      } catch (err) {
        console.error('Failed to fetch tools:', err)
      } finally {
        setLoading(false)
      }
    }
    loadTools()
    const interval = setInterval(loadTools, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [])

  const handleToggleTool = async (toolName: string, currentlyEnabled: boolean) => {
    try {
      await toggleTool(toolName, !currentlyEnabled)
      // Refresh tools list
      const data = await fetchTools()
      setTools(data)
    } catch (err) {
      console.error('Failed to toggle tool:', err)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading tools...</div>
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Registered Tools</h2>
      
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Tool Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Version
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Permissions
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {tools.map((tool) => (
              <tr key={tool.name} className="hover:bg-gray-750">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-cyan-400">
                  {tool.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                  {tool.version}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                  <span className="px-2 py-1 text-xs bg-gray-700 rounded">{tool.tool_type}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                  {tool.permissions.join(', ')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                    tool.enabled ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'
                  }`}>
                    {tool.enabled ? 'enabled' : 'disabled'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => handleToggleTool(tool.name, tool.enabled)}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      tool.enabled
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {tool.enabled ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ExtensionsTab() {
  const [extensions, setExtensions] = useState<ExtensionModule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadExtensions = async () => {
      try {
        const data = await fetchExtensionModules()
        setExtensions(data)
      } catch (err) {
        console.error('Failed to fetch extensions:', err)
      } finally {
        setLoading(false)
      }
    }
    loadExtensions()
  }, [])

  if (loading) return <div className="text-center py-8">Loading extensions...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">MCP Server Extensions</h2>
          <p className="text-sm text-gray-400 mt-1">Server-side tool modules with manifests in <code className="text-cyan-400">.mcp/tools/</code></p>
        </div>
      </div>
      
      {extensions.length === 0 && (
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-400">No MCP extensions registered</p>
          <p className="text-sm text-gray-500 mt-2">Add manifests to <code>.mcp/tools/</code> to register extensions</p>
        </div>
      )}
      
      {extensions.map((ext) => (
        <div key={ext.entry} className="bg-gray-800 rounded-lg p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-cyan-400">Module: {ext.entry}</h3>
            <p className="text-sm text-gray-400 mt-1">{ext.tools.length} tool{ext.tools.length !== 1 ? 's' : ''}</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ext.tools.map((tool) => (
              <div key={tool.name} className="bg-gray-700 rounded p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white">{tool.name}</span>
                  <span className="px-2 py-1 text-xs bg-gray-600 rounded">{tool.version}</span>
                </div>
                <div className="text-sm text-gray-300 space-y-1">
                  <div>Type: <span className="px-2 py-1 text-xs bg-gray-600 rounded">{tool.tool_type}</span></div>
                  <div>Permissions: {tool.permissions.join(', ')}</div>
                  <div>
                    Status: <span className={`px-2 py-1 text-xs font-medium rounded ${tool.enabled ? 'bg-green-900 text-green-300' : 'bg-gray-600 text-gray-400'}`}>
                      {tool.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      
      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-blue-400 text-xl">ℹ️</span>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-400">IDE Plugins vs MCP Extensions</h4>
            <p className="text-sm text-gray-300 mt-1">
              <strong>MCP Server Extensions</strong> (shown above) are server-side tools with manifests in <code className="text-cyan-400">.mcp/tools/</code>.
            </p>
            <p className="text-sm text-gray-300 mt-1">
              <strong>IDE Plugins</strong> (VS Code, Qoder) are client-side integrations located in <code className="text-cyan-400">plugins/</code> and don't register with the MCP server.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConnectorsTab() {
  const [active, setActive] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<ServerStatus | null>(null)

  const refresh = async () => {
    try {
      const health = await virtualConnectorHealth()
      setActive(health.active_connections)
      const s = await fetchServerStatus()
      setStatus(s)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch connector health:', err)
      setError('Failed to fetch connector health')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleConnect = async () => {
    try { await virtualConnect(); await refresh() } catch {}
  }
  const handleDisconnect = async () => {
    try { await virtualDisconnect(); await refresh() } catch {}
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">MCP Connectors</h2>
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Virtual Connector (in-process)</h3>
            <p className="text-sm text-gray-400">Broker for in-IDE connections via single unified server port.</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{active}</div>
            <div className="text-xs text-gray-400">active connections</div>
          </div>
        </div>
        <div className="mt-4 text-sm text-gray-300">
          <div>Transports: {status?.transports?.join(', ') || 'n/a'}</div>
          <div className="mt-1">
            Runtimes:
            <span className={`ml-2 px-2 py-1 text-xs rounded ${status?.runtimes?.native_available ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'}`}>
              Native {status?.runtimes?.native_available ? 'available' : 'unavailable'}
            </span>
            <span className={`ml-2 px-2 py-1 text-xs rounded ${status?.runtimes?.wasi_available ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'}`}>
              WASI {status?.runtimes?.wasi_available ? 'available' : 'unavailable'}
            </span>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button onClick={handleConnect} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded transition-colors">Connect</button>
          <button onClick={handleDisconnect} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors">Disconnect</button>
          {loading && <span className="text-sm text-gray-400">Loading...</span>}
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
      </div>
    </div>
  )
}

function TelemetryTab() {
  const metricsUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:50550/metrics` : '/metrics'
  
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Observability & Telemetry</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="font-semibold mb-4">Prometheus Metrics</h3>
          <p className="text-sm text-gray-400 mb-4">
            Endpoint: <code className="text-cyan-400">{metricsUrl}</code>
          </p>
          <a
            href={metricsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded transition-colors"
          >
            Open Metrics
          </a>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="font-semibold mb-4">OpenTelemetry</h3>
          <p className="text-sm text-gray-400 mb-4">
            Exporter: <code className="text-cyan-400">http://localhost:4318</code>
          </p>
          <p className="text-xs text-gray-500 mb-4">
            External collector endpoint (not served by MCP)
          </p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-gray-500 rounded-full"></span>
            <span className="text-sm text-gray-400">External service</span>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="font-semibold mb-4">Recent Traces</h3>
        <p className="text-sm text-gray-400">No traces recorded yet</p>
      </div>
    </div>
  )
}

function ContextMonitorTab({ serverStatus }: { serverStatus: ServerStatus | null }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Context Engine Monitor</h2>
      
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="font-semibold mb-4">Current ContextFrame (Default)</h3>
        <pre className="bg-gray-900 p-4 rounded text-sm overflow-x-auto">
{`{
  "reason_trace_id": "bootstrap-000",
  "tenant_id": "default",
  "stage": "dev",
  "risk_level": 0,
  "context_confidence": 0.7,
  "ts": "auto"
}`}
        </pre>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="font-semibold mb-4">Adaptive Metrics</h3>
        <p className="text-sm text-gray-400">No adaptive adjustments recorded yet</p>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="font-semibold mb-4">Rollback Control</h3>
        <button className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors">
          Rollback to Last Stable
        </button>
        <p className="text-sm text-gray-400 mt-2">
          Restores configuration to last successful checkpoint
        </p>
      </div>
    </div>
  )
}

function MetricCard({ title, value, status, description }: {
  title: string
  value: string
  status: 'operational' | 'idle' | 'warning'
  description: string
}) {
  const statusColors = {
    operational: 'bg-green-900 text-green-300',
    idle: 'bg-gray-700 text-gray-300',
    warning: 'bg-yellow-900 text-yellow-300',
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-sm font-medium text-gray-400 mb-2">{title}</h3>
      <p className="text-3xl font-bold text-white mb-2">{value}</p>
      <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${statusColors[status]}`}>
        {status}
      </span>
      <p className="text-xs text-gray-500 mt-2">{description}</p>
    </div>
  )
}
