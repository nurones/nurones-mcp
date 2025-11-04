"use client";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [port, setPort] = useState<number>(4050);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings/server")
      .then(r => r.json())
      .then(d => setPort(d.port ?? 4050))
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setMsg("");
    
    if (port < 1024 || port > 65535) {
      setMsg("Port must be 1024-65535");
      setSaving(false);
      return;
    }

    const res = await fetch("/api/settings/server", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port })
    });

    setSaving(false);

    if (res.ok) {
      setMsg("✓ Saved to .mcp/config.json. Restart server to apply new port.");
    } else {
      setMsg("❌ Save failed");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Server Settings</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Configure the unified MCP server port (Admin Web UI + REST API)
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
          <div>
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                HTTP Server Port
              </span>
              <input
                className="mt-1 w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                type="number"
                value={port}
                onChange={e => setPort(parseInt(e.target.value || "0"))}
                min="1024"
                max="65535"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Default: 4050 | Valid range: 1024–65535
              </p>
            </label>
          </div>

          <div>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-md bg-black dark:bg-blue-600 text-white hover:bg-gray-800 dark:hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Configuration"}
            </button>
          </div>

          {msg && (
            <div className={`p-4 rounded-md ${
              msg.includes("✓") 
                ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300" 
                : "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300"
            }`}>
              <p className="text-sm">{msg}</p>
            </div>
          )}

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Current Unified Server
            </h3>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• <strong>Admin Web UI:</strong> http://localhost:{port}</li>
              <li>• <strong>REST API:</strong> http://localhost:{port}/api/*</li>
              <li>• <strong>Metrics:</strong> http://localhost:{port}/metrics</li>
              <li>• <strong>Virtual Connector:</strong> http://localhost:{port}/api/connector/virtual/health</li>
            </ul>
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              ⚠️ Important Notes
            </h3>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Changes are saved immediately to <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">.mcp/config.json</code></li>
              <li>• <strong>Server restart required</strong> to bind to the new port</li>
              <li>• Run: <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">./start-services.sh</code> to restart</li>
              <li>• All services (Admin UI + API) run on a single port</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
