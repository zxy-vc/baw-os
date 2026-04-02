// BaW OS — Mark All Notifications as Read
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()

  const { error } = await supabase
    .from('webhook_events')
    .update({ read: true })
    .eq('org_id', orgId)
    .eq('read', false)

  if (error) return apiError(error.message, 500)
  return apiOk({ message: 'All notifications marked as read' })
}
