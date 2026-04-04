// BaW OS — Expediente individual de aplicación (vista interna)
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiKey(request)) return unauthorized()

  try {
    const { id } = await params
    const supabase = createServiceClient()
    const orgId = getOrgId()

    const { data, error } = await supabase
      .from('tenant_applications')
      .select('*, unit:units(id, number, floor, type)')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error || !data) return apiError('Aplicación no encontrada', 404)
    return apiOk(data)
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Error interno', 500)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiKey(request)) return unauthorized()

  try {
    const { id } = await params
    const supabase = createServiceClient()
    const orgId = getOrgId()
    const body = await request.json()

    // Solo permitir actualizar status y notas
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.status) {
      updates.status = body.status
      if (body.status === 'approved' || body.status === 'rejected') {
        updates.reviewed_at = new Date().toISOString()
        updates.reviewed_by = body.reviewed_by || 'admin'
      }
    }
    if (body.notes !== undefined) updates.notes = body.notes

    const { data, error } = await supabase
      .from('tenant_applications')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select('*, unit:units(id, number, floor, type)')
      .single()

    if (error) return apiError(error.message, 500)
    return apiOk(data)
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Error interno', 500)
  }
}
