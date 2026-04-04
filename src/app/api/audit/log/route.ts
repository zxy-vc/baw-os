// BaW OS — Audit Log API
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  const { actor_type, actor_id, action } = body
  if (!actor_type || !actor_id || !action) {
    return apiError('actor_type, actor_id, and action are required')
  }
  if (!['human', 'agent'].includes(actor_type)) {
    return apiError('actor_type must be human or agent')
  }

  const { data, error } = await supabase
    .from('audit_log')
    .insert({
      org_id: orgId,
      actor_type,
      actor_id,
      action,
      entity_type: body.entity_type || null,
      entity_id: body.entity_id || null,
      before_data: body.before_data || null,
      after_data: body.after_data || null,
      metadata: body.metadata || null,
    })
    .select()
    .single()

  if (error) return apiError(error.message, 500)
  return apiOk(data)
}
