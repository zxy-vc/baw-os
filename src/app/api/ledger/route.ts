import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiOk, apiError, getOrgId } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const { searchParams } = new URL(request.url)

  const contractId = searchParams.get('contract_id')
  const unitId = searchParams.get('unit_id')
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  let query = supabase
    .from('payment_ledger')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (contractId) query = query.eq('contract_id', contractId)
  if (unitId) query = query.eq('unit_id', unitId)

  const { data, error } = await query
  if (error) return apiError(error.message, 500)
  return apiOk(data)
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  const { contract_id, unit_id, payment_id, tenant_name, amount, water_fee, payment_method, confirmed_by, notes } = body

  if (!contract_id || !unit_id || amount == null || !confirmed_by) {
    return apiError('Required: contract_id, unit_id, amount, confirmed_by')
  }

  const total = (amount || 0) + (water_fee || 0)

  // Check duplicate: if payment_id already has a ledger entry
  if (payment_id) {
    const { data: existing } = await supabase
      .from('payment_ledger')
      .select('id')
      .eq('payment_id', payment_id)
      .limit(1)

    if (existing && existing.length > 0) {
      return apiError('Este pago ya tiene una entrada en la bitácora', 409)
    }
  }

  // 1. Insert into payment_ledger
  const { data: entry, error: ledgerError } = await supabase
    .from('payment_ledger')
    .insert({
      org_id: orgId,
      payment_id: payment_id || null,
      contract_id,
      unit_id,
      tenant_name: tenant_name || null,
      amount,
      water_fee: water_fee || 0,
      total,
      payment_method: payment_method || 'efectivo',
      confirmed_by,
      notes: notes || null,
    })
    .select()
    .single()

  if (ledgerError) return apiError(ledgerError.message, 500)

  // 2. If payment_id → update payment status
  if (payment_id) {
    await supabase
      .from('payments')
      .update({
        status: 'paid',
        paid_date: new Date().toISOString().split('T')[0],
        confirmed_by,
        confirmed_at: new Date().toISOString(),
        payment_method: payment_method || 'efectivo',
      })
      .eq('id', payment_id)
  }

  // 3. Audit log
  await supabase.from('audit_log').insert({
    org_id: orgId,
    actor_type: 'human',
    actor_id: confirmed_by,
    action: 'payment.confirmed',
    entity_type: 'payment_ledger',
    entity_id: entry.id,
    after_data: entry,
  })

  return apiOk(entry)
}
