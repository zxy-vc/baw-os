// BaW OS — /agents · Catálogo + invocación + runs (S4-3)

import Link from 'next/link'
import { createServiceClient } from '@/lib/api-auth'
import { resolveOrgId } from '@/lib/org-context'
import { listImplementedAgents } from '@/lib/agents/registry'
import { getViewMode } from '@/lib/agents/view-mode'
import AgentRunButton from './AgentRunButton'
import ViewModeSwitch from '@/components/ViewModeSwitch'
import AgentModeView from './AgentModeView'

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
  autonomy_level?: number
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

  // MVP Sprint 5A: la UI muestra SOLO los agentes third-party activos del MVP
  // (Alicia operadora + Hugo supervisor). Los nativos y los demás third-party
  // (Beto, Maribel, Luis, Andrés, Rafa) permanecen en la tabla `agents` pero
  // no se presentan en el catálogo. El runner de cobranza sigue corriendo como
  // automatización interna vía /api/cron/cobranza.
  const MVP_AGENT_IDS = ['alicia-ops', 'hugo-cos']
  const { data: agentsData } = await supabase
    .from('agents')
    .select('*')
    .in('id', MVP_AGENT_IDS)
    .order('display_name')

  let runs: AgentRunRow[] = []
  let approvals: import('./ApprovalQueueClient').ApprovalRow[] = []
  let policies: { agent_id: string; autonomy_level: number; active: boolean }[] = []
  let connectedIds = new Set<string>()

  if (orgId) {
    const { data: credsData } = await supabase
      .from('agent_credentials')
      .select('agent_id')
      .eq('org_id', orgId)
      .eq('status', 'active')
    connectedIds = new Set((credsData || []).map((c) => c.agent_id as string))

    const [runsRes, approvalsRes, policiesRes] = await Promise.all([
      supabase
        .from('agent_runs')
        .select(
          'id, agent_id, triggered_by, status, started_at, finished_at, duration_ms, metrics, error'
        )
        .eq('org_id', orgId)
        .order('started_at', { ascending: false })
        .limit(20),
      supabase
        .from('agent_approvals')
        .select(
          'id, agent_id, action_type, resource_type, reason, status, requested_at, expires_at, payload'
        )
        .eq('org_id', orgId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false })
        .limit(50),
      supabase
        .from('agent_policies')
        .select('agent_id, autonomy_level, active')
        .eq('org_id', orgId),
    ])
    runs = (runsRes.data || []) as AgentRunRow[]
    approvals = (approvalsRes.data ||
      []) as import('./ApprovalQueueClient').ApprovalRow[]
    policies = (policiesRes.data || []) as typeof policies
  }

  // Merge autonomy_level efectivo en cada agent
  const policyMap = new Map(policies.map((p) => [p.agent_id, p]))
  const agents = ((agentsData || []) as AgentRow[]).map((a) => ({
    ...a,
    autonomy_level: policyMap.get(a.id)?.autonomy_level ?? 1,
  }))

  return { agents, runs, approvals, orgId, connectedIds }
}

// Modelo de agentes según Roster v0.2 (Notion canónico):
//   - baw-coord: BaW Coordinador (cara única del workforce)
//   - ops-core: Operaciones Core (Cobranza, Facturación, Mantenimiento) — Tier Starter+
//   - experiencia: Experiencia (Atención, Reservas, Tarifas, Renovaciones) — Tier Professional+
//   - inteligencia: Inteligencia (Reportes, Auditoría, Fiscal) — Tier Enterprise/Max
//   - third-party: Third Party Operations (agentes externos conectables — ZXY Agent OS)
const FAMILY_LABEL: Record<string, string> = {
  'baw-coord': 'BaW · Coordinador',
  'ops-core': 'Operaciones Core',
  'experiencia': 'Experiencia',
  'inteligencia': 'Inteligencia',
  'third-party': 'Third Party Operations',
  // Legacy alias durante migración
  'pm-ops': 'PM Operations (legacy)',
  'zxy-shared': 'Third Party Operations',
}

const FAMILY_DESC: Record<string, string> = {
  'baw-coord': 'Cara única del workforce. Coordina los 10 especialistas, recibe todos los inputs del PM.',
  'ops-core': 'Tier Starter+ · Cobro, facturación y operación del edificio',
  'experiencia': 'Tier Professional+ · Comunicación, captación y ciclo de vida del residente',
  'inteligencia': 'Tier Enterprise/Max · Reporting, governance y compliance',
  'third-party': 'Agentes externos conectables (ZXY Agent OS, otros proveedores). No son parte del producto BaW OS.',
  'pm-ops': 'Familia legacy — migrada a escuadrones',
  'zxy-shared': 'Agentes externos conectables (ZXY, otros proveedores)',
}

const FAMILY_ORDER = ['baw-coord', 'ops-core', 'experiencia', 'inteligencia', 'third-party', 'pm-ops', 'zxy-shared']

// MVP Sprint 5A: agentes third-party activos y su rol operativo.
// Los demás third-party quedan diferidos (Sprint 5B+).
const MVP_AGENT_ROLES: Record<string, string> = {
  'alicia-ops': 'Operadora · Mateos 809P',
  'hugo-cos': 'Supervisor de Alicia · solo lectura',
}

function ConnectionBadge({
  connected,
  isMvpAgent,
}: {
  connected: boolean
  isMvpAgent: boolean
}) {
  if (connected) {
    return (
      <span
        className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
        style={{
          backgroundColor: 'var(--baw-success-bg-soft)',
          color: 'var(--baw-success-fg)',
        }}
      >
        Conectado
      </span>
    )
  }
  if (isMvpAgent) {
    return (
      <span
        className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
        style={{
          backgroundColor: 'var(--baw-warning-bg-soft)',
          color: 'var(--baw-warning-fg)',
        }}
      >
        Por conectar
      </span>
    )
  }
  return (
    <span
      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{
        backgroundColor: 'var(--baw-neutral-bg-soft)',
        color: 'var(--baw-neutral-fg)',
      }}
    >
      Diferido
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; fg: string }> = {
    live: { bg: 'var(--baw-success-bg-soft)', fg: 'var(--baw-success-fg)' },
    beta: { bg: 'var(--baw-agent-bg-soft)', fg: 'var(--baw-agent-fg)' },
    planned: { bg: 'var(--baw-neutral-bg-soft)', fg: 'var(--baw-neutral-fg)' },
    paused: { bg: 'var(--baw-warning-bg-soft)', fg: 'var(--baw-warning-fg)' },
    deprecated: { bg: 'var(--baw-danger-bg-soft)', fg: 'var(--baw-danger-fg)' },
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
    running: { bg: 'var(--baw-info-bg-soft)', fg: 'var(--baw-info-fg)' },
    succeeded: { bg: 'var(--baw-success-bg-soft)', fg: 'var(--baw-success-fg)' },
    failed: { bg: 'var(--baw-danger-bg-soft)', fg: 'var(--baw-danger-fg)' },
    partial: { bg: 'var(--baw-warning-bg-soft)', fg: 'var(--baw-warning-fg)' },
    canceled: { bg: 'var(--baw-neutral-bg-soft)', fg: 'var(--baw-neutral-fg)' },
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
  const { agents, runs, approvals, orgId, connectedIds } = await loadData()
  // approvals usado solo en Modo Agent; lo declaramos aquí para tipado.
  void approvals
  const implemented = new Set<string>(listImplementedAgents())
  const viewMode = await getViewMode()

  if (viewMode === 'agent') {
    return (
      <AgentModeView
        agents={agents}
        runs={runs}
        approvals={approvals}
        orgId={orgId}
        viewMode={viewMode}
      />
    )
  }

  const grouped = agents.reduce<Record<string, AgentRow[]>>((acc, a) => {
    acc[a.family] = acc[a.family] || []
    acc[a.family].push(a)
    return acc
  }, {})

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-[28px] mb-1 tracking-tight"
          style={{ color: 'var(--baw-text)', fontFamily: 'var(--font-display)' }}
        >
          Agentes
        </h1>
        <p
          className="text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--baw-muted)', fontFamily: 'var(--font-mono)' }}
        >
          Agentes third-party conectados a BaW OS · Alicia opera Mateos 809P · Hugo supervisa · Sprint 5A MVP
        </p>
        <div className="mt-3">
          <ViewModeSwitch initialMode={viewMode} />
        </div>
      </div>

      {Object.entries(grouped)
        .sort(([a], [b]) => FAMILY_ORDER.indexOf(a) - FAMILY_ORDER.indexOf(b))
        .map(([family, list]) => (
        <section key={family}>
          <div className="mb-3">
            <h2
              className="text-[12px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--baw-muted)', fontFamily: 'var(--font-mono)' }}
            >
              {FAMILY_LABEL[family] || family}
            </h2>
            {FAMILY_DESC[family] && (
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--baw-faint)' }}>
                {FAMILY_DESC[family]}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((a) => {
              const isImpl = implemented.has(a.id)
              const isMvpAgent = a.id in MVP_AGENT_ROLES
              const connected = connectedIds.has(a.id)
              return (
                <div
                  key={a.id}
                  className="rounded-lg p-4 flex flex-col gap-3"
                  style={{
                    backgroundColor: 'var(--baw-surface)',
                    border: isMvpAgent
                      ? '1px solid var(--baw-accent)'
                      : '1px solid var(--baw-border)',
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
                        {MVP_AGENT_ROLES[a.id] ?? a.domain} · L{a.capability_level} · F{a.feedback_level}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <ConnectionBadge connected={connected} isMvpAgent={isMvpAgent} />
                      <StatusBadge status={a.status} />
                    </div>
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
                  ) : orgId && isMvpAgent ? (
                    <Link
                      href={`/agents/${a.id}/credentials`}
                      className="text-[11px] underline"
                      style={{ color: 'var(--baw-accent)' }}
                    >
                      {connected ? 'Gestionar credenciales →' : 'Conectar (emitir credencial) →'}
                    </Link>
                  ) : (
                    <div
                      className="text-[11px] italic"
                      style={{ color: 'var(--baw-muted)' }}
                    >
                      {!orgId ? 'requiere sesión activa' : 'diferido · se conecta en un sprint posterior'}
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
