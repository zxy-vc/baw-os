import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const OWNER_TOKEN = process.env.OWNER_TOKEN!
const ORG_ID = 'ed4308c7-2bdb-46f2-be69-7c59674838e2'

function createPortalClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params

  if (token !== OWNER_TOKEN) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createPortalClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // 1. All units
  const { data: units } = await supabase
    .from('units')
    .select('id, number, floor, type, status')
    .eq('org_id', ORG_ID)

  // 2. Active contracts with occupant
  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, unit_id, occupant_id, monthly_amount, start_date, end_date, status')
    .eq('org_id', ORG_ID)
    .in('status', ['active', 'en_renovacion'])

  // 3. Occupant names
  const occupantIds = (contracts || []).map(c => c.occupant_id).filter(Boolean)
  const { data: occupants } = occupantIds.length > 0
    ? await supabase.from('occupants').select('id, name').in('id', occupantIds)
    : { data: [] }

  // 4. Payments for current month
  const { data: payments } = await supabase
    .from('payments')
    .select('id, contract_id, amount, amount_paid, due_date, paid_date, status')
    .eq('org_id', ORG_ID)
    .gte('due_date', monthStart)
    .lte('due_date', monthEnd)

  // 5. Expenses for current month
  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, unit_id, category, amount, expense_date, provider, notes')
    .eq('org_id', ORG_ID)
    .gte('expense_date', monthStart)
    .lte('expense_date', monthEnd)
    .order('expense_date', { ascending: false })

  // 6. Open incidents
  const { data: incidents } = await supabase
    .from('incidents')
    .select('id, unit_id, title, description, status, priority, actual_cost, created_at')
    .eq('org_id', ORG_ID)
    .in('status', ['open', 'in_progress', 'waiting_parts'])
    .order('created_at', { ascending: false })

  // 7. Contracts expiring within 60 days
  const { data: expiringContracts } = await supabase
    .from('contracts')
    .select('id, unit_id, occupant_id, end_date, monthly_amount')
    .eq('org_id', ORG_ID)
    .eq('status', 'active')
    .not('end_date', 'is', null)
    .lte('end_date', sixtyDaysFromNow)

  // Build maps
  const unitMap = new Map((units || []).map(u => [u.id, u]))
  const occupantMap = new Map((occupants || []).map(o => [o.id, o]))
  const contractByUnit = new Map((contracts || []).map(c => [c.unit_id, c]))
  const paymentByContract = new Map<string, typeof payments extends (infer T)[] | null ? T : never>()
  for (const p of payments || []) {
    paymentByContract.set(p.contract_id, p)
  }

  // Group expenses by unit_id (null = general)
  const expensesByUnit = new Map<string | null, typeof expenses>()
  for (const e of expenses || []) {
    const key = e.unit_id || null
    if (!expensesByUnit.has(key)) expensesByUnit.set(key, [])
    expensesByUnit.get(key)!.push(e)
  }

  // Group incidents by unit_id
  const incidentsByUnit = new Map<string, typeof incidents>()
  for (const inc of incidents || []) {
    if (!incidentsByUnit.has(inc.unit_id)) incidentsByUnit.set(inc.unit_id, [])
    incidentsByUnit.get(inc.unit_id)!.push(inc)
  }

  // Compute summary
  const totalUnits = (units || []).length
  const occupiedUnits = (contracts || []).length
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0
  const expectedMonthly = (contracts || []).reduce((sum, c) => sum + (c.monthly_amount || 0), 0)
  const collectedMonthly = (payments || [])
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount_paid || p.amount || 0), 0)
  const pendingMonthly = expectedMonthly - collectedMonthly
  const collectionRate = expectedMonthly > 0 ? Math.round((collectedMonthly / expectedMonthly) * 100) : 0
  const totalExpenses = (expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0)
  const netIncome = collectedMonthly - totalExpenses

  // Build per-unit monthly statements
  const generalExpenses = expensesByUnit.get(null) || []
  const generalExpensesTotal = generalExpenses.reduce((s, e) => s + (e.amount || 0), 0)
  const generalExpensesPerUnit = occupiedUnits > 0 ? Math.round(generalExpensesTotal / occupiedUnits) : 0

  const statements = (contracts || []).map(c => {
    const unit = unitMap.get(c.unit_id)
    const occupant = c.occupant_id ? occupantMap.get(c.occupant_id) : null
    const payment = paymentByContract.get(c.id)
    const unitExpenses = expensesByUnit.get(c.unit_id) || []
    const unitIncidents = (incidentsByUnit.get(c.unit_id) || []).slice(0, 3)

    const grossRent = c.monthly_amount || 0
    const adminFee = Math.round(grossRent * 0.10)
    const unitExpensesTotal = unitExpenses.reduce((s, e) => s + (e.amount || 0), 0)
    const maintenanceCost = unitIncidents.reduce((s, inc) => s + (inc.actual_cost || 0), 0)
    const netPayout = grossRent - adminFee - unitExpensesTotal - generalExpensesPerUnit - maintenanceCost

    return {
      unit_number: unit?.number || '?',
      unit_id: c.unit_id,
      tenant_name: occupant?.name || null,
      gross_rent: grossRent,
      admin_fee: adminFee,
      unit_expenses: unitExpensesTotal,
      general_expenses_share: generalExpensesPerUnit,
      maintenance_cost: maintenanceCost,
      net_payout: netPayout,
      payment_status: payment?.status || 'pending',
      paid_date: payment?.paid_date || null,
      expenses_detail: unitExpenses.slice(0, 3).map(e => ({
        category: e.category,
        amount: e.amount,
        provider: e.provider,
      })),
      incidents: unitIncidents.map(inc => ({
        id: inc.id,
        title: inc.title,
        status: inc.status,
        priority: inc.priority,
        created_at: inc.created_at,
      })),
    }
  }).sort((a, b) => a.unit_number.localeCompare(b.unit_number, 'es', { numeric: true }))

  // Build units detail array
  const unitsDetail = (units || []).map(u => {
    const contract = contractByUnit.get(u.id)
    const occupant = contract?.occupant_id ? occupantMap.get(contract.occupant_id) : null
    const payment = contract ? paymentByContract.get(contract.id) : null

    return {
      unit_number: u.number,
      floor: u.floor,
      type: u.type,
      unit_status: u.status,
      tenant_name: occupant?.name || null,
      monthly_rent: contract?.monthly_amount || null,
      payment_status: payment?.status || (contract ? 'pending' : null),
      paid_date: payment?.paid_date || null,
    }
  }).sort((a, b) => {
    const order: Record<string, number> = { late: 0, pending: 1, partial: 2, paid: 3 }
    const aOrder = a.payment_status ? (order[a.payment_status] ?? 4) : 5
    const bOrder = b.payment_status ? (order[b.payment_status] ?? 4) : 5
    return aOrder - bOrder
  })

  // Expiring contracts detail
  const expiringDetail = (expiringContracts || []).map(c => {
    const unit = unitMap.get(c.unit_id)
    const occupant = c.occupant_id ? occupantMap.get(c.occupant_id) : null
    return {
      unit_number: unit?.number || '?',
      tenant_name: occupant?.name || 'Sin inquilino',
      end_date: c.end_date,
      monthly_amount: c.monthly_amount,
    }
  })

  return NextResponse.json({
    summary: {
      totalUnits,
      occupiedUnits,
      occupancyRate,
      expectedMonthly,
      collectedMonthly,
      pendingMonthly,
      collectionRate,
      totalExpenses,
      netIncome,
      openIncidents: (incidents || []).length,
      expiringContracts: (expiringContracts || []).length,
    },
    statements,
    units: unitsDetail,
    expenses: (expenses || []).map(e => ({
      category: e.category,
      amount: e.amount,
      date: e.expense_date,
      provider: e.provider,
      notes: e.notes,
    })),
    incidents: (incidents || []).map(inc => {
      const unit = unitMap.get(inc.unit_id)
      return {
        id: inc.id,
        unit_number: unit?.number || '?',
        title: inc.title,
        description: inc.description,
        status: inc.status,
        priority: inc.priority,
        created_at: inc.created_at,
      }
    }),
    expiringContracts: expiringDetail,
  })
}
