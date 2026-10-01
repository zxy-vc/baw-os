import { NextRequest } from 'next/server'
import {
  validateApiKey,
  createServiceClient,
  unauthorized,
  apiError,
  apiOk,
  getOrgId,
} from '@/lib/api-auth'
import { requireMemberCaller } from '@/lib/admin-auth'
import { logEvent } from '@/lib/webhooks'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()
  const supabase = createServiceClient()
  const orgId = getOrgId()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const priority = searchParams.get('priority')

  let query = supabase
    .from('incidents')
    .select('*, unit:units(number, type)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)

  const { data, error } = await query
  if (error) return apiError(error.message, 500)
  return apiOk(data)
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()
  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  const { data, error } = await supabase
    .from('incidents')
    .insert({ ...body, org_id: orgId })
    .select()
    .single()

  if (error) return apiError(error.message, 500)

  await logEvent('incident.opened', {
    incident_id: data.id,
    title: body.title,
    priority: body.priority,
    unit_id: body.unit_id,
  })

  return apiOk(data)
}

// BAW-2: DELETE solo con sesión de un miembro y acotado a su org (antes API
// key global → borraba por id en cualquier org).
export async function DELETE(request: NextRequest) {
  const auth = await requireMemberCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)

  const id = searchParams.get('id')
  if (!id) return apiError('id query param is required')

  const { data: deleted, error } = await supabase
    .from('incidents')
    .delete()
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select('id')

  if (error) return apiError(error.message, 500)
  if (!deleted?.length) return apiError('Incident not found', 404)

  await logEvent('incident.deleted', { incident_id: id })

  return apiOk({ deleted: id })
}
