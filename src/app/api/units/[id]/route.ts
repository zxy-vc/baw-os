// BaW OS — Single Unit API (Tier 2 Agent Interface)
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()

  const { data, error } = await supabase
    .from('units')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error) return apiError(error.message, error.code === 'PGRST116' ? 404 : 500)
  return apiOk(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  // Prevent overriding org_id
  delete body.org_id
  delete body.id

  const { data, error } = await supabase
    .from('units')
    .update(body)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return apiError(error.message, error.code === 'PGRST116' ? 404 : 500)
  return apiOk(data)
}
