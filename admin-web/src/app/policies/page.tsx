'use client'

import { useState, useEffect } from 'react'

interface Policies {
  roles: Record<string, string[]>
  users: Record<string, string>
  fs_allowlist: string[]
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policies | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Form state
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleTools, setNewRoleTools] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserRole, setNewUserRole] = useState('')
  const [newAllowPath, setNewAllowPath] = useState('')

  useEffect(() => {
    fetchPolicies()
  }, [])

  const fetchPolicies = async () => {
    try {
      const response = await fetch('/api/policies')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setPolicies(data)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const savePolicies = async () => {
    if (!policies) return

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch('/api/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policies),
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const addRole = () => {
    if (!policies || !newRoleName || !newRoleTools) return
    
    const tools = newRoleTools.split(',').map(t => t.trim()).filter(Boolean)
    setPolicies({
      ...policies,
      roles: { ...policies.roles, [newRoleName]: tools }
    })
    setNewRoleName('')
    setNewRoleTools('')
  }

  const removeRole = (roleName: string) => {
    if (!policies) return
    const { [roleName]: _, ...rest } = policies.roles
    setPolicies({ ...policies, roles: rest })
  }

  const addUser = () => {
    if (!policies || !newUserName || !newUserRole) return
    
    setPolicies({
      ...policies,
      users: { ...policies.users, [newUserName]: newUserRole }
    })
    setNewUserName('')
    setNewUserRole('')
  }

  const removeUser = (userName: string) => {
    if (!policies) return
    const { [userName]: _, ...rest } = policies.users
    setPolicies({ ...policies, users: rest })
  }

  const addAllowPath = () => {
    if (!policies || !newAllowPath) return
    
    if (!policies.fs_allowlist.includes(newAllowPath)) {
      setPolicies({
        ...policies,
        fs_allowlist: [...policies.fs_allowlist, newAllowPath]
      })
    }
    setNewAllowPath('')
  }

  const removeAllowPath = (path: string) => {
    if (!policies) return
    setPolicies({
      ...policies,
      fs_allowlist: policies.fs_allowlist.filter(p => p !== path)
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Loading policies...</div>
      </div>
    )
  }

  if (!policies) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-500">Failed to load policies: {error}</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Configure Policies</h1>
        <button
          onClick={savePolicies}
          disabled={saving}
          className="px-4 py-2 rounded bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Policies'}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded bg-red-900/30 border border-red-700 text-red-400">
          Error: {error}
        </div>
      )}

      {success && (
        <div className="p-4 rounded bg-green-900/30 border border-green-700 text-green-400">
          Policies saved successfully!
        </div>
      )}

      {/* Roles Section */}
      <div className="p-4 rounded bg-gray-900 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">Roles & Permissions</h2>
        <div className="space-y-3">
          {Object.entries(policies.roles).map(([roleName, tools]) => (
            <div key={roleName} className="flex items-start justify-between p-3 rounded bg-gray-800">
              <div className="flex-1">
                <div className="font-medium text-white">{roleName}</div>
                <div className="text-sm text-gray-400 mt-1">
                  Tools: {tools.join(', ')}
                </div>
              </div>
              <button
                onClick={() => removeRole(roleName)}
                className="px-3 py-1 text-sm rounded bg-red-600 text-white hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            placeholder="Role name (e.g., developer)"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            className="flex-1 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white placeholder-gray-500"
          />
          <input
            type="text"
            placeholder="Tools (comma-separated, e.g., fs.*, db.query)"
            value={newRoleTools}
            onChange={(e) => setNewRoleTools(e.target.value)}
            className="flex-1 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white placeholder-gray-500"
          />
          <button
            onClick={addRole}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Add Role
          </button>
        </div>
      </div>

      {/* Users Section */}
      <div className="p-4 rounded bg-gray-900 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">User Assignments</h2>
        <div className="space-y-2">
          {Object.entries(policies.users).map(([userName, role]) => (
            <div key={userName} className="flex items-center justify-between p-3 rounded bg-gray-800">
              <div className="flex-1">
                <span className="font-medium text-white">{userName}</span>
                <span className="mx-2 text-gray-500">→</span>
                <span className="text-blue-400">{role}</span>
              </div>
              <button
                onClick={() => removeUser(userName)}
                className="px-3 py-1 text-sm rounded bg-red-600 text-white hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            placeholder="User ID (e.g., john.doe)"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            className="flex-1 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white placeholder-gray-500"
          />
          <select
            value={newUserRole}
            onChange={(e) => setNewUserRole(e.target.value)}
            className="px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white"
          >
            <option value="">Select role...</option>
            {Object.keys(policies.roles).map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <button
            onClick={addUser}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Add User
          </button>
        </div>
      </div>

      {/* Filesystem Allowlist Section */}
      <div className="p-4 rounded bg-gray-900 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">Filesystem Allowlist</h2>
        <p className="text-sm text-gray-400 mb-3">
          Only paths in this allowlist can be accessed by fs.* tools
        </p>
        <div className="space-y-2">
          {policies.fs_allowlist.map((path) => (
            <div key={path} className="flex items-center justify-between p-3 rounded bg-gray-800">
              <code className="text-green-400">{path}</code>
              <button
                onClick={() => removeAllowPath(path)}
                className="px-3 py-1 text-sm rounded bg-red-600 text-white hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            placeholder="Directory path (e.g., /workspace/data)"
            value={newAllowPath}
            onChange={(e) => setNewAllowPath(e.target.value)}
            className="flex-1 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white placeholder-gray-500 font-mono"
          />
          <button
            onClick={addAllowPath}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Add Path
          </button>
        </div>
      </div>
    </div>
  )
}
