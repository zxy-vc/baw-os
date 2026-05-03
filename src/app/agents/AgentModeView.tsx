// BaW OS — Modo Agent · Layout 3-paneles (Bloomberg/Linear-style)
// Densidad alta · exception-first · misma data que Modo Human, distinto lenguaje visual.
// Server component. El switch en sí es client-side (ViewModeSwitch).

import Link from 'next/link'
import ViewModeSwitch from '@/components/ViewModeSwitch'
import ApprovalQueueClient, { type ApprovalRow } from './ApprovalQueueClient'

interface AgentRow {
  id: string
  display_name: string
  full_name: string
  family: string
  domain: string
  description: string | null
  capability_level: number
  feedback_level: number
  status: string
  is_shared_zxy: boolean
  autonomy_level?: number // policy efectiva por org
}

interface AgentRunRow {
  id: string
  agent_id: string
  triggered_by: string
  status: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  metrics: {
    actions_total?: number
    actions_ok?: number
    actions_failed?: number
    actions_skipped?: number
  } | null
  error: string | null
}

interface Props {
  agents: AgentRow[]
  runs: AgentRunRow[]
  approvals: ApprovalRow[]
  orgId: string | null
  viewMode: 'human' | 'agent'
}

const FAMILY_LABEL: Record<string, string> = {
  'baw-coord': 'BaW',
  'ops-core': 'Ops',
  experiencia: 'Exp',
  inteligencia: 'Int',
  'third-party': '3P',
  'pm-ops': 'Ops',
  'zxy-shared': '3P',
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function autonomyBadge(level: number | undefined): { label: string; bg: string; fg: string } {
  const lv = level ?? 1
  switch (lv) {
    case 0:
      return {
        label: 'L0',
        bg: 'var(--baw-danger-bg-soft)',
        fg: 'var(--baw-danger-fg)',
      }
    case 1:
      return {
        label: 'L1',
        bg: 'var(--baw-neutral-bg-soft)',
        fg: 'var(--baw-neutral-fg)',
      }
    case 2:
      return {
        label: 'L2',
        bg: 'var(--baw-info-bg-soft)',
        fg: 'var(--baw-info-fg)',
      }
    case 3:
      return {
        label: 'L3',
        bg: 'var(--baw-warning-bg-soft)',
        fg: 'var(--baw-warning-fg)',
      }
    case 4:
      return {
        label: 'L4',
        bg: 'var(--baw-success-bg-soft)',
        fg: 'var(--baw-success-fg)',
      }
    default:
      return {
        label: `L${lv}`,
        bg: 'var(--baw-neutral-bg-soft)',
        fg: 'var(--baw-neutral-fg)',
      }
  }
}

export default function AgentModeView({ agents, runs, approvals, orgId, viewMode }: Props) {
  // Exceptions = runs failed o partial recientes
  const exceptions = runs.filter(
    (r) => r.status === 'failed' || r.status === 'partial'
  )

  // Activity timeline = runs ordenados (ya viene desc)
  const timeline = runs.slice(0, 30)

  // Roster ordenado: third-party primero (ZXY), luego baw-coord, luego escuadrones
  const rosterOrder = ['third-party', 'baw-coord', 'ops-core', 'experiencia', 'inteligencia']
  const rosterSorted = [...agents].sort((a, b) => {
    const ai = rosterOrder.indexOf(a.family)
    const bi = rosterOrder.indexOf(b.family)
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    return a.display_name.localeCompare(b.display_name)
  })

  // Stats agregados
  const totalAgents = agents.length
  const live = agents.filter((a) => a.status === 'live').length
  const planned = agents.filter((a) => a.status === 'planned').length
  const last24h = runs.filter(
    (r) => Date.now() - new Date(r.started_at).getTime() < 24 * 3600_000
  )
  const succeededLast24 = last24h.filter((r) => r.status === 'succeeded').length
  const failedLast24 = last24h.filter((r) => r.status === 'failed').length

  return (
    <div
      className="space-y-3"
      style={{ fontFamily: 'var(--font-mono, ui-monospace)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-[18px] tracking-tight"
            style={{ color: 'var(--baw-text)' }}
          >
            AGENT CONSOLE
          </h1>
          <p className="text-[10px]" style={{ color: 'var(--baw-muted)' }}>
            {totalAgents} agents · {live} live · {planned} planned · last 24h:{' '}
            <span style={{ color: 'var(--baw-success-fg)' }}>{succeededLast24}✓</span> ·{' '}
            <span style={{ color: 'var(--baw-danger-fg)' }}>{failedLast24}✗</span>
          </p>
        </div>
        <ViewModeSwitch initialMode={viewMode} size="sm" />
      </div>

      {/* Exceptions bar */}
      {exceptions.length > 0 ? (
        <div
          className="rounded-md border-l-2 p-2 text-[11px]"
          style={{
            borderLeftColor: 'var(--baw-danger-fg)',
            backgroundColor: 'var(--baw-danger-bg-soft)',
          }}
        >
          <div
            className="text-[10px] uppercase tracking-wider mb-1"
            style={{ color: 'var(--baw-danger-fg)' }}
          >
            EXCEPTIONS · {exceptions.length}
          </div>
          {exceptions.slice(0, 3).map((r) => (
            <div key={r.id} className="flex justify-between gap-3 py-0.5">
              <span style={{ color: 'var(--baw-text)' }}>
                <span className="font-semibold">{r.agent_id}</span>{' '}
                <span style={{ color: 'var(--baw-muted)' }}>· {r.status}</span>
              </span>
              <span
                className="truncate"
                style={{ color: 'var(--baw-muted)', maxWidth: '60%' }}
              >
                {r.error || '—'}
              </span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--baw-muted)' }}
              >
                {fmtRelative(r.started_at)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="rounded-md p-2 text-[11px]"
          style={{
            backgroundColor: 'var(--baw-success-bg-soft)',
            color: 'var(--baw-success-fg)',
          }}
        >
          <span className="uppercase tracking-wider">All systems normal</span>
        </div>
      )}

      {/* 3-panel grid */}
      <div className="grid grid-cols-12 gap-3">
        {/* Roster sidebar */}
        <aside
          className="col-span-12 md:col-span-3 rounded-md p-2"
          style={{
            backgroundColor: 'var(--baw-surface)',
            border: '1px solid var(--baw-border)',
          }}
        >
          <div
            className="text-[10px] uppercase tracking-wider mb-2 pb-1"
            style={{
              color: 'var(--baw-muted)',
              borderBottom: '1px solid var(--baw-border)',
            }}
          >
            ROSTER
          </div>
          <div className="space-y-0.5">
            {rosterSorted.map((a) => {
              const al = autonomyBadge(a.autonomy_level)
              return (
                <Link
                  key={a.id}
                  href={`/agents/${a.id}/policies`}
                  className="flex items-center justify-between gap-2 px-1.5 py-1 rounded text-[11px] hover:bg-black/5"
                  style={{ color: 'var(--baw-text)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-[9px] px-1 py-0.5 rounded shrink-0"
                      style={{
                        backgroundColor: 'var(--baw-neutral-bg-soft)',
                        color: 'var(--baw-neutral-fg)',
                      }}
                    >
                      {FAMILY_LABEL[a.family] || '?'}
                    </span>
                    <span className="truncate">{a.display_name}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <span
                      className="text-[9px] tabular-nums px-1 rounded"
                      style={{ backgroundColor: al.bg, color: al.fg }}
                      title={`Autonomy ${al.label}`}
                    >
                      {al.label}
                    </span>
                    <span
                      className="text-[9px] tabular-nums"
                      style={{
                        color:
                          a.status === 'live'
                            ? 'var(--baw-success-fg)'
                            : a.status === 'beta'
                              ? 'var(--baw-agent-fg)'
                              : 'var(--baw-muted)',
                      }}
                    >
                      {a.status}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </aside>

        {/* Activity timeline */}
        <main
          className="col-span-12 md:col-span-6 rounded-md p-2"
          style={{
            backgroundColor: 'var(--baw-surface)',
            border: '1px solid var(--baw-border)',
          }}
        >
          <div
            className="text-[10px] uppercase tracking-wider mb-2 pb-1 flex justify-between"
            style={{
              color: 'var(--baw-muted)',
              borderBottom: '1px solid var(--baw-border)',
            }}
          >
            <span>ACTIVITY · {timeline.length}</span>
            {orgId && (
              <span className="tabular-nums" style={{ color: 'var(--baw-faint)' }}>
                org {orgId.slice(0, 8)}
              </span>
            )}
          </div>
          {timeline.length === 0 ? (
            <div
              className="text-[11px] py-8 text-center"
              style={{ color: 'var(--baw-muted)' }}
            >
              {orgId ? 'No runs yet. Trigger one from Human mode.' : 'Login required.'}
            </div>
          ) : (
            <div className="space-y-0.5 text-[11px]">
              {timeline.map((r) => {
                const m = r.metrics || {}
                const statusColor =
                  r.status === 'succeeded'
                    ? 'var(--baw-success-fg)'
                    : r.status === 'failed'
                      ? 'var(--baw-danger-fg)'
                      : r.status === 'partial'
                        ? 'var(--baw-warning-fg)'
                        : r.status === 'running'
                          ? 'var(--baw-info-fg)'
                          : 'var(--baw-muted)'
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 py-0.5 tabular-nums"
                  >
                    <span
                      className="shrink-0 w-[60px]"
                      style={{ color: 'var(--baw-muted)' }}
                    >
                      {fmtTime(r.started_at)}
                    </span>
                    <span
                      className="shrink-0 w-[100px] truncate"
                      style={{ color: 'var(--baw-text)' }}
                    >
                      {r.agent_id}
                    </span>
                    <span
                      className="shrink-0 w-[60px]"
                      style={{ color: 'var(--baw-muted)' }}
                    >
                      {r.triggered_by}
                    </span>
                    <span
                      className="shrink-0 w-[70px] uppercase text-[10px]"
                      style={{ color: statusColor }}
                    >
                      {r.status}
                    </span>
                    <span
                      className="shrink-0"
                      style={{ color: 'var(--baw-muted)' }}
                    >
                      {(m.actions_ok || 0)}✓·{(m.actions_failed || 0)}✗
                    </span>
                    <span
                      className="ml-auto shrink-0"
                      style={{ color: 'var(--baw-faint)' }}
                    >
                      {r.duration_ms != null ? `${r.duration_ms}ms` : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </main>

        {/* Approval queue (placeholder Fase 4) */}
        <aside
          className="col-span-12 md:col-span-3 rounded-md p-2"
          style={{
            backgroundColor: 'var(--baw-surface)',
            border: '1px solid var(--baw-border)',
          }}
        >
          <div
            className="text-[10px] uppercase tracking-wider mb-2 pb-1 flex justify-between"
            style={{
              color: 'var(--baw-muted)',
              borderBottom: '1px solid var(--baw-border)',
            }}
          >
            <span>APPROVAL QUEUE</span>
            <span
              className="tabular-nums"
              style={{
                color:
                  approvals.length > 0
                    ? 'var(--baw-warning-fg)'
                    : 'var(--baw-faint)',
              }}
            >
              {approvals.length}
            </span>
          </div>
          <ApprovalQueueClient approvals={approvals} />
        </aside>
      </div>

      <div className="text-[10px]" style={{ color: 'var(--baw-faint)' }}>
        Modo Agent · densidad alta · exception-first · ver{' '}
        <Link href="/docs" className="underline">
          AGENTIC_PRINCIPLES.md
        </Link>{' '}
        para principios.
      </div>
    </div>
  )
}
