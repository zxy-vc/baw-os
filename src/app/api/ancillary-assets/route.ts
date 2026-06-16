// BaW OS — Ancillary Assets API (Tier 2 Agent Interface)
// Activos accesorios discretos: espectaculares, bodegas, antenas.
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'
import { logEvent } from '@/lib/webhooks'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const { searchParams } = new URL(request.url)
  const buildingId = searchParams.get('building_id')
  const kind = searchParams.get('kind')
  const status = searchParams.get('status')

  let query = supabase
    .from('ancillary_assets')
    .select('*, building:buildings(*)')
    .eq('org_id', orgId)

  if (buildingId) query = query.eq('building_id', buildingId)
  if (kind) query = query.eq('kind', kind)
  if (status) query = query.eq('status', status)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return apiError(error.message, 500)

  return apiOk(data)
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  if (!body.label) return apiError('label is required')

  const { data, error } = await supabase
    .from('ancillary_assets')
    .insert({ ...body, org_id: orgId })
    .select('*, building:buildings(*)')
    .single()

  if (error) return apiError(error.message, 500)

  await logEvent('ancillary_asset.created', {
    asset_id: data.id,
    kind: data.kind,
    building_id: data.building_id,
  })

  return apiOk(data)
}

export async function DELETE(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)

  const id = searchParams.get('id')
  if (!id) return apiError('id query param is required')

  const { error } = await supabase
    .from('ancillary_assets')
    .delete()
    .eq('id', id)

  if (error) return apiError(error.message, 500)

  await logEvent('ancillary_asset.deleted', { asset_id: id })

  return apiOk({ deleted: id })
}
