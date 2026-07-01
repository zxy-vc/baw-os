import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'
import { logEvent } from '@/lib/webhooks'

// Columnas que el caller puede modificar. Antes era update(body) crudo → un
// caller podía sobreescribir org_id/contract_id/id y mover el pago de tenant.
const PATCH_ALLOWED = new Set([
  'status', 'amount', 'amount_paid', 'rent_amount', 'water_fee', 'late_fee_amount',
  'late_fee_level', 'paid_date', 'due_date', 'method', 'payment_method', 'reference',
  'confirmed_by', 'confirmed_at', 'notes',
])

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  const updates: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body || {})) {
    if (PATCH_ALLOWED.has(k)) updates[k] = v
  }
  if (Object.keys(updates).length === 0) return apiError('No hay campos válidos para actualizar', 400)

  const { data, error } = await supabase
    .from('payments')
    .update(updates)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select('*, contract:contracts(*, unit:units(*), occupant:occupants(*))')
    .single()

  if (error) return apiError(error.message, 500)

  await logEvent('payment.updated', {
    payment_id: params.id,
    changes: Object.keys(updates),
  })

  return apiOk(data)
}
