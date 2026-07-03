// BaW OS — PATCH /api/engagements/[id]
// Edita un engagement (whitelist de columnas) y agrega/quita contratos miembro.
import { NextRequest } from 'next/server'
import { createServiceClient, apiError, apiOk } from '@/lib/api-auth'
import { requireAdminCaller } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const PATCH_ALLOWED = new Set(['name', 'status', 'notes', 'payer_occupant_id', 'billing_mode'])

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)

  const body = await request.json().catch(() => null)
  if (!body) return apiError('Body inválido', 400)

  const supabase = createServiceClient()

  const { data: engagement } = await supabase
    .from('engagements')
    .select('id')
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .maybeSingle()
  if (!engagement) return apiError('Engagement no encontrado', 404)

  const updates: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (PATCH_ALLOWED.has(k)) updates[k] = v
  }

  const addIds: string[] = Array.isArray(body.add_contract_ids)
    ? body.add_contract_ids.filter((x: unknown) => typeof x === 'string')
    : []
  const removeIds: string[] = Array.isArray(body.remove_contract_ids)
    ? body.remove_contract_ids.filter((x: unknown) => typeof x === 'string')
    : []

  if (Object.keys(updates).length === 0 && addIds.length === 0 && removeIds.length === 0) {
    return apiError('No hay cambios válidos', 400)
  }

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString()
    const { error } = await supabase
      .from('engagements')
      .update(updates)
      .eq('id', params.id)
      .eq('org_id', auth.orgId)
    if (error) return apiError(error.message, 500)
  }

  if (addIds.length > 0) {
    const { error } = await supabase
      .from('contracts')
      .update({ engagement_id: params.id })
      .in('id', addIds)
      .eq('org_id', auth.orgId)
    if (error) return apiError(error.message, 500)
  }

  if (removeIds.length > 0) {
    const { error } = await supabase
      .from('contracts')
      .update({ engagement_id: null })
      .in('id', removeIds)
      .eq('org_id', auth.orgId)
      .eq('engagement_id', params.id)
    if (error) return apiError(error.message, 500)
  }

  return apiOk({ id: params.id })
}
