import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createPortalClient() {
  // Use service role if available, fallback to anon (portal is public read-only)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
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
    .select('id, unit_id, occupant_id, monthly_amount, water_fee, start_date, end_date, status, payment_day')
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
    .select('number, floor, type')
    .eq('id', contract.unit_id)
    .single()

  // Fetch occupant separately
  const { data: occupant } = contract.occupant_id
    ? await supabase.from('occupants').select('name').eq('id', contract.occupant_id).single()
    : { data: null }

  // Fetch last 6 payments
  const { data: payments } = await supabase
    .from('payments')
    .select('due_date, amount, status, paid_date, water_fee')
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
      month: p.due_date,
      amount: p.amount,
      water_fee: p.water_fee,
      status: p.status,
      paid_date: p.paid_date,
    })),
    incidents: incidents || [],
  })
}
