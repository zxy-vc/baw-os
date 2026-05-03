'use client'

// BaW OS — Cliente para gestionar credenciales de un agente
// Maneja: listar, crear (mostrar key plana 1 vez), revocar.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface CredentialRow {
  id: string
  agent_id: string
  agent_name?: string
  label: string
  api_key_prefix: string
  scopes: string[]
  status: string
  rate_limit_tier: string
  expires_at: string | null
  last_used_at: string | null
  created_at: string
  revoked_at: string | null
}

interface Props {
  agentId: string
  agentName: string
  initialCredentials: CredentialRow[]
}

const COMMON_SCOPES = [
  'units:read',
  'units:write',
  'reservations:read',
  'reservations:write',
  'payments:read',
  'payments:trigger',
  'contracts:read',
  'contracts:write',
  'incidents:read',
  'incidents:write',
  'tasks:read',
  'tasks:write',
  'agents:run',
  'runs:read',
  'insights:read',
  'messages:send',
  'messages:read',
]

export default function CredentialsManager({
  agentId,
  agentName,
  initialCredentials,
}: Props) {
  const router = useRouter()
  const [credentials, setCredentials] = useState<CredentialRow[]>(initialCredentials)
  const [showForm, setShowForm] = useState(false)
  const [label, setLabel] = useState('prod')
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set())
  const [rateLimitTier, setRateLimitTier] = useState<'standard' | 'elevated' | 'unlimited'>(
    'standard'
  )
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealedKey, setRevealedKey] = useState<{
    plain: string
    label: string
  } | null>(null)

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev)
      if (next.has(scope)) next.delete(scope)
      else next.add(scope)
      return next
    })
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      const res = await fetch(`/api/admin/agents/${agentId}/credentials`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          scopes: Array.from(selectedScopes),
          rate_limit_tier: rateLimitTier,
          expires_in_days: expiresInDays,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || `HTTP ${res.status}`)
        return
      }
      setRevealedKey({ plain: json.data.api_key, label: json.data.label })
      setCredentials((prev) => [
        {
          id: json.data.id,
          agent_id: agentId,
          agent_name: agentName,
          label: json.data.label,
          api_key_prefix: json.data.api_key_prefix,
          scopes: json.data.scopes,
          status: json.data.status,
          rate_limit_tier: json.data.rate_limit_tier,
          expires_at: json.data.expires_at,
          last_used_at: null,
          created_at: json.data.created_at,
          revoked_at: null,
        },
        ...prev,
      ])
      setShowForm(false)
      setLabel('prod')
      setSelectedScopes(new Set())
      setRateLimitTier('standard')
      setExpiresInDays(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (credentialId: string) => {
    if (!confirm('¿Revocar esta credencial? Esta acción no se puede deshacer.')) return
    try {
      const res = await fetch(
        `/api/admin/agents/${agentId}/credentials?credential_id=${credentialId}`,
        { method: 'DELETE' }
      )
      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || `HTTP ${res.status}`)
        return
      }
      router.refresh()
      setCredentials((prev) =>
        prev.map((c) =>
          c.id === credentialId
            ? { ...c, status: 'revoked', revoked_at: new Date().toISOString() }
            : c
        )
      )
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Network error')
    }
  }

  return (
    <div className="space-y-6">
      {revealedKey && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">Credencial creada: {revealedKey.label}</p>
          <p className="mt-2 text-sm text-amber-800">
            Esta es la única vez que verás la key completa. Cópiala ahora — no se puede recuperar
            después.
          </p>
          <pre className="mt-3 overflow-x-auto rounded border border-amber-300 bg-white p-3 font-mono text-sm">
            {revealedKey.plain}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(revealedKey.plain)}
            className="mt-2 rounded bg-amber-900 px-3 py-1 text-sm text-white hover:bg-amber-950"
          >
            Copiar al portapapeles
          </button>
          <button
            onClick={() => setRevealedKey(null)}
            className="ml-2 rounded border border-amber-300 px-3 py-1 text-sm text-amber-900 hover:bg-amber-100"
          >
            Ya la guardé
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Credenciales activas</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800"
          >
            + Nueva credencial
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-4 rounded-lg border bg-white p-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={32}
              required
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="prod, staging, dev-local"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Scopes</label>
            <div className="grid grid-cols-2 gap-1 text-sm md:grid-cols-3">
              {COMMON_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedScopes.has(scope)}
                    onChange={() => toggleScope(scope)}
                  />
                  <span className="font-mono text-xs">{scope}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Rate limit tier</label>
              <select
                value={rateLimitTier}
                onChange={(e) =>
                  setRateLimitTier(e.target.value as 'standard' | 'elevated' | 'unlimited')
                }
                className="w-full rounded border px-3 py-2 text-sm"
              >
                <option value="standard">standard</option>
                <option value="elevated">elevated</option>
                <option value="unlimited">unlimited</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Expira en (días)</label>
              <input
                type="number"
                min={1}
                max={3650}
                value={expiresInDays ?? ''}
                onChange={(e) =>
                  setExpiresInDays(e.target.value ? parseInt(e.target.value, 10) : null)
                }
                placeholder="vacío = no expira"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {creating ? 'Creando…' : 'Crear credencial'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setError(null)
              }}
              className="rounded border px-4 py-2 text-sm hover:bg-neutral-100"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left">
            <tr>
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2">Prefix</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Scopes</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2">Expires</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {credentials.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-neutral-500">
                  Sin credenciales todavía.
                </td>
              </tr>
            )}
            {credentials.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2 font-medium">{c.label}</td>
                <td className="px-3 py-2 font-mono text-xs">{c.api_key_prefix}…</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      c.status === 'active'
                        ? 'bg-green-100 text-green-900'
                        : c.status === 'revoked'
                          ? 'bg-red-100 text-red-900'
                          : 'bg-neutral-100 text-neutral-700'
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {c.scopes.length === 0 ? (
                    <span className="text-neutral-500">—</span>
                  ) : (
                    <span className="font-mono">
                      {c.scopes.slice(0, 2).join(', ')}
                      {c.scopes.length > 2 && ` +${c.scopes.length - 2}`}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{c.rate_limit_tier}</td>
                <td className="px-3 py-2 text-xs">
                  {c.last_used_at
                    ? new Date(c.last_used_at).toLocaleString()
                    : <span className="text-neutral-500">never</span>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {c.expires_at
                    ? new Date(c.expires_at).toLocaleDateString()
                    : <span className="text-neutral-500">no expira</span>}
                </td>
                <td className="px-3 py-2">
                  {c.status === 'active' && (
                    <button
                      onClick={() => handleRevoke(c.id)}
                      className="text-xs text-red-700 hover:underline"
                    >
                      Revocar
                    </button>
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
