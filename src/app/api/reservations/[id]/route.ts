import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  // Prevent overriding org or id
  delete body.organization_id
  delete body.id

  const { data, error } = await supabase
    .from('reservations')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .select('*, unit:units(*)')
    .single()

  if (error) return apiError(error.message, 500)
  return apiOk(data)
}
