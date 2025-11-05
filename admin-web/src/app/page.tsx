'use client'

import { useState, useEffect } from 'react'
import { fetchServerStatus, toggleContextEngine, fetchTools, toggleTool, createTool, updateTool, deleteTool, virtualConnectorHealth, virtualConnect, virtualDisconnect, fetchExtensions, fetchPlugins, fetchConnectors, type ServerStatus, type Connection, type Tool, type Extension, type Plugin, type ConnectorInfo } from './api'
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
            {['Dashboard', 'Tools', 'Plugins', 'Extensions', 'Connectors', 'Test Tools', 'Policies', 'Telemetry', 'Context Monitor'].map((tab) => (
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
        {activeTab === 'tools' && <ToolsTab />}
        {activeTab === 'plugins' && <PluginsTab />}
        {activeTab === 'extensions' && <ExtensionsTab />}
        {activeTab === 'connectors' && <ConnectorsTab />}
        {activeTab === 'test-tools' && <TestToolsPage />}
        {activeTab === 'policies' && <PoliciesPage />}
        {activeTab === 'telemetry' && <TelemetryTab serverStatus={serverStatus} />}
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
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingTool, setEditingTool] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    version: '1.0.0',
    tool_type: 'Native',
    permissions: [] as string[],
    enabled: true,
  })
  const [editFormData, setEditFormData] = useState<{
    version: string
    tool_type: string
    permissions: string[]
  } | null>(null)

  // Common permission options
  const availablePermissions = [
    'read', 'write', 'delete', 'execute',
    'network', 'db', 'ai', 'compute',
    'emit', 'system'
  ]

  const toolTypes = ['Native', 'WASI']

  useEffect(() => {
    loadTools()
    const interval = setInterval(loadTools, 10000)
    return () => clearInterval(interval)
  }, [])

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

  const handleToggleTool = async (toolName: string, currentlyEnabled: boolean) => {
    try {
      await toggleTool(toolName, !currentlyEnabled)
      await loadTools()
    } catch (err) {
      console.error('Failed to toggle tool:', err)
    }
  }

  const handleCreateTool = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createTool({
        name: formData.name,
        version: formData.version,
        tool_type: formData.tool_type,
        permissions: formData.permissions,
        enabled: formData.enabled,
      })
      setShowCreateForm(false)
      setFormData({ name: '', version: '1.0.0', tool_type: 'Native', permissions: [], enabled: true })
      await loadTools()
    } catch (err) {
      console.error('Failed to create tool:', err)
      alert('Failed to create tool: ' + (err as Error).message)
    }
  }

  const togglePermission = (permission: string, isCreate: boolean = true) => {
    if (isCreate) {
      setFormData(prev => ({
        ...prev,
        permissions: prev.permissions.includes(permission)
          ? prev.permissions.filter(p => p !== permission)
          : [...prev.permissions, permission]
      }))
    } else if (editFormData) {
      setEditFormData({
        ...editFormData,
        permissions: editFormData.permissions.includes(permission)
          ? editFormData.permissions.filter(p => p !== permission)
          : [...editFormData.permissions, permission]
      })
    }
  }

  const startEdit = (tool: Tool) => {
    setEditingTool(tool.name)
    setEditFormData({
      version: tool.version,
      tool_type: tool.tool_type,
      permissions: [...tool.permissions]
    })
  }

  const cancelEdit = () => {
    setEditingTool(null)
    setEditFormData(null)
  }

  const handleUpdateTool = async (toolName: string) => {
    if (!editFormData) return
    try {
      await updateTool(toolName, editFormData)
      setEditingTool(null)
      setEditFormData(null)
      await loadTools()
    } catch (err) {
      console.error('Failed to update tool:', err)
      alert('Failed to update tool: ' + (err as Error).message)
    }
  }

  const handleDeleteTool = async (toolName: string) => {
    if (!confirm(`Are you sure you want to delete tool "${toolName}"?`)) return
    try {
      await deleteTool(toolName)
      await loadTools()
    } catch (err) {
      console.error('Failed to delete tool:', err)
      alert('Failed to delete tool: ' + (err as Error).message)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading tools...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Registered Tools</h2>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded transition-colors text-sm font-medium"
        >
          {showCreateForm ? 'Cancel' : '+ New Tool'}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Create New Tool</h3>
          <form onSubmit={handleCreateTool} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-cyan-500"
                  placeholder="e.g., custom.tool"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Version</label>
                <input
                  type="text"
                  required
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
              <div className="flex gap-4">
                {toolTypes.map(type => (
                  <label key={type} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="tool_type"
                      value={type}
                      checked={formData.tool_type === type}
                      onChange={(e) => setFormData({ ...formData, tool_type: e.target.value })}
                      className="text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className="text-sm text-gray-300">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Permissions</label>
              <div className="grid grid-cols-5 gap-2">
                {availablePermissions.map(permission => (
                  <label
                    key={permission}
                    className={`px-3 py-2 rounded text-sm cursor-pointer transition-colors ${
                      formData.permissions.includes(permission)
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.permissions.includes(permission)}
                      onChange={() => togglePermission(permission, true)}
                      className="sr-only"
                    />
                    {permission}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Selected: {formData.permissions.length > 0 ? formData.permissions.join(', ') : 'none'}
              </p>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="enabled"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="mr-2 h-4 w-4 text-cyan-600 focus:ring-cyan-500 rounded"
              />
              <label htmlFor="enabled" className="text-sm text-gray-300">Enabled by default</label>
            </div>
            
            <div className="flex gap-3 pt-4 border-t border-gray-700">
              <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition-colors">
                Create Tool
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false)
                  setFormData({ name: '', version: '1.0.0', tool_type: 'Native', permissions: [], enabled: true })
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      
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
                  {editingTool === tool.name && editFormData ? (
                    <input
                      type="text"
                      value={editFormData.version}
                      onChange={(e) => setEditFormData({ ...editFormData, version: e.target.value })}
                      className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm w-24"
                    />
                  ) : (
                    tool.version
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                  {editingTool === tool.name && editFormData ? (
                    <select
                      value={editFormData.tool_type}
                      onChange={(e) => setEditFormData({ ...editFormData, tool_type: e.target.value })}
                      className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                    >
                      {toolTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="px-2 py-1 text-xs bg-gray-700 rounded">{tool.tool_type}</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-300">
                  {editingTool === tool.name && editFormData ? (
                    <div className="space-y-1">
                      <div className="flex flex-wrap gap-1">
                        {availablePermissions.map(permission => (
                          <button
                            key={permission}
                            type="button"
                            onClick={() => togglePermission(permission, false)}
                            className={`px-2 py-1 rounded text-xs transition-colors ${
                              editFormData.permissions.includes(permission)
                                ? 'bg-cyan-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                          >
                            {permission}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {tool.permissions.map(perm => (
                        <span key={perm} className="px-2 py-1 text-xs bg-gray-700 rounded">
                          {perm}
                        </span>
                      ))}
                      {tool.permissions.length === 0 && (
                        <span className="text-xs text-gray-500">none</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                    tool.enabled ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'
                  }`}>
                    {tool.enabled ? 'enabled' : 'disabled'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap space-x-2">
                  {editingTool === tool.name ? (
                    <>
                      <button
                        onClick={() => handleUpdateTool(tool.name)}
                        className="px-2 py-1 text-sm rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
                        title="Save changes"
                      >
                        ✓
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-2 py-1 text-sm rounded bg-gray-600 hover:bg-gray-500 text-white transition-colors"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleToggleTool(tool.name, tool.enabled)}
                        className={`px-2 py-1 text-sm rounded transition-colors ${
                          tool.enabled
                            ? 'bg-orange-600 hover:bg-orange-700 text-white'
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                        title={tool.enabled ? 'Disable tool' : 'Enable tool'}
                      >
                        {tool.enabled ? '⏸' : '▶'}
                      </button>
                      <button
                        onClick={() => startEdit(tool)}
                        className="px-2 py-1 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                        title="Edit tool"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDeleteTool(tool.name)}
                        className="px-2 py-1 text-sm rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
                        title="Delete tool"
                      >
                        🗑
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PluginsTab() {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const [testingPlugin, setTestingPlugin] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ plugin: string, success: boolean, message: string } | null>(null)
  const [configuringPlugin, setConfiguringPlugin] = useState<string | null>(null)
  const [connectionTest, setConnectionTest] = useState<{ plugin: string, status: 'testing' | 'success' | 'failed', message: string } | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [pluginConfig, setPluginConfig] = useState<{
    serverUrl: string
    apiKey: string
    transport: 'stdio' | 'ws' | 'http'
    autoConnect: boolean
    debugMode: boolean
  }>({
    serverUrl: 'http://localhost:50550',
    apiKey: '',
    transport: 'ws',
    autoConnect: true,
    debugMode: false
  })
  const [newPluginConfig, setNewPluginConfig] = useState({
    name: '',
    displayName: '',
    description: '',
    version: '0.1.0',
    ide: 'vscode',
    publisher: 'your-publisher'
  })

  const loadPlugins = async () => {
    try {
      const data = await fetchPlugins()
      setPlugins(data)
    } catch (err) {
      console.error('Failed to fetch plugins:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPlugins()
  }, [])

  const handleCreatePlugin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const response = await fetch('/api/plugins/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPluginConfig)
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        alert(`Failed to create plugin: ${errorText}`)
        return
      }
      
      const result = await response.json()
      
      if (result.success) {
        const steps = result.next_steps.map((step: string, i: number) => `${i + 1}. ${step}`).join('\n')
        alert(`✅ ${result.message}

📍 Location: ${result.plugin.path}

🛠️ Next Steps:
${steps}

Refresh this page after building to see your plugin.`)
        
        // Reset form and close
        setShowCreateForm(false)
        setNewPluginConfig({
          name: '',
          displayName: '',
          description: '',
          version: '0.1.0',
          ide: 'vscode',
          publisher: 'your-publisher'
        })
        
        // Reload plugins list
        await loadPlugins()
      }
    } catch (err) {
      alert(`❌ Error creating plugin: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleTestPlugin = async (pluginName: string, pluginPath: string) => {
    setTestingPlugin(pluginName)
    setTestResult(null)
    
    try {
      // Check if package.json exists
      const packageJsonPath = pluginPath.replace(/\/$/, '') + '/package.json'
      const checkResponse = await fetch('/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'fs.read',
          input: { path: packageJsonPath },
          context: {
            reason_trace_id: `plugin-test-${Date.now()}`,
            tenant_id: 'default',
            stage: 'dev',
            risk_level: 0,
            ts: new Date().toISOString()
          }
        })
      })
      
      if (!checkResponse.ok) {
        setTestResult({
          plugin: pluginName,
          success: false,
          message: 'Failed to read plugin configuration'
        })
        return
      }
      
      const result = await checkResponse.json()
      if (result.success && result.output?.content) {
        try {
          const pkgData = JSON.parse(result.output.content)
          setTestResult({
            plugin: pluginName,
            success: true,
            message: `✅ Plugin configuration valid\n📦 Version: ${pkgData.version}\n📝 Entry: ${pkgData.main || 'src/extension.ts'}\n${pkgData.activationEvents ? `🔌 Activation: ${pkgData.activationEvents.length} events` : ''}`
          })
        } catch (e) {
          setTestResult({
            plugin: pluginName,
            success: false,
            message: 'Invalid package.json format'
          })
        }
      } else {
        setTestResult({
          plugin: pluginName,
          success: false,
          message: 'Plugin configuration not found'
        })
      }
    } catch (err) {
      setTestResult({
        plugin: pluginName,
        success: false,
        message: `Test failed: ${err instanceof Error ? err.message : String(err)}`
      })
    } finally {
      setTestingPlugin(null)
    }
  }

  const handleTestConnection = async (pluginName: string) => {
    setConnectionTest({ plugin: pluginName, status: 'testing', message: 'Testing connection...' })
    
    try {
      // Test 1: Check server connectivity
      const healthResponse = await fetch('/api/status')
      if (!healthResponse.ok) {
        setConnectionTest({
          plugin: pluginName,
          status: 'failed',
          message: '❌ MCP Server unreachable'
        })
        return
      }
      
      // Test 2: Verify transport availability
      const connectorsResponse = await fetch('/api/connectors')
      if (!connectorsResponse.ok) {
        setConnectionTest({
          plugin: pluginName,
          status: 'failed',
          message: '❌ Cannot query transports'
        })
        return
      }
      
      const connectorsData = await connectorsResponse.json()
      const selectedTransport = connectorsData.transports?.find(
        (t: any) => t.name === pluginConfig.transport
      )
      
      if (!selectedTransport || !selectedTransport.enabled) {
        setConnectionTest({
          plugin: pluginName,
          status: 'failed',
          message: `❌ Transport "${pluginConfig.transport}" not enabled on server`
        })
        return
      }
      
      // Test 3: Try to establish virtual connection
      const connectResponse = await fetch('/api/connector/virtual/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_type: pluginName.toLowerCase().replace(/\s+/g, '-'),
          transport: pluginConfig.transport
        })
      })
      
      if (connectResponse.ok) {
        const connectData = await connectResponse.json()
        setConnectionTest({
          plugin: pluginName,
          status: 'success',
          message: `✅ Connection successful!
🔌 Transport: ${pluginConfig.transport}
🆔 Connection ID: ${connectData.connection_id || 'virtual'}
📡 Server: ${pluginConfig.serverUrl}
⚡ Status: Active`
        })
      } else {
        setConnectionTest({
          plugin: pluginName,
          status: 'failed',
          message: '⚠️ Server reachable but connection failed\nCheck server logs for details'
        })
      }
    } catch (err) {
      setConnectionTest({
        plugin: pluginName,
        status: 'failed',
        message: `❌ Connection test failed: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  }

  const handleSaveConfig = async (pluginName: string) => {
    // Save configuration to local storage or backend
    const configKey = `plugin-config-${pluginName.toLowerCase().replace(/\s+/g, '-')}`
    localStorage.setItem(configKey, JSON.stringify(pluginConfig))
    alert(`Configuration saved for ${pluginName}!\n\nYou can now use these settings in your IDE plugin.`)
    setConfiguringPlugin(null)
  }

  const handleLoadConfig = (pluginName: string) => {
    const configKey = `plugin-config-${pluginName.toLowerCase().replace(/\s+/g, '-')}`
    const saved = localStorage.getItem(configKey)
    if (saved) {
      try {
        setPluginConfig(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to load config:', e)
      }
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading plugins...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">IDE Plugins</h2>
          <p className="text-sm text-gray-400 mt-1">Client-side IDE integrations in <code className="text-cyan-400">plugins/</code></p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded transition-colors text-sm font-medium"
        >
          {showCreateForm ? '✕ Cancel' : '+ New Plugin'}
        </button>
      </div>
      
      {/* Create Plugin Form */}
      {showCreateForm && (
        <div className="bg-gray-800 rounded-lg p-6 border-2 border-cyan-500">
          <h3 className="text-lg font-semibold text-cyan-400 mb-4">🔌 Create New IDE Plugin</h3>
          <form onSubmit={handleCreatePlugin} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Plugin Name (kebab-case)</label>
                <input
                  type="text"
                  required
                  pattern="[a-z0-9-]+"
                  value={newPluginConfig.name}
                  onChange={(e) => setNewPluginConfig({ ...newPluginConfig, name: e.target.value.toLowerCase() })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  placeholder="my-mcp-plugin"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Display Name</label>
                <input
                  type="text"
                  required
                  value={newPluginConfig.displayName}
                  onChange={(e) => setNewPluginConfig({ ...newPluginConfig, displayName: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  placeholder="My MCP Plugin"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
              <input
                type="text"
                required
                value={newPluginConfig.description}
                onChange={(e) => setNewPluginConfig({ ...newPluginConfig, description: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                placeholder="Description of what this plugin does"
              />
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Version</label>
                <input
                  type="text"
                  value={newPluginConfig.version}
                  onChange={(e) => setNewPluginConfig({ ...newPluginConfig, version: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  placeholder="0.1.0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Target IDE</label>
                <select
                  value={newPluginConfig.ide}
                  onChange={(e) => setNewPluginConfig({ ...newPluginConfig, ide: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                >
                  <option value="vscode">VS Code</option>
                  <option value="qoder">Qoder</option>
                  <option value="custom">Custom IDE</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Publisher</label>
                <input
                  type="text"
                  value={newPluginConfig.publisher}
                  onChange={(e) => setNewPluginConfig({ ...newPluginConfig, publisher: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  placeholder="your-publisher"
                />
              </div>
            </div>
            
            <div className="bg-blue-900/20 border border-blue-700 rounded p-3">
              <div className="flex items-start gap-2">
                <span className="text-blue-400 text-lg">ℹ️</span>
                <div className="text-xs text-gray-300">
                  <p className="font-semibold text-blue-400 mb-1">Generated Files:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>package.json with IDE-specific configuration</li>
                    <li>tsconfig.json for TypeScript compilation</li>
                    <li>src/extension.ts with basic plugin structure</li>
                    <li>.gitignore and .vscodeignore (for VS Code)</li>
                    <li>README.md with setup instructions</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 pt-4 border-t border-gray-700">
              <button type="submit" className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded transition-colors">
                🔌 Create Plugin
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plugins.map((plugin) => (
          <div key={plugin.name} className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-cyan-400">{plugin.name}</h3>
              <span className="px-2 py-1 text-xs bg-gray-700 rounded">{plugin.version}</span>
            </div>
            
            <p className="text-sm text-gray-300 mb-4">{plugin.description}</p>
            
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-400">Path:</span>
                <code className="ml-2 text-cyan-400 text-xs">{plugin.path}</code>
              </div>
              
              <div>
                <span className="text-gray-400">Language:</span>
                <span className="ml-2 text-white">{plugin.language}</span>
              </div>
              
              {plugin.commands > 0 && (
                <div>
                  <span className="text-gray-400">Commands:</span>
                  <span className="ml-2 text-white">{plugin.commands}</span>
                </div>
              )}
              
              {plugin.is_template && (
                <div className="pt-3 border-t border-gray-700">
                  <span className="px-2 py-1 text-xs bg-blue-900 text-blue-300 rounded">Template</span>
                  <p className="text-xs text-gray-400 mt-2">Use as starting point for new plugins</p>
                </div>
              )}
            </div>
            
            {/* Configuration Section */}
            {configuringPlugin === plugin.name && (
              <div className="mt-4 pt-4 border-t border-gray-700 space-y-3">
                <h4 className="font-semibold text-sm text-cyan-400">⚙️ Plugin Configuration</h4>
                
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Server URL</label>
                  <input
                    type="text"
                    value={pluginConfig.serverUrl}
                    onChange={(e) => setPluginConfig({ ...pluginConfig, serverUrl: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                    placeholder="http://localhost:50550"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Transport Protocol</label>
                  <select
                    value={pluginConfig.transport}
                    onChange={(e) => setPluginConfig({ ...pluginConfig, transport: e.target.value as any })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                  >
                    <option value="ws">WebSocket (ws)</option>
                    <option value="stdio">Standard I/O (stdio)</option>
                    <option value="http">HTTP</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs text-gray-400 mb-1">API Key (optional)</label>
                  <input
                    type="password"
                    value={pluginConfig.apiKey}
                    onChange={(e) => setPluginConfig({ ...pluginConfig, apiKey: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                    placeholder="Leave empty for dev mode"
                  />
                </div>
                
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={pluginConfig.autoConnect}
                      onChange={(e) => setPluginConfig({ ...pluginConfig, autoConnect: e.target.checked })}
                      className="rounded text-cyan-600"
                    />
                    Auto-connect on startup
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={pluginConfig.debugMode}
                      onChange={(e) => setPluginConfig({ ...pluginConfig, debugMode: e.target.checked })}
                      className="rounded text-cyan-600"
                    />
                    Debug mode
                  </label>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleSaveConfig(plugin.name)}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition-colors text-sm font-medium"
                  >
                    💾 Save Config
                  </button>
                  <button
                    onClick={() => setConfiguringPlugin(null)}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded transition-colors text-sm"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
            
            {/* Test Button and Result */}
            <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleTestPlugin(plugin.name, plugin.path)}
                  disabled={testingPlugin === plugin.name}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded transition-colors text-xs font-medium"
                >
                  {testingPlugin === plugin.name ? 'Testing...' : '🧪 Test Config'}
                </button>
                
                <button
                  onClick={() => {
                    if (configuringPlugin === plugin.name) {
                      setConfiguringPlugin(null)
                    } else {
                      handleLoadConfig(plugin.name)
                      setConfiguringPlugin(plugin.name)
                    }
                  }}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded transition-colors text-xs font-medium"
                >
                  {configuringPlugin === plugin.name ? '↑ Hide Config' : '⚙️ Configure'}
                </button>
              </div>
              
              <button
                onClick={() => handleTestConnection(plugin.name)}
                disabled={connectionTest?.plugin === plugin.name && connectionTest.status === 'testing'}
                className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 rounded transition-colors text-sm font-medium"
              >
                {connectionTest?.plugin === plugin.name && connectionTest.status === 'testing' 
                  ? '🔄 Testing Connection...' 
                  : '🔌 Test Connection'}
              </button>
              
              {testResult && testResult.plugin === plugin.name && (
                <div className={`p-3 rounded text-sm ${
                  testResult.success 
                    ? 'bg-green-900/20 border border-green-700 text-green-300' 
                    : 'bg-red-900/20 border border-red-700 text-red-300'
                }`}>
                  <pre className="whitespace-pre-wrap text-xs">{testResult.message}</pre>
                </div>
              )}
              
              {connectionTest && connectionTest.plugin === plugin.name && (
                <div className={`p-3 rounded text-sm ${
                  connectionTest.status === 'success' 
                    ? 'bg-green-900/20 border border-green-700 text-green-300'
                    : connectionTest.status === 'failed'
                    ? 'bg-red-900/20 border border-red-700 text-red-300'
                    : 'bg-blue-900/20 border border-blue-700 text-blue-300'
                }`}>
                  <pre className="whitespace-pre-wrap text-xs">{connectionTest.message}</pre>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-blue-400 text-xl">ℹ️</span>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-400">IDE Plugins vs Server Extensions</h4>
            <p className="text-sm text-gray-300 mt-1">
              <strong>IDE Plugins</strong> are client-side integrations that connect to the MCP server. They don't appear in the Tools or Extensions tabs.
            </p>
            <p className="text-sm text-gray-300 mt-1">
              <strong>Server Extensions</strong> are server-side tool modules with manifests in <code className="text-cyan-400">.mcp/tools/</code> that execute tools on the server.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ExtensionsTab() {
  const [extensions, setExtensions] = useState<Extension[]>([])
  const [loading, setLoading] = useState(true)
  const [testingExtension, setTestingExtension] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ extension: string, success: boolean, message: string } | null>(null)
  const [buildingExtension, setBuildingExtension] = useState<string | null>(null)
  const [buildResult, setBuildResult] = useState<{ extension: string, success: boolean, message: string } | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [extensionConfig, setExtensionConfig] = useState({
    name: '',
    description: '',
    version: '1.0.0',
    language: 'TypeScript',
    entry: 'dist/index.js',
    createManifest: true,
    permissions: [] as string[]
  })

  const availablePermissions = ['read', 'write', 'delete', 'execute', 'network', 'db', 'ai', 'compute', 'emit', 'system']

  const loadExtensions = async () => {
    try {
      const data = await fetchExtensions()
      setExtensions(data)
    } catch (err) {
      console.error('Failed to fetch extensions:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExtensions()
  }, [])

  const handleTestExtension = async (extName: string, extPath: string) => {
    setTestingExtension(extName)
    setTestResult(null)
    
    try {
      // Test 1: Check if package.json exists
      const packageJsonPath = extPath.replace(/\/$/, '') + '/package.json'
      const pkgResponse = await fetch('/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'fs.read',
          input: { path: packageJsonPath },
          context: {
            reason_trace_id: `ext-test-${Date.now()}`,
            tenant_id: 'default',
            stage: 'dev',
            risk_level: 0,
            ts: new Date().toISOString()
          }
        })
      })
      
      if (!pkgResponse.ok) {
        setTestResult({
          extension: extName,
          success: false,
          message: '❌ Extension configuration not found'
        })
        return
      }
      
      const pkgResult = await pkgResponse.json()
      if (!pkgResult.success || !pkgResult.output?.content) {
        setTestResult({
          extension: extName,
          success: false,
          message: '❌ package.json not readable'
        })
        return
      }
      
      let pkgData
      try {
        pkgData = JSON.parse(pkgResult.output.content)
      } catch (e) {
        setTestResult({
          extension: extName,
          success: false,
          message: '❌ Invalid package.json format'
        })
        return
      }
      
      // Test 2: Check if build output exists
      const buildPath = extPath.replace(/\/$/, '') + '/dist/index.js'
      const buildResponse = await fetch('/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'fs.read',
          input: { path: buildPath },
          context: {
            reason_trace_id: `ext-build-test-${Date.now()}`,
            tenant_id: 'default',
            stage: 'dev',
            risk_level: 0,
            ts: new Date().toISOString()
          }
        })
      })
      
      const buildResult = await buildResponse.json()
      const hasBuilt = buildResult.success && buildResult.output?.content
      
      // Test 3: Check for manifest in .mcp/tools/
      const manifestPath = `.mcp/tools/${extName}.json`
      const manifestResponse = await fetch('/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'fs.read',
          input: { path: manifestPath },
          context: {
            reason_trace_id: `ext-manifest-test-${Date.now()}`,
            tenant_id: 'default',
            stage: 'dev',
            risk_level: 0,
            ts: new Date().toISOString()
          }
        })
      })
      
      const manifestResult = await manifestResponse.json()
      const hasManifest = manifestResult.success && manifestResult.output?.content
      
      // Compile test results
      const messages = []
      messages.push(`✅ Configuration valid (v${pkgData.version})`)
      
      if (hasBuilt) {
        messages.push(`✅ Built successfully (${Math.round(buildResult.output.size / 1024)}KB)`)
      } else {
        messages.push('⚠️ Not built (run npm run build)')
      }
      
      if (hasManifest) {
        messages.push('✅ Manifest registered in .mcp/tools/')
      } else {
        messages.push('⚠️ No manifest found in .mcp/tools/')
      }
      
      if (pkgData.scripts?.build) {
        messages.push(`🔧 Build command: ${pkgData.scripts.build}`)
      }
      
      const allPassed = hasBuilt && hasManifest
      setTestResult({
        extension: extName,
        success: allPassed,
        message: messages.join('\n')
      })
      
    } catch (err) {
      setTestResult({
        extension: extName,
        success: false,
        message: `❌ Test failed: ${err instanceof Error ? err.message : String(err)}`
      })
    } finally {
      setTestingExtension(null)
    }
  }

  const handleBuildExtension = async (extName: string, extPath: string) => {
    setBuildingExtension(extName)
    setBuildResult(null)
    
    try {
      // Read package.json to get build command
      const packageJsonPath = extPath.replace(/\/$/, '') + '/package.json'
      const pkgResponse = await fetch('/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'fs.read',
          input: { path: packageJsonPath },
          context: {
            reason_trace_id: `ext-build-${Date.now()}`,
            tenant_id: 'default',
            stage: 'dev',
            risk_level: 0,
            ts: new Date().toISOString()
          }
        })
      })
      
      const pkgResult = await pkgResponse.json()
      if (pkgResult.success && pkgResult.output?.content) {
        const pkgData = JSON.parse(pkgResult.output.content)
        const buildCmd = pkgData.scripts?.build || 'npm run build'
        
        setBuildResult({
          extension: extName,
          success: true,
          message: `🔧 Build command found: ${buildCmd}

⚠️ Run this in terminal:
cd ${extPath} && ${buildCmd}

Refresh this page after building.`
        })
      } else {
        setBuildResult({
          extension: extName,
          success: false,
          message: '❌ Cannot read package.json to find build command'
        })
      }
    } catch (err) {
      setBuildResult({
        extension: extName,
        success: false,
        message: `❌ Build setup failed: ${err instanceof Error ? err.message : String(err)}`
      })
    } finally {
      setBuildingExtension(null)
    }
  }

  const handleCreateExtension = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const response = await fetch('/api/extensions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extensionConfig)
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        alert(`Failed to create extension: ${errorText}`)
        return
      }
      
      const result = await response.json()
      
      if (result.success) {
        const steps = result.next_steps.map((step: string, i: number) => `${i + 1}. ${step}`).join('\n')
        alert(`✅ ${result.message}

📍 Location: ${result.extension.path}

🛠️ Next Steps:
${steps}

Refresh this page after building to see your extension.`)
        
        // Reset form and close
        setShowCreateForm(false)
        setExtensionConfig({
          name: '',
          description: '',
          version: '1.0.0',
          language: 'TypeScript',
          entry: 'dist/index.js',
          createManifest: true,
          permissions: []
        })
        
        // Reload extensions list
        await loadExtensions()
      }
    } catch (err) {
      alert(`❌ Error creating extension: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const togglePermission = (permission: string) => {
    setExtensionConfig(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission]
    }))
  }

  if (loading) return <div className="text-center py-8">Loading extensions...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">MCP Server Extensions</h2>
          <p className="text-sm text-gray-400 mt-1">Server-side extension modules in <code className="text-cyan-400">extensions/</code></p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded transition-colors text-sm font-medium"
        >
          {showCreateForm ? '✕ Cancel' : '+ New Extension'}
        </button>
      </div>
      
      {/* Create Extension Form */}
      {showCreateForm && (
        <div className="bg-gray-800 rounded-lg p-6 border-2 border-cyan-500">
          <h3 className="text-lg font-semibold text-cyan-400 mb-4">🏛️ Create New Extension</h3>
          <form onSubmit={handleCreateExtension} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Extension Name</label>
                <input
                  type="text"
                  required
                  value={extensionConfig.name}
                  onChange={(e) => setExtensionConfig({ ...extensionConfig, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  placeholder="my-extension"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Version</label>
                <input
                  type="text"
                  required
                  value={extensionConfig.version}
                  onChange={(e) => setExtensionConfig({ ...extensionConfig, version: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  placeholder="1.0.0"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
              <input
                type="text"
                required
                value={extensionConfig.description}
                onChange={(e) => setExtensionConfig({ ...extensionConfig, description: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                placeholder="Description of what this extension does"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Language</label>
                <select
                  value={extensionConfig.language}
                  onChange={(e) => setExtensionConfig({ ...extensionConfig, language: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                >
                  <option value="TypeScript">TypeScript</option>
                  <option value="JavaScript">JavaScript</option>
                  <option value="Rust">Rust</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Entry Point</label>
                <input
                  type="text"
                  value={extensionConfig.entry}
                  onChange={(e) => setExtensionConfig({ ...extensionConfig, entry: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  placeholder="dist/index.js"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Permissions</label>
              <div className="grid grid-cols-5 gap-2">
                {availablePermissions.map(permission => (
                  <label
                    key={permission}
                    className={`px-3 py-2 rounded text-sm cursor-pointer transition-colors ${
                      extensionConfig.permissions.includes(permission)
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={extensionConfig.permissions.includes(permission)}
                      onChange={() => togglePermission(permission)}
                      className="sr-only"
                    />
                    {permission}
                  </label>
                ))}
              </div>
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="createManifest"
                checked={extensionConfig.createManifest}
                onChange={(e) => setExtensionConfig({ ...extensionConfig, createManifest: e.target.checked })}
                className="mr-2 h-4 w-4 text-cyan-600 focus:ring-cyan-500 rounded"
              />
              <label htmlFor="createManifest" className="text-sm text-gray-300">
                Auto-generate manifest in .mcp/tools/
              </label>
            </div>
            
            <div className="flex gap-3 pt-4 border-t border-gray-700">
              <button type="submit" className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded transition-colors">
                🏛️ Create Extension
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      
      {extensions.length === 0 && !showCreateForm && (
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-400">No MCP extensions found</p>
          <p className="text-sm text-gray-500 mt-2">Create extension modules in <code>extensions/</code> directory</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded transition-colors text-sm"
          >
            + Create First Extension
          </button>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {extensions.map((ext) => (
          <div key={ext.name} className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-cyan-400">{ext.name}</h3>
              <span className="px-2 py-1 text-xs bg-gray-700 rounded">{ext.version}</span>
            </div>
            
            <p className="text-sm text-gray-300 mb-4">{ext.description}</p>
            
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-400">Path:</span>
                <code className="ml-2 text-cyan-400 text-xs">{ext.path}</code>
              </div>
              
              <div>
                <span className="text-gray-400">Language:</span>
                <span className="ml-2 text-white">{ext.language}</span>
              </div>
            </div>
            
            {/* Management Buttons */}
            <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleTestExtension(ext.name, ext.path)}
                  disabled={testingExtension === ext.name}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded transition-colors text-xs font-medium"
                >
                  {testingExtension === ext.name ? 'Testing...' : '🔬 Test'}
                </button>
                
                <button
                  onClick={() => handleBuildExtension(ext.name, ext.path)}
                  disabled={buildingExtension === ext.name}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded transition-colors text-xs font-medium"
                >
                  {buildingExtension === ext.name ? 'Checking...' : '🔨 Build Info'}
                </button>
              </div>
              
              <button
                onClick={() => loadExtensions()}
                className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded transition-colors text-sm font-medium"
              >
                🔄 Refresh Status
              </button>
              
              {testResult && testResult.extension === ext.name && (
                <div className={`p-3 rounded text-sm ${
                  testResult.success 
                    ? 'bg-green-900/20 border border-green-700 text-green-300'
                    : 'bg-yellow-900/20 border border-yellow-700 text-yellow-300'
                }`}>
                  <pre className="whitespace-pre-wrap text-xs">{testResult.message}</pre>
                </div>
              )}
              
              {buildResult && buildResult.extension === ext.name && (
                <div className={`p-3 rounded text-sm ${
                  buildResult.success 
                    ? 'bg-blue-900/20 border border-blue-700 text-blue-300'
                    : 'bg-red-900/20 border border-red-700 text-red-300'
                }`}>
                  <pre className="whitespace-pre-wrap text-xs">{buildResult.message}</pre>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-blue-400 text-xl">ℹ️</span>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-400">Extensions vs Tools</h4>
            <p className="text-sm text-gray-300 mt-1">
              <strong>Extensions</strong> are server-side modules in <code className="text-cyan-400">extensions/</code> that provide tool implementations.
            </p>
            <p className="text-sm text-gray-300 mt-1">
              <strong>Tools</strong> are individual capabilities registered via manifests in <code className="text-cyan-400">.mcp/tools/</code> and executed by the server.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConnectorsTab() {
  const [connectorInfo, setConnectorInfo] = useState<ConnectorInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const data = await fetchConnectors()
      setConnectorInfo(data)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch connectors:', err)
      setError('Failed to fetch connector information')
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

  if (loading) return <div className="text-center py-8">Loading connectors...</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">MCP Connectors</h2>
        <p className="text-sm text-gray-400 mt-1">Communication transports and connection management</p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Virtual Connector Card */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-cyan-400">Virtual Connector</h3>
            <p className="text-sm text-gray-400 mt-1">{connectorInfo?.virtual_connector.description}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{connectorInfo?.virtual_connector.active_connections || 0}</div>
            <div className="text-xs text-gray-400">active connections</div>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={handleConnect} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded transition-colors text-sm">
            Connect
          </button>
          <button onClick={handleDisconnect} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-sm">
            Disconnect
          </button>
        </div>
      </div>

      {/* Transports Grid */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Available Transports</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {connectorInfo?.transports.map((transport) => (
            <div key={transport.name} className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-white">{transport.type}</h4>
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  transport.enabled ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'
                }`}>
                  {transport.enabled ? 'enabled' : 'disabled'}
                </span>
              </div>
              <p className="text-sm text-gray-400 mb-3">{transport.description}</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Protocol:</span>
                  <span className="text-white font-mono">{transport.name}</span>
                </div>
                {transport.port && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Port:</span>
                    <span className="text-white font-mono">{transport.port}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active Connections */}
      {connectorInfo && connectorInfo.connections.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Active Connections</h3>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Connected</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {connectorInfo.connections.map((conn) => (
                  <tr key={conn.id}>
                    <td className="px-6 py-4 text-sm font-mono text-cyan-400">{conn.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-300">{conn.type}</td>
                    <td className="px-6 py-4 text-sm text-gray-300">{new Date(conn.connected_at).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-300">{new Date(conn.last_activity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-blue-400 text-xl">ℹ️</span>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-400">Unified Server Port</h4>
            <p className="text-sm text-gray-300 mt-1">
              All transports operate on port <code className="text-cyan-400">{connectorInfo?.server_port}</code>. The Virtual Connector brokers in-process IDE connections.
            </p>
            <p className="text-sm text-gray-300 mt-1">
              Configure transports in <code className="text-cyan-400">.mcp/config.json</code> under the <code>transports</code> array.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function TelemetryTab({ serverStatus }: { serverStatus: ServerStatus | null }) {
  const metricsUrl = '/metrics'
  const [metrics, setMetrics] = useState<{ name: string; value: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        const res = await fetch('/metrics')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const text = await res.text()
        const rows: { name: string; value: string }[] = []
        for (const line of text.split('\n')) {
          const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\s+(\d+(?:\.\d+)?)/)
          if (m) rows.push({ name: m[1], value: m[2] })
        }
        setMetrics(rows)
        setError(null)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    loadMetrics()
    const id = setInterval(loadMetrics, 10000)
    return () => clearInterval(id)
  }, [])

  const otelUrl = serverStatus?.observability?.otel_exporter || 'not configured'

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
          <div className="mt-4">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Current Metrics</h4>
            {loading && <div className="text-sm text-gray-400">Loading metrics...</div>}
            {error && <div className="text-sm text-red-400">{error}</div>}
            {!loading && !error && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left py-2">Name</th>
                      <th className="text-left py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {metrics.map((m) => (
                      <tr key={`${m.name}-${m.value}`}>
                        <td className="py-2 text-white font-mono">{m.name}</td>
                        <td className="py-2 text-gray-300 font-mono">{m.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="font-semibold mb-4">OpenTelemetry</h3>
          <p className="text-sm text-gray-400 mb-4">
            Exporter: {otelUrl === 'not configured' ? (
              <code className="text-gray-500">{otelUrl}</code>
            ) : (
              <a
                href={otelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 underline"
              >
                {otelUrl}
              </a>
            )}
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
