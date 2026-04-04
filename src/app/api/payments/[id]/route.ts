import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'
import { logEvent } from '@/lib/webhooks'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  const { data, error } = await supabase
    .from('payments')
    .update(body)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select('*, contract:contracts(*, unit:units(*), occupant:occupants(*))')
    .single()

  if (error) return apiError(error.message, 500)

  await logEvent('payment.updated', {
    payment_id: params.id,
    changes: Object.keys(body),
  })

  return apiOk(data)
}
