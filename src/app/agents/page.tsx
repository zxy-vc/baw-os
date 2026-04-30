// BaW OS — /agents · Catálogo + invocación + runs (S4-3)

import Link from 'next/link'
import { createServiceClient } from '@/lib/api-auth'
import { resolveOrgId } from '@/lib/org-context'
import { listImplementedAgents } from '@/lib/agents/registry'
import AgentRunButton from './AgentRunButton'

export const dynamic = 'force-dynamic'

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
}

interface AgentRunRow {
  id: string
  agent_id: string
  triggered_by: string
  status: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  metrics: { actions_total?: number; actions_ok?: number; actions_failed?: number; actions_skipped?: number } | null
  error: string | null
}

async function loadData() {
  const supabase = createServiceClient()
  let orgId: string | null = null
  try {
    orgId = await resolveOrgId()
  } catch {
    orgId = null
  }

  const { data: agentsData } = await supabase
    .from('agents')
    .select('*')
    .order('family')
    .order('display_name')

  let runs: AgentRunRow[] = []
  if (orgId) {
    const { data: runsData } = await supabase
      .from('agent_runs')
      .select('id, agent_id, triggered_by, status, started_at, finished_at, duration_ms, metrics, error')
      .eq('org_id', orgId)
      .order('started_at', { ascending: false })
      .limit(20)
    runs = (runsData || []) as AgentRunRow[]
  }

  return { agents: (agentsData || []) as AgentRow[], runs, orgId }
}

const FAMILY_LABEL: Record<string, string> = {
  'baw-coord': 'BaW · Coordinador',
  'pm-ops': 'PM Operations',
  'zxy-shared': 'ZXY Shared',
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; fg: string }> = {
    live: { bg: 'rgba(34,197,94,0.12)', fg: '#22c55e' },
    beta: { bg: 'rgba(168,85,247,0.12)', fg: '#a855f7' },
    planned: { bg: 'rgba(148,163,184,0.12)', fg: '#94a3b8' },
    paused: { bg: 'rgba(234,179,8,0.12)', fg: '#eab308' },
    deprecated: { bg: 'rgba(239,68,68,0.12)', fg: '#ef4444' },
  }
  const s = styles[status] || styles.planned
  return (
    <span
      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {status}
    </span>
  )
}

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; fg: string }> = {
    running: { bg: 'rgba(59,130,246,0.12)', fg: '#3b82f6' },
    succeeded: { bg: 'rgba(34,197,94,0.12)', fg: '#22c55e' },
    failed: { bg: 'rgba(239,68,68,0.12)', fg: '#ef4444' },
    partial: { bg: 'rgba(234,179,8,0.12)', fg: '#eab308' },
    canceled: { bg: 'rgba(148,163,184,0.12)', fg: '#94a3b8' },
  }
  const s = styles[status] || styles.canceled
  return (
    <span
      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {status}
    </span>
  )
}

export default async function AgentsPage() {
  const { agents, runs, orgId } = await loadData()
  const implemented = new Set<string>(listImplementedAgents())

  const grouped = agents.reduce<Record<string, AgentRow[]>>((acc, a) => {
    acc[a.family] = acc[a.family] || []
    acc[a.family].push(a)
    return acc
  }, {})

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-[24px] font-semibold mb-1"
          style={{ color: 'var(--baw-text)' }}
        >
          Agentes
        </h1>
        <p className="text-[12px]" style={{ color: 'var(--baw-muted)' }}>
          10+1 agentes BaW OS · BaW coordinador + 4 PM-Ops + 6 ZXY shared. v1: Cobranza dunning.
        </p>
      </div>

      {Object.entries(grouped).map(([family, list]) => (
        <section key={family}>
          <h2
            className="text-[14px] font-semibold mb-3 uppercase tracking-wider"
            style={{ color: 'var(--baw-muted)' }}
          >
            {FAMILY_LABEL[family] || family}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((a) => {
              const isImpl = implemented.has(a.id)
              return (
                <div
                  key={a.id}
                  className="rounded-lg p-4 flex flex-col gap-3"
                  style={{
                    backgroundColor: 'var(--baw-surface)',
                    border: '1px solid var(--baw-border)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div
                        className="text-[15px] font-semibold"
                        style={{ color: 'var(--baw-text)' }}
                      >
                        {a.full_name}
                      </div>
                      <div
                        className="text-[11px] mt-0.5"
                        style={{ color: 'var(--baw-muted)' }}
                      >
                        {a.domain} · L{a.capability_level} · F{a.feedback_level}
                      </div>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  {a.description && (
                    <p
                      className="text-[12px] leading-relaxed"
                      style={{ color: 'var(--baw-muted)' }}
                    >
                      {a.description}
                    </p>
                  )}
                  {isImpl && orgId ? (
                    <AgentRunButton agentId={a.id} agentName={a.display_name} />
                  ) : (
                    <div
                      className="text-[11px] italic"
                      style={{ color: 'var(--baw-muted)' }}
                    >
                      {!orgId ? 'requiere sesión activa' : 'pendiente de implementación'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      <section>
        <h2
          className="text-[14px] font-semibold mb-3 uppercase tracking-wider"
          style={{ color: 'var(--baw-muted)' }}
        >
          Runs recientes
        </h2>
        {runs.length === 0 ? (
          <div
            className="rounded-lg p-4 text-[12px]"
            style={{
              backgroundColor: 'var(--baw-surface)',
              border: '1px solid var(--baw-border)',
              color: 'var(--baw-muted)',
            }}
          >
            Aún no hay runs en este tenant. Invoca a un agente para ver el historial.
          </div>
        ) : (
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--baw-border)' }}
          >
            <table className="w-full text-[12px]">
              <thead style={{ backgroundColor: 'var(--baw-surface)' }}>
                <tr>
                  <th className="text-left p-2" style={{ color: 'var(--baw-muted)' }}>Agente</th>
                  <th className="text-left p-2" style={{ color: 'var(--baw-muted)' }}>Trigger</th>
                  <th className="text-left p-2" style={{ color: 'var(--baw-muted)' }}>Estado</th>
                  <th className="text-left p-2" style={{ color: 'var(--baw-muted)' }}>Acciones</th>
                  <th className="text-left p-2" style={{ color: 'var(--baw-muted)' }}>Duración</th>
                  <th className="text-left p-2" style={{ color: 'var(--baw-muted)' }}>Inicio</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const m = r.metrics || {}
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--baw-border)' }}>
                      <td className="p-2" style={{ color: 'var(--baw-text)' }}>{r.agent_id}</td>
                      <td className="p-2" style={{ color: 'var(--baw-muted)' }}>{r.triggered_by}</td>
                      <td className="p-2"><RunStatusBadge status={r.status} /></td>
                      <td className="p-2 tabular-nums" style={{ color: 'var(--baw-muted)' }}>
                        {(m.actions_ok || 0)}✓ · {(m.actions_failed || 0)}✗
                        {m.actions_skipped ? ` · ${m.actions_skipped}↷` : ''}
                      </td>
                      <td className="p-2 tabular-nums" style={{ color: 'var(--baw-muted)' }}>
                        {r.duration_ms != null ? `${r.duration_ms}ms` : '—'}
                      </td>
                      <td className="p-2 tabular-nums" style={{ color: 'var(--baw-muted)' }}>
                        {new Date(r.started_at).toLocaleString('es-MX')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="text-[11px]" style={{ color: 'var(--baw-muted)' }}>
        <Link href="/admin" className="underline">L0 Platform admin</Link> · Catálogo de agentes solo editable por platform admins.
      </div>
    </div>
  )
}
