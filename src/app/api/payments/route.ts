// BaW OS — Payments API (Tier 2 Agent Interface)
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'
import { logEvent } from '@/lib/webhooks'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()

  const { data, error } = await supabase
    .from('payments')
    .select('*, contract:contracts(*, unit:units(*), occupant:occupants(*))')
    .eq('org_id', orgId)
    .gte('due_date', monthStart)
    .lte('due_date', monthEnd)
    .order('due_date')

  if (error) return apiError(error.message, 500)
  return apiOk(data)
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  const { contract_id, amount, method, reference } = body
  if (!contract_id || !amount) {
    return apiError('contract_id and amount are required')
  }

  const { data, error } = await supabase
    .from('payments')
    .insert({
      org_id: orgId,
      contract_id,
      amount,
      amount_paid: amount,
      due_date: new Date().toISOString().split('T')[0],
      paid_date: new Date().toISOString().split('T')[0],
      status: 'paid',
      method: method || 'transfer',
      reference: reference || null,
    })
    .select('*, contract:contracts(*, unit:units(*), occupant:occupants(*))')
    .single()

  if (error) return apiError(error.message, 500)

  await logEvent('payment.received', {
    payment_id: data.id,
    contract_id,
    amount,
    method: method || 'transfer',
  })

  return apiOk(data)
}
