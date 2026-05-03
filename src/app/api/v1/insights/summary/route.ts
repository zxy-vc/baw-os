// BaW OS v1 — GET /v1/insights/summary
// Snapshot agregado para dashboards de agentes: counts de unidades, contratos
// activos, payments por status, incidents abiertos por priority, tasks pending.
import { v1Read } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { createServiceClient } from '@/lib/supabase'

export const GET = v1Read({
  scopes: ['insights:read'],
  handler: async ({ auth }) => {
    const supabase = createServiceClient()
    const orgId = auth.orgId

    const [
      unitsRes,
      activeContractsRes,
      paymentsRes,
      incidentsRes,
      tasksRes,
    ] = await Promise.all([
      supabase.from('units').select('status', { count: 'exact' }).eq('org_id', orgId),
      supabase
        .from('contracts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'active'),
      supabase.from('payments').select('status, amount').eq('org_id', orgId),
      supabase.from('incidents').select('priority, status').eq('org_id', orgId),
      supabase.from('tasks').select('status').eq('org_id', orgId),
    ])

    if (unitsRes.error || paymentsRes.error || incidentsRes.error || tasksRes.error) {
      const msg =
        unitsRes.error?.message ||
        paymentsRes.error?.message ||
        incidentsRes.error?.message ||
        tasksRes.error?.message ||
        'aggregate query failed'
      return v1Error('query_error', msg, 500)
    }

    const unitsByStatus: Record<string, number> = {}
    for (const u of unitsRes.data || []) {
      const s = (u.status as string) || 'unknown'
      unitsByStatus[s] = (unitsByStatus[s] || 0) + 1
    }

    const paymentsByStatus: Record<string, { count: number; total: number }> = {}
    for (const p of paymentsRes.data || []) {
      const s = (p.status as string) || 'unknown'
      const a = (p.amount as number) || 0
      if (!paymentsByStatus[s]) paymentsByStatus[s] = { count: 0, total: 0 }
      paymentsByStatus[s].count += 1
      paymentsByStatus[s].total += a
    }

    const incidentsOpenByPriority: Record<string, number> = {}
    let incidentsTotalOpen = 0
    for (const i of incidentsRes.data || []) {
      if (i.status === 'resolved' || i.status === 'closed') continue
      const p = (i.priority as string) || 'normal'
      incidentsOpenByPriority[p] = (incidentsOpenByPriority[p] || 0) + 1
      incidentsTotalOpen += 1
    }

    const tasksByStatus: Record<string, number> = {}
    for (const t of tasksRes.data || []) {
      const s = (t.status as string) || 'unknown'
      tasksByStatus[s] = (tasksByStatus[s] || 0) + 1
    }

    return v1Ok({
      org_id: orgId,
      generated_at: new Date().toISOString(),
      units: {
        total: unitsRes.data?.length ?? 0,
        by_status: unitsByStatus,
      },
      contracts: {
        active: activeContractsRes.count ?? 0,
      },
      payments: {
        by_status: paymentsByStatus,
      },
      incidents: {
        open_total: incidentsTotalOpen,
        open_by_priority: incidentsOpenByPriority,
      },
      tasks: {
        by_status: tasksByStatus,
      },
    })
  },
})
