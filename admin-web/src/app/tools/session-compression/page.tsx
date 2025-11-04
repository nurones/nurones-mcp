'use client'

import { useState } from 'react'

export default function SessionCompressionPage() {
  const [source, setSource] = useState<'paste' | 'file'>('file')
  const [filePath, setFilePath] = useState('/tmp/test-session.md')
  const [pasteContent, setPasteContent] = useState('')
  const [charLimit, setCharLimit] = useState(500)
  const [preserveMarkup, setPreserveMarkup] = useState(false)
  const [dryRun, setDryRun] = useState(true)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const executeCompression = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const sources = source === 'file' 
        ? [{ kind: 'file', path: filePath }]
        : [{ kind: 'paste', content: pasteContent }]

      const response = await fetch('/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'session.compress',
          input: {
            sources,
            char_limit: charLimit,
            preserve_markup: preserveMarkup,
            dry_run: dryRun,
          },
          context: {
            reason_trace_id: `ui-session-compress-${Date.now()}`,
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Session Compression</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Compress session transcripts into digestible summaries with timeline management
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Panel */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Configuration</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Source Type
              </label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={source === 'file'}
                    onChange={() => setSource('file')}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">File</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={source === 'paste'}
                    onChange={() => setSource('paste')}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Paste</span>
                </label>
              </div>
            </div>

            {source === 'file' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  File Path
                </label>
                <input
                  type="text"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                  placeholder="/tmp/session.md"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Paste Content
                </label>
                <textarea
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white font-mono text-sm"
                  placeholder="Paste your session content here..."
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Character Limit: {charLimit}
              </label>
              <input
                type="range"
                min="100"
                max="5000"
                step="100"
                value={charLimit}
                onChange={(e) => setCharLimit(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={preserveMarkup}
                  onChange={(e) => setPreserveMarkup(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Preserve Markdown</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Dry Run (no write)</span>
              </label>
            </div>

            <button
              onClick={executeCompression}
              disabled={loading}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md font-medium transition-colors"
            >
              {loading ? 'Compressing...' : 'Compress Session'}
            </button>
          </div>

          {/* Output Panel */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Result</h2>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-4">
                <h3 className="font-semibold text-red-800 dark:text-red-300 mb-2">Error</h3>
                <pre className="text-sm text-red-700 dark:text-red-200 whitespace-pre-wrap">{error}</pre>
              </div>
            )}

            {result && result.success && (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-green-800 dark:text-green-300">
                      ✅ Success
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      ({result.execution_time}ms)
                    </span>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-200">
                    Processed: {result.output.report.processed} | 
                    Written: {result.output.report.written} | 
                    Dry Run: {result.output.report.dry_run ? 'Yes' : 'No'}
                  </p>
                </div>

                {result.output.summaries.map((summary: any, idx: number) => (
                  <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      {summary.session_id}
                    </h3>
                    <div className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
                      <p><strong>UTC:</strong> {summary.session_timestamp_utc}</p>
                      <p><strong>Adelaide:</strong> {summary.local_timestamp_adelaide}</p>
                      <p><strong>Source:</strong> {summary.inferred_timestamp_source}</p>
                      <p><strong>Characters:</strong> {summary.char_count}</p>
                      {summary.path && <p><strong>Path:</strong> {summary.path}</p>}
                    </div>
                    <div className="mt-3">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Digest Preview:</h4>
                      <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto max-h-60 overflow-y-auto">
                        {summary.digest}
                      </pre>
                    </div>
                  </div>
                ))}

                {result.output.index_path && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <p><strong>Index:</strong> {result.output.index_path}</p>
                    <p><strong>Timeline:</strong> {result.output.timeline_path}</p>
                  </div>
                )}
              </div>
            )}

            {!result && !error && (
              <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                Configure and compress a session to see results
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
