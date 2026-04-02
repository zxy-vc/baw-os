// BaW OS — Unread Notifications Count
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()

  const { count, error } = await supabase
    .from('webhook_events')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('read', false)

  if (error) return apiError(error.message, 500)
  return apiOk({ count: count || 0 })
}
