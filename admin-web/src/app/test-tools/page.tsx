'use client'

import { useState } from 'react'

export default function TestToolsPage() {
  const [selectedTool, setSelectedTool] = useState('fs.read')
  const [toolInput, setToolInput] = useState('{"path": "/tmp/test.txt"}')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tools = [
    'fs.read',
    'fs.write',
    'fs.list',
    'db.query',
    'http.request',
    'telemetry.push',
  ]

  const executeTool = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const input = JSON.parse(toolInput)
      const response = await fetch('/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: selectedTool,
          input,
          context: {
            reason_trace_id: `admin-test-${Date.now()}`,
            tenant_id: 'default',
            stage: 'dev',
            risk_level: 0,
            ts: new Date().toISOString(),
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Tool Execution Test Lab</h2>
        <p className="text-sm text-gray-400 mt-1">Test and execute MCP tools with custom inputs</p>
      </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Panel */}
          <div className="bg-gray-800 rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold mb-4">Execute Tool</h2>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Select Tool
              </label>
              <select
                value={selectedTool}
                onChange={(e) => setSelectedTool(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              >
                {tools.map((tool) => (
                  <option key={tool} value={tool}>
                    {tool}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Input (JSON)
              </label>
              <textarea
                value={toolInput}
                onChange={(e) => setToolInput(e.target.value)}
                rows={10}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white font-mono text-sm"
                placeholder='{"key": "value"}'
              />
            </div>

            <button
              onClick={executeTool}
              disabled={loading}
              className="w-full px-6 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 rounded font-medium transition-colors"
            >
              {loading ? 'Executing...' : 'Execute Tool'}
            </button>
          </div>

          {/* Output Panel */}
          <div className="bg-gray-800 rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold mb-4">Result</h2>

            {error && (
              <div className="bg-red-900 border border-red-700 rounded p-4">
                <h3 className="font-semibold text-red-300 mb-2">Error</h3>
                <pre className="text-sm text-red-200 whitespace-pre-wrap break-words overflow-x-auto">{error}</pre>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <div className={`p-4 rounded ${result.success ? 'bg-green-900 border border-green-700' : 'bg-red-900 border border-red-700'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`font-semibold ${result.success ? 'text-green-300' : 'text-red-300'}`}>
                      {result.success ? '✅ Success' : '❌ Failed'}
                    </span>
                    <span className="text-sm text-gray-400">
                      ({result.execution_time}ms)
                    </span>
                  </div>
                </div>

                {result.output && (
                  <div>
                    <h3 className="font-semibold text-gray-300 mb-2">Output:</h3>
                    <pre className="bg-gray-900 p-4 rounded text-sm text-gray-300 overflow-x-auto whitespace-pre-wrap break-words max-h-96">
                      {JSON.stringify(result.output, null, 2)}
                    </pre>
                  </div>
                )}

                {result.error && (
                  <div>
                    <h3 className="font-semibold text-red-300 mb-2">Error:</h3>
                    <pre className="bg-gray-900 p-4 rounded text-sm text-red-200 whitespace-pre-wrap break-words overflow-x-auto max-h-96">
                      {result.error}
                    </pre>
                  </div>
                )}

                {result.context_used && (
                  <div>
                    <h3 className="font-semibold text-gray-300 mb-2">Context Used:</h3>
                    <pre className="bg-gray-900 p-4 rounded text-sm text-gray-400 overflow-x-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(result.context_used, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {!result && !error && (
              <div className="text-center text-gray-500 py-12">
                Execute a tool to see results
              </div>
            )}
          </div>
        </div>

      {/* Quick Test Examples */}
      <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Test Examples</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => {
                setSelectedTool('fs.read')
                setToolInput('{"path": "/tmp/test.txt"}')
              }}
              className="p-4 bg-gray-700 hover:bg-gray-600 rounded text-left transition-colors"
            >
              <div className="font-medium text-cyan-400">Read Test File (WASI)</div>
              <div className="text-sm text-gray-400 mt-1">fs.read - Read /tmp/test.txt via WASM</div>
            </button>

            <button
              onClick={() => {
                setSelectedTool('fs.read')
                setToolInput('{"path": "/contracts/COIDE-CCC-001/docs/README-COIDE-CCC-001.md"}')
              }}
              className="p-4 bg-gray-700 hover:bg-gray-600 rounded text-left transition-colors"
            >
              <div className="font-medium text-cyan-400">Read Contracts File</div>
              <div className="text-sm text-gray-400 mt-1">fs.read - Read from /contracts path</div>
            </button>

            <button
              onClick={() => {
                setSelectedTool('fs.list')
                setToolInput('{"path": "/workspace"}')
              }}
              className="p-4 bg-gray-700 hover:bg-gray-600 rounded text-left transition-colors"
            >
              <div className="font-medium text-cyan-400">List Directory</div>
              <div className="text-sm text-gray-400 mt-1">fs.list - List workspace files</div>
            </button>

            <button
              onClick={() => {
                setSelectedTool('fs.list')
                setToolInput('{"path": "/contracts/COIDE-CCC-001/docs"}')
              }}
              className="p-4 bg-gray-700 hover:bg-gray-600 rounded text-left transition-colors"
            >
              <div className="font-medium text-cyan-400">List Contracts Directory</div>
              <div className="text-sm text-gray-400 mt-1">fs.list - List files in contracts docs</div>
            </button>

            <button
              onClick={() => {
                setSelectedTool('telemetry.push')
                setToolInput('{"event": "test", "data": {"test": true}}')
              }}
              className="p-4 bg-gray-700 hover:bg-gray-600 rounded text-left transition-colors"
            >
              <div className="font-medium text-cyan-400">Send Telemetry</div>
              <div className="text-sm text-gray-400 mt-1">telemetry.push - Test event</div>
            </button>

            <button
              onClick={() => {
                setSelectedTool('db.query')
                setToolInput('{"query": "SELECT 1"}')
              }}
              className="p-4 bg-gray-700 hover:bg-gray-600 rounded text-left transition-colors"
            >
              <div className="font-medium text-cyan-400">Database Query</div>
              <div className="text-sm text-gray-400 mt-1">db.query - Simple test query</div>
            </button>
          </div>
        </div>

      {/* Help Section */}
      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <span className="text-blue-400 text-xl">ℹ️</span>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-400 mb-2">Path Resolution</h4>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>• Use <code className="text-cyan-400">/contracts/...</code> for files in the contracts directory</li>
              <li>• Use <code className="text-cyan-400">/tmp/...</code> for temporary files</li>
              <li>• Use <code className="text-cyan-400">/workspace/...</code> for workspace files</li>
              <li>• Wildcards (*.md) are NOT supported - use exact filenames</li>
              <li>• For multiple files, use fs.list first, then read individual files</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
