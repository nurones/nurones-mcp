'use client'

import { useState } from 'react'

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-cyan-400">@nurones/mcp</h1>
              <p className="text-sm text-gray-400 mt-1">
                Self-adaptive Model Context Protocol Runtime v0.5
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-sm text-gray-400">Connected</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-800 bg-gray-950">
        <div className="container mx-auto px-6">
          <nav className="flex gap-8">
            {['Dashboard', 'Tools', 'Policies', 'Telemetry', 'Context Monitor'].map((tab) => (
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
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'tools' && <ToolsTab />}
        {activeTab === 'policies' && <PoliciesTab />}
        {activeTab === 'telemetry' && <TelemetryTab />}
        {activeTab === 'context-monitor' && <ContextMonitorTab />}
      </main>
    </div>
  )
}

function DashboardTab() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">System Overview</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="Active Tools"
          value="3"
          status="operational"
          description="fs.read, fs.write, telemetry.push"
        />
        <MetricCard
          title="Context Engine"
          value="ON"
          status="operational"
          description="Autotune: ±10%/day, min confidence: 0.6"
        />
        <MetricCard
          title="Event Throughput"
          value="0 evt/s"
          status="idle"
          description="Ready to process"
        />
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Configuration Profile</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Profile:</span>
            <span className="ml-2 text-white">dev</span>
          </div>
          <div>
            <span className="text-gray-400">Transports:</span>
            <span className="ml-2 text-white">stdio, ws</span>
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
  const tools = [
    { name: 'fs.read', version: '1.0.0', status: 'active', permissions: ['read'] },
    { name: 'fs.write', version: '1.0.0', status: 'active', permissions: ['write'] },
    { name: 'telemetry.push', version: '1.0.0', status: 'active', permissions: ['emit'] },
  ]

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
                Permissions
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
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
                  {tool.permissions.join(', ')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 text-xs font-medium bg-green-900 text-green-300 rounded">
                    {tool.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PoliciesTab() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">RBAC & Safety Policies</h2>
      
      <div className="bg-gray-800 rounded-lg p-6 space-y-4">
        <div>
          <h3 className="font-semibold mb-2">Default Role</h3>
          <p className="text-gray-400">operator</p>
        </div>
        
        <div>
          <h3 className="font-semibold mb-2">Filesystem Allowlist</h3>
          <code className="text-sm text-cyan-400">/workspace, /tmp</code>
        </div>
        
        <div>
          <h3 className="font-semibold mb-2">Context Safety Boundaries</h3>
          <ul className="text-sm text-gray-400 space-y-1">
            <li>• Autotune active only when risk_level = 0 and context_confidence ≥ 0.6</li>
            <li>• Limit automated changes to ±10% per 24 hours</li>
            <li>• Require 2 consecutive successful SLO cycles before persisting baselines</li>
            <li>• Rollback snapshots auto-generated at checkpoints</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function TelemetryTab() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Observability & Telemetry</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="font-semibold mb-4">Prometheus Metrics</h3>
          <p className="text-sm text-gray-400 mb-4">
            Endpoint: <code className="text-cyan-400">http://localhost:9464/metrics</code>
          </p>
          <a
            href="http://localhost:9464/metrics"
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
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span className="text-sm text-gray-400">Connected</span>
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

function ContextMonitorTab() {
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
