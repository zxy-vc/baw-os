import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scheduleMonths, computeMonthStatus, rankPayment, pad2 } from '@/lib/billing'
import { resolveServiceRate, type ServiceRate } from '@/lib/cobros'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const WATER_FEE_DEFAULT = 250

function createPortalClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

// Mapea el estatus interno (lib/billing) al vocabulario del portal del inquilino.
function portalStatus(s: string): string {
  if (s === 'pagado') return 'paid'
  if (s === 'pendiente' || s === 'verbal') return 'pending'
  return 'late' // vencido, mora, parcial
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params
  const supabase = createPortalClient()

  // Fetch contract by portal_token
  const { data: contract, error } = await supabase
    .from('contracts')
    .select('id, org_id, unit_id, occupant_id, monthly_amount, start_date, billing_start_date, end_date, status, payment_day')
    .eq('portal_token', token)
    .eq('portal_enabled', true)
    .single()

  if (error || !contract) {
    return NextResponse.json(
      { error: 'Portal no disponible' },
      { status: 404 }
    )
  }

  // Fetch unit separately
  const { data: unit } = await supabase
    .from('units')
    .select('number, floor, type, building_id')
    .eq('id', contract.unit_id)
    .single()

  // Fetch occupant separately
  const { data: occupant } = contract.occupant_id
    ? await supabase.from('occupants').select('name').eq('id', contract.occupant_id).single()
    : { data: null }

  // Todos los pagos del contrato (para saber qué meses están cubiertos).
  const { data: payments } = await supabase
    .from('payments')
    .select('due_date, amount, amount_paid, late_fee_amount, status, paid_date, water_fee')
    .eq('contract_id', contract.id)

  // Tarifas de agua del edificio (Fase 1 servicios).
  const { data: rates } = await supabase
    .from('service_rates')
    .select('building_id, service, amount, effective_from')
    .eq('org_id', contract.org_id)
    .eq('service', 'agua')
  const waterRates = (rates || []) as ServiceRate[]
  const buildingId = unit?.building_id ?? null

  // Indexa el pago representativo por mes.
  const paymentByKey = new Map<string, { due_date: string; amount: number | null; amount_paid: number | null; late_fee_amount: number | null; status: string; paid_date: string | null; water_fee: number | null }>()
  for (const p of payments || []) {
    const key = String(p.due_date).slice(0, 7)
    const prev = paymentByKey.get(key)
    if (!prev || rankPayment(p.status) > rankPayment(prev.status)) paymentByKey.set(key, p)
  }

  // Proyecta el calendario del contrato hasta el mes en curso: muestra pagados,
  // pendientes y vencidos (no solo las filas registradas). Mismo cálculo que Cobros.
  const now = new Date()
  const cutoff = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  const currentWaterFee = resolveServiceRate(waterRates, 'agua', buildingId, cutoff) ?? WATER_FEE_DEFAULT
  const day = contract.payment_day || 1

  const projected = scheduleMonths(contract.billing_start_date ?? contract.start_date, cutoff).map((month) => {
    const dueDate = `${month}-${pad2(day)}`
    const payment = paymentByKey.get(month) || null
    const waterFee = resolveServiceRate(waterRates, 'agua', buildingId, month) ?? WATER_FEE_DEFAULT
    const r = computeMonthStatus({
      monthlyAmount: Number(contract.monthly_amount || 0),
      paymentDay: contract.payment_day,
      dueDate,
      waterFee,
      payment,
      today: now,
    })
    return {
      month: dueDate,
      amount: payment?.amount ?? Number(contract.monthly_amount || 0) + waterFee,
      water_fee: payment?.water_fee ?? waterFee,
      status: portalStatus(r.status),
      paid_date: payment?.paid_date ?? null,
    }
  })

  // Más reciente primero, acotado a los últimos 12 meses para el portal.
  projected.reverse()
  const portalPayments = projected.slice(0, 12)

  // Fetch active incidents for this unit
  const { data: incidents } = await supabase
    .from('incidents')
    .select('id, title, description, status, created_at')
    .eq('unit_id', contract.unit_id)
    .in('status', ['open', 'in_progress', 'waiting_parts'])
    .order('created_at', { ascending: false })

  return NextResponse.json({
    contract: {
      unit_id: contract.unit_id,
      monthly_amount: contract.monthly_amount,
      water_fee: currentWaterFee,
      start_date: contract.start_date,
      end_date: contract.end_date,
      status: contract.status,
      payment_day: contract.payment_day,
      tenant_name: occupant?.name || 'Inquilino',
    },
    unit: unit
      ? { unit_number: unit.number, floor: unit.floor, type: unit.type }
      : null,
    payments: portalPayments,
    incidents: incidents || [],
  })
}
