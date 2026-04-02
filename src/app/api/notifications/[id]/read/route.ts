// BaW OS — Mark Notification as Read
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()

  const { data, error } = await supabase
    .from('webhook_events')
    .update({ read: true })
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return apiError(error.message, 500)
  return apiOk(data)
}
