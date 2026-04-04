// BaW OS — Tasks API
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const { searchParams } = new URL(request.url)

  let query = supabase
    .from('tasks')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  const status = searchParams.get('status')
  if (status && ['pending', 'in_progress', 'done'].includes(status)) {
    query = query.eq('status', status)
  }

  const assigned_to = searchParams.get('assigned_to')
  if (assigned_to) {
    query = query.eq('assigned_to', assigned_to)
  }

  const { data, error } = await query
  if (error) return apiError(error.message, 500)
  return apiOk(data)
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  const { title } = body
  if (!title) return apiError('title is required')

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      org_id: orgId,
      title,
      description: body.description || null,
      assigned_to: body.assigned_to || null,
      created_by: body.created_by || null,
      entity_type: body.entity_type || null,
      entity_id: body.entity_id || null,
      due_date: body.due_date || null,
      status: body.status || 'pending',
      priority: body.priority || 'normal',
    })
    .select()
    .single()

  if (error) return apiError(error.message, 500)
  return apiOk(data)
}
