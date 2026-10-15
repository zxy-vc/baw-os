// BaW OS — Ancillary Assets API (Tier 2 Agent Interface)
// Activos accesorios discretos: espectaculares, bodegas, antenas.
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'
import { requireAdminCaller } from '@/lib/admin-auth'
import { findCrossOrgDependents } from '@/lib/cross-org-dependents'
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

// BAW-2: DELETE solo con sesión owner/admin de la org activa (mismo criterio
// que la política RLS de borrado) y acotado a esa org (antes API key global →
// borraba por id en cualquier org).
export async function DELETE(request: NextRequest) {
  const auth = await requireAdminCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)

  const id = searchParams.get('id')
  if (!id) return apiError('id query param is required')

  const { data: existing } = await supabase
    .from('ancillary_assets')
    .select('id')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .maybeSingle()
  if (!existing) return apiError('Asset not found', 404)

  // Borrar el padre propio no puede borrar/modificar hijos de otra org vía FK
  // CASCADE / SET NULL (BAW-2). Hijo ajeno → 409; error de lectura → 500.
  const deps = await findCrossOrgDependents(supabase, 'ancillary_assets', id, auth.orgId)
  if (deps.error) return apiError(deps.error, 500)
  if (deps.blocked) {
    return apiError('No se puede eliminar: hay registros de otra organización que lo referencian.', 409)
  }

  const { data: deleted, error } = await supabase
    .from('ancillary_assets')
    .delete()
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select('id')

  if (error) return apiError(error.message, 500)
  if (!deleted?.length) return apiError('Asset not found', 404)

  await logEvent('ancillary_asset.deleted', { asset_id: id }, 'api', auth.orgId)

  return apiOk({ deleted: id })
}
