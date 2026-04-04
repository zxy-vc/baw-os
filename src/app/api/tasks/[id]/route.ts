// BaW OS — Tasks PATCH API
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
  const id = params.id

  // Only allow specific fields to be updated
  const allowed: Record<string, unknown> = {}
  if (body.status !== undefined) allowed.status = body.status
  if (body.assigned_to !== undefined) allowed.assigned_to = body.assigned_to
  if (body.title !== undefined) allowed.title = body.title
  if (body.description !== undefined) allowed.description = body.description
  if (body.priority !== undefined) allowed.priority = body.priority
  if (body.due_date !== undefined) allowed.due_date = body.due_date

  if (Object.keys(allowed).length === 0) {
    return apiError('No valid fields to update')
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(allowed)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return apiError(error.message, 500)
  return apiOk(data)
}
