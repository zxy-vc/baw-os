// BaW OS — Armado server-side de liquidaciones a propietarios (ADR-022 §3.2)
//
// Junta los datos del mes (service_role) y produce, por cada participación
// (edificio × propietario), el cálculo del statement usando la lógica pura de
// owner-statements.ts. Lo consumen GET y POST de /api/liquidaciones.
//
// Cobrado del mes: convivencia de dos modelos de captura (PR #128-133) —
// los abonos viven en payment_receipts, pero Stripe/conserje/acciones legacy
// marcan payments directo sin abonos. Para no contar doble: se suman los
// abonos del mes + los payments pagados en el mes que NO tienen ningún abono.

import { SupabaseClient } from '@supabase/supabase-js'
import {
  AgreementRow,
  AgreementTerms,
  StatementTotals,
  UnitLine,
  computeStatement,
  periodRange,
  resolveAgreement,
} from '@/lib/owner-statements'

export interface StakeStatement {
  buildingId: string
  buildingName: string
  ownerId: string
  ownerName: string
  ownershipPct: number
  terms: AgreementTerms
  lines: UnitLine[]
  totals: StatementTotals
}

export async function computeOrgStatements(
  supabase: SupabaseClient,
  orgId: string,
  period: string,
): Promise<{ items: StakeStatement[]; agreements: AgreementRow[] }> {
  const { start, end } = periodRange(period)

  const [
    buildingsR,
    stakesR,
    unitsR,
    contractsR,
    expensesR,
    incidentsR,
    agreementsR,
  ] = await Promise.all([
    supabase.from('buildings').select('id, name').eq('org_id', orgId),
    supabase
      .from('ownership_stakes')
      .select(
        'id, building_id, property_owner_id, percentage, mgmt_ends_on, owner:property_owners(id, full_name)',
      )
      .eq('org_id', orgId),
    supabase
      .from('units')
      .select('id, number, building_id')
      .eq('org_id', orgId),
    supabase
      .from('contracts')
      .select('id, unit_id, monthly_amount, status, occupant:occupants(name)')
      .eq('org_id', orgId)
      .in('status', ['active', 'en_renovacion']),
    supabase
      .from('expenses')
      .select('id, unit_id, amount, category, provider')
      .eq('org_id', orgId)
      .gte('expense_date', start)
      .lte('expense_date', end),
    supabase
      .from('incidents')
      .select('id, unit_id, actual_cost, created_at')
      .eq('org_id', orgId)
      .not('actual_cost', 'is', null)
      .gte('created_at', `${start}T00:00:00`)
      .lte('created_at', `${end}T23:59:59`),
    supabase
      .from('management_agreements')
      .select('id, building_id, owner_id, fee_type, fee_value, effective_from, effective_to')
      .eq('org_id', orgId),
  ])

  const buildings = buildingsR.data ?? []
  const stakes = stakesR.data ?? []
  const units = unitsR.data ?? []
  const contracts = contractsR.data ?? []
  const expenses = expensesR.data ?? []
  const incidents = incidentsR.data ?? []
  const agreements = (agreementsR.data ?? []) as AgreementRow[]

  // ── Cobrado del mes ─────────────────────────────────────────────────────
  const { data: receipts } = await supabase
    .from('payment_receipts')
    .select('id, payment_id, contract_id, amount, paid_date')
    .eq('org_id', orgId)
    .gte('paid_date', start)
    .lte('paid_date', end)

  const { data: paidPayments } = await supabase
    .from('payments')
    .select('id, contract_id, amount_paid, paid_date')
    .eq('org_id', orgId)
    .gte('paid_date', start)
    .lte('paid_date', end)
    .gt('amount_paid', 0)

  // Payments pagados en el mes que SÍ tienen abonos (en cualquier fecha):
  // sus montos ya cuentan vía payment_receipts, no se suman de nuevo.
  const paidIds = (paidPayments ?? []).map((p) => p.id)
  let paymentsWithReceipts = new Set<string>()
  if (paidIds.length > 0) {
    const { data: recForPaid } = await supabase
      .from('payment_receipts')
      .select('payment_id')
      .in('payment_id', paidIds)
    paymentsWithReceipts = new Set((recForPaid ?? []).map((r) => r.payment_id))
  }

  const collectedByContract = new Map<string, number>()
  for (const r of receipts ?? []) {
    collectedByContract.set(
      r.contract_id,
      (collectedByContract.get(r.contract_id) ?? 0) + Number(r.amount || 0),
    )
  }
  for (const p of paidPayments ?? []) {
    if (paymentsWithReceipts.has(p.id)) continue
    collectedByContract.set(
      p.contract_id,
      (collectedByContract.get(p.contract_id) ?? 0) + Number(p.amount_paid || 0),
    )
  }

  // ── Índices ─────────────────────────────────────────────────────────────
  const contractByUnit = new Map<string, (typeof contracts)[number]>()
  for (const c of contracts) if (c.unit_id) contractByUnit.set(c.unit_id, c)

  const unitExpenses = new Map<string, number>()
  let generalExpensesTotal = 0
  for (const e of expenses) {
    if (e.unit_id) {
      unitExpenses.set(e.unit_id, (unitExpenses.get(e.unit_id) ?? 0) + Number(e.amount || 0))
    } else {
      generalExpensesTotal += Number(e.amount || 0)
    }
  }

  const maintenanceByUnit = new Map<string, number>()
  for (const inc of incidents) {
    if (!inc.unit_id) continue
    maintenanceByUnit.set(
      inc.unit_id,
      (maintenanceByUnit.get(inc.unit_id) ?? 0) + Number(inc.actual_cost || 0),
    )
  }

  // Prorrateo de gastos generales: por unidad OCUPADA de toda la org (mismo
  // criterio que el endpoint owner legacy).
  const occupiedUnitIds = units.filter((u) => contractByUnit.has(u.id)).map((u) => u.id)
  const generalPerUnit =
    occupiedUnitIds.length > 0 ? generalExpensesTotal / occupiedUnitIds.length : 0

  const buildingName = new Map(buildings.map((b) => [b.id, b.name]))
  const unitsByBuilding = new Map<string, typeof units>()
  for (const u of units) {
    const list = unitsByBuilding.get(u.building_id) ?? []
    list.push(u)
    unitsByBuilding.set(u.building_id, list)
  }

  // ── Un statement calculado por participación vigente ────────────────────
  const items: StakeStatement[] = []
  for (const stake of stakes) {
    // Mandato de administración terminado antes del periodo → no se liquida.
    if (stake.mgmt_ends_on && stake.mgmt_ends_on < start) continue
    const owner = stake.owner as unknown as { id: string; full_name: string } | null
    if (!owner) continue

    const lines: UnitLine[] = (unitsByBuilding.get(stake.building_id) ?? []).map((u) => {
      const contract = contractByUnit.get(u.id)
      const occupant = contract?.occupant as unknown as { name: string } | null
      return {
        unitId: u.id,
        unitNumber: u.number,
        tenantName: occupant?.name ?? null,
        expected: Number(contract?.monthly_amount || 0),
        collected: contract ? collectedByContract.get(contract.id) ?? 0 : 0,
        unitExpenses: unitExpenses.get(u.id) ?? 0,
        generalShare: contract ? generalPerUnit : 0,
        maintenance: maintenanceByUnit.get(u.id) ?? 0,
      }
    })
    lines.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, 'es', { numeric: true }))

    const terms = resolveAgreement(agreements, stake.building_id, owner.id, period)
    const totals = computeStatement(lines, terms, Number(stake.percentage))

    items.push({
      buildingId: stake.building_id,
      buildingName: buildingName.get(stake.building_id) ?? '?',
      ownerId: owner.id,
      ownerName: owner.full_name,
      ownershipPct: Number(stake.percentage),
      terms,
      lines,
      totals,
    })
  }

  items.sort(
    (a, b) =>
      a.buildingName.localeCompare(b.buildingName, 'es') ||
      a.ownerName.localeCompare(b.ownerName, 'es'),
  )
  return { items, agreements }
}
