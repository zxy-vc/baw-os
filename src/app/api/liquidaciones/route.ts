// BaW OS — Liquidaciones a propietarios (ADR-022 §3.2, Fase 1)
// GET  ?month=YYYY-MM → cálculo del mes por (edificio × propietario) fusionado
//                       con los statements ya emitidos (persistidos).
// POST { building_id, owner_id, period } → EMITE el statement: recalcula
//      server-side y persiste el snapshot inmutable en owner_statements.
import { NextRequest } from 'next/server'
import { createServiceClient, apiError, apiOk } from '@/lib/api-auth'
import { requireAdminCaller, requireMemberCaller } from '@/lib/admin-auth'
import { canFinance } from '@/lib/finance-permissions'
import { computeOrgStatements } from '@/lib/liquidaciones-server'

export const dynamic = 'force-dynamic'

function validPeriod(p: unknown): p is string {
  return typeof p === 'string' && /^\d{4}-\d{2}$/.test(p)
}

export async function GET(request: NextRequest) {
  const auth = await requireMemberCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
  if (!validPeriod(period)) return apiError('month inválido (YYYY-MM)')

  const supabase = createServiceClient()
  const { items, agreements } = await computeOrgStatements(supabase, auth.orgId, period)

  const { data: persisted, error: persistedErr } = await supabase
    .from('owner_statements')
    .select('*, payouts:owner_payouts(id, amount, method, reference, paid_date, confirmed_by)')
    .eq('org_id', auth.orgId)
    .eq('period', period)
  if (persistedErr) return apiError(persistedErr.message, 500)

  const persistedByKey = new Map(
    (persisted ?? []).map((s) => [`${s.building_id}:${s.owner_id}`, s]),
  )

  return apiOk({
    period,
    items: items.map((it) => ({
      ...it,
      statement: persistedByKey.get(`${it.buildingId}:${it.ownerId}`) ?? null,
    })),
    agreements,
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)
  if (!auth.isPlatformAdmin && !canFinance(auth.role, 'finance.emit_statements')) {
    return apiError('Tu rol no puede emitir estados de cuenta', 403)
  }

  const body = await request.json().catch(() => null)
  const buildingId = body?.building_id
  const ownerId = body?.owner_id
  const period = body?.period
  if (!buildingId || !ownerId || !validPeriod(period)) {
    return apiError('building_id, owner_id y period (YYYY-MM) son requeridos')
  }

  const supabase = createServiceClient()

  // Siempre se recalcula server-side al emitir — el cliente no manda montos.
  const { items } = await computeOrgStatements(supabase, auth.orgId, period)
  const item = items.find((i) => i.buildingId === buildingId && i.ownerId === ownerId)
  if (!item) return apiError('No hay participación de ese propietario en ese edificio', 404)

  const { data: existing } = await supabase
    .from('owner_statements')
    .select('id, status')
    .eq('org_id', auth.orgId)
    .eq('building_id', buildingId)
    .eq('owner_id', ownerId)
    .eq('period', period)
    .maybeSingle()

  const row = {
    gross_expected: item.totals.grossExpected,
    gross_collected: item.totals.grossCollected,
    admin_fee: item.totals.adminFee,
    expenses: item.totals.expenses,
    maintenance: item.totals.maintenance,
    adjustments: 0,
    ownership_pct: item.ownershipPct,
    net_payout: item.totals.netPayout,
    status: 'issued' as const,
    detail: {
      lines: item.lines,
      terms: item.terms,
      building_net: item.totals.buildingNet,
    },
    issued_at: new Date().toISOString(),
    issued_by: auth.userId,
  }

  if (existing) {
    // Un statement anulado se puede re-emitir (reusa la fila por el UNIQUE);
    // uno emitido/pagado es inmutable.
    if (existing.status !== 'void') {
      return apiError('Ya existe un estado de cuenta emitido para ese periodo', 409)
    }
    const { data, error } = await supabase
      .from('owner_statements')
      .update(row)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return apiError(error.message, 500)
    return apiOk(data)
  }

  const { data, error } = await supabase
    .from('owner_statements')
    .insert({
      org_id: auth.orgId,
      owner_id: ownerId,
      building_id: buildingId,
      period,
      ...row,
    })
    .select()
    .single()
  if (error) return apiError(error.message, 500)
  return apiOk(data)
}
