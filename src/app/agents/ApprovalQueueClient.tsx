'use client'

// BaW OS — Approval Queue (client) usado en Modo Agent.
// Renderiza approvals pendientes y permite grant/deny inline mediante calls a
// /api/admin/approvals/:id/(grant|deny). Usa supabase auth (cookies) en lugar de
// API key porque el revisor es humano.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export interface ApprovalRow {
  id: string
  agent_id: string
  action_type: string
  resource_type: string | null
  reason: string | null
  status: string
  requested_at: string
  expires_at: string
  payload: Record<string, unknown>
}

interface Props {
  approvals: ApprovalRow[]
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtExpiry(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff < 0) return 'expired'
  const h = Math.floor(diff / 3600_000)
  if (h < 1) return `${Math.floor(diff / 60_000)}m left`
  return `${h}h left`
}

export default function ApprovalQueueClient({ approvals }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  async function resolve(id: string, action: 'grant' | 'deny', note?: string) {
    setError(null)
    setActiveId(id)
    try {
      const res = await fetch(`/api/admin/approvals/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_note: note ?? null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error?.message || `${action} failed (${res.status})`)
      }
      startTransition(() => {
        router.refresh()
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error')
    } finally {
      setActiveId(null)
    }
  }

  if (approvals.length === 0) {
    return (
      <div
        className="text-[11px] py-6 text-center"
        style={{ color: 'var(--baw-muted)' }}
      >
        <p>Sin items pendientes.</p>
        <p className="mt-2 text-[10px]" style={{ color: 'var(--baw-faint)' }}>
          Las aprobaciones de agentes aparecen aquí en tiempo real.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error && (
        <div
          className="text-[10px] p-1.5 rounded"
          style={{
            backgroundColor: 'var(--baw-danger-bg-soft)',
            color: 'var(--baw-danger-fg)',
          }}
        >
          {error}
        </div>
      )}
      {approvals.map((a) => {
        const isActive = activeId === a.id || pending
        return (
          <div
            key={a.id}
            className="rounded p-1.5 text-[11px]"
            style={{
              border: '1px solid var(--baw-border)',
              backgroundColor: 'var(--baw-bg)',
            }}
          >
            <div className="flex justify-between items-baseline gap-2">
              <span
                className="font-semibold truncate"
                style={{ color: 'var(--baw-text)' }}
              >
                {a.action_type}
              </span>
              <span
                className="text-[9px] tabular-nums shrink-0"
                style={{ color: 'var(--baw-muted)' }}
              >
                {fmtRelative(a.requested_at)}
              </span>
            </div>
            <div
              className="text-[10px] mt-0.5"
              style={{ color: 'var(--baw-muted)' }}
            >
              <span className="font-mono">{a.agent_id}</span>
              {a.reason ? ` · ${a.reason.slice(0, 60)}` : ''}
            </div>
            <div
              className="text-[9px] mt-0.5"
              style={{ color: 'var(--baw-faint)' }}
            >
              {fmtExpiry(a.expires_at)}
            </div>
            <div className="flex gap-1 mt-1.5">
              <button
                disabled={isActive}
                onClick={() => resolve(a.id, 'grant')}
                className="flex-1 text-[10px] py-1 rounded uppercase tracking-wider disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--baw-success-bg-soft)',
                  color: 'var(--baw-success-fg)',
                }}
              >
                {isActive && activeId === a.id ? '…' : 'Grant'}
              </button>
              <button
                disabled={isActive}
                onClick={() => resolve(a.id, 'deny')}
                className="flex-1 text-[10px] py-1 rounded uppercase tracking-wider disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--baw-danger-bg-soft)',
                  color: 'var(--baw-danger-fg)',
                }}
              >
                Deny
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
