import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/api-auth'
import { scheduleMonths, computeMonthStatus, rankPayment, pad2 } from '@/lib/billing'
import { resolveServiceRate, type ServiceRate } from '@/lib/cobros'

const WATER_FEE_DEFAULT = 250

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
  const supabase = createServiceClient()

  // Fetch contract by portal_token
  const { data: contract, error } = await supabase
    .from('contracts')
    .select(`
      id, org_id, unit_id, monthly_amount, water_fee, start_date, billing_start_date, end_date, status, payment_day,
      occupant:occupants(name),
      unit:units(number, floor, type, building_id)
    `)
    .eq('portal_token', token)
    .eq('portal_enabled', true)
    .single()

  if (error || !contract) {
    return NextResponse.json(
      { error: 'Portal no disponible' },
      { status: 404 }
    )
  }

  const occupantRaw = contract.occupant as unknown
  const occupant = Array.isArray(occupantRaw) ? occupantRaw[0] as { name: string } | undefined : occupantRaw as { name: string } | null
  const unitRaw = contract.unit as unknown
  const unit = Array.isArray(unitRaw) ? unitRaw[0] as { number: string; floor: number; type: string; building_id: string | null } | undefined : unitRaw as { number: string; floor: number; type: string; building_id: string | null } | null

  // Todos los pagos del contrato + tarifas de agua, para proyectar el calendario.
  const { data: payments } = await supabase
    .from('payments')
    .select('id, due_date, amount, amount_paid, late_fee_amount, status, paid_date, water_fee, method')
    .eq('contract_id', contract.id)

  const { data: rates } = await supabase
    .from('service_rates')
    .select('building_id, service, amount, effective_from')
    .eq('org_id', contract.org_id)
    .eq('service', 'agua')
  const waterRates = (rates || []) as ServiceRate[]
  const buildingId = unit?.building_id ?? null

  const paymentByKey = new Map<string, { id: string; due_date: string; amount: number | null; amount_paid: number | null; late_fee_amount: number | null; status: string; paid_date: string | null; water_fee: number | null; method: string | null }>()
  for (const p of payments || []) {
    const key = String(p.due_date).slice(0, 7)
    const prev = paymentByKey.get(key)
    if (!prev || rankPayment(p.status) > rankPayment(prev.status)) paymentByKey.set(key, p)
  }

  const now = new Date()
  const cutoff = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
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
      id: payment?.id ?? dueDate,
      month: dueDate,
      amount: payment?.amount ?? Number(contract.monthly_amount || 0) + waterFee,
      water_fee: payment?.water_fee ?? waterFee,
      status: portalStatus(r.status),
      paid_date: payment?.paid_date ?? null,
      method: payment?.method ?? null,
    }
  })
  projected.reverse()

  // Fetch active incidents for this unit
  const { data: incidents } = await supabase
    .from('incidents')
    .select('id, title, description, status, created_at')
    .eq('unit_id', contract.unit_id)
    .in('status', ['open', 'in_progress', 'waiting_parts'])
    .order('created_at', { ascending: false })

  return NextResponse.json({
    contract: {
      id: contract.id,
      unit_id: contract.unit_id,
      monthly_amount: contract.monthly_amount,
      water_fee: resolveServiceRate(waterRates, 'agua', buildingId, cutoff) ?? contract.water_fee ?? WATER_FEE_DEFAULT,
      start_date: contract.start_date,
      end_date: contract.end_date,
      status: contract.status,
      payment_day: contract.payment_day,
      tenant_name: occupant?.name || 'Inquilino',
    },
    unit: unit
      ? { unit_number: unit.number, floor: unit.floor, type: unit.type }
      : null,
    payments: projected.slice(0, 12),
    incidents: incidents || [],
  })
}
