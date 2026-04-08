import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/api-auth'

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
      id, unit_id, monthly_amount, water_fee, start_date, end_date, status, payment_day,
      occupant:occupants(name),
      unit:units(number, floor, type)
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
  const unit = Array.isArray(unitRaw) ? unitRaw[0] as { number: string; floor: number; type: string } | undefined : unitRaw as { number: string; floor: number; type: string } | null

  // Fetch last 6 payments
  const { data: payments } = await supabase
    .from('payments')
    .select('id, due_date, amount, status, paid_date, water_fee, method')
    .eq('contract_id', contract.id)
    .order('due_date', { ascending: false })
    .limit(6)

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
      water_fee: contract.water_fee,
      start_date: contract.start_date,
      end_date: contract.end_date,
      status: contract.status,
      payment_day: contract.payment_day,
      tenant_name: occupant?.name || 'Inquilino',
    },
    unit: unit
      ? { unit_number: unit.number, floor: unit.floor, type: unit.type }
      : null,
    payments: (payments || []).map((p) => ({
      id: p.id,
      month: p.due_date,
      amount: p.amount,
      water_fee: p.water_fee,
      status: p.status,
      paid_date: p.paid_date,
      method: p.method,
    })),
    incidents: incidents || [],
  })
}
