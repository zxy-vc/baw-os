// BaW OS — Cuentas combinadas (engagements)
// GET: lista los engagements de la org con pagador y contratos miembro.
// POST: crea un engagement y opcionalmente le asigna contratos.
import { NextRequest } from 'next/server'
import { createServiceClient, apiError, apiOk } from '@/lib/api-auth'
import { requireMemberCaller, requireAdminCaller } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  const auth = await requireMemberCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)

  const supabase = createServiceClient()
  const { data: engagements, error } = await supabase
    .from('engagements')
    .select('id, name, payer_occupant_id, billing_mode, status, notes, created_at, payer:occupants(id, name, kind)')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })
  if (error) return apiError(error.message, 500)

  const ids = (engagements || []).map((e) => e.id)
  let membersByEngagement = new Map<string, unknown[]>()
  if (ids.length > 0) {
    const { data: contracts, error: contractsError } = await supabase
      .from('contracts')
      .select('id, engagement_id, status, monthly_amount, unit:units(number), occupant:occupants(name)')
      .in('engagement_id', ids)
      .eq('org_id', auth.orgId)
    if (contractsError) return apiError(contractsError.message, 500)
    membersByEngagement = new Map()
    for (const c of contracts || []) {
      const list = membersByEngagement.get(c.engagement_id) || []
      list.push(c)
      membersByEngagement.set(c.engagement_id, list)
    }
  }

  return apiOk(
    (engagements || []).map((e) => ({ ...e, contracts: membersByEngagement.get(e.id) || [] })),
  )
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return apiError('name es requerido', 400)

  const contractIds: string[] = Array.isArray(body?.contract_ids)
    ? body.contract_ids.filter((x: unknown) => typeof x === 'string')
    : []

  const supabase = createServiceClient()

  // El pagador (si viene) debe ser un occupant de la misma org.
  if (body?.payer_occupant_id) {
    const { data: payer } = await supabase
      .from('occupants')
      .select('id')
      .eq('id', body.payer_occupant_id)
      .eq('org_id', auth.orgId)
      .maybeSingle()
    if (!payer) return apiError('payer_occupant_id no pertenece a la org', 400)
  }

  const { data: engagement, error } = await supabase
    .from('engagements')
    .insert({
      org_id: auth.orgId,
      name,
      payer_occupant_id: body?.payer_occupant_id ?? null,
      billing_mode: body?.billing_mode === 'per_unit' ? 'per_unit' : 'consolidated',
      notes: typeof body?.notes === 'string' ? body.notes : null,
    })
    .select('id, name, payer_occupant_id, billing_mode, status, notes, created_at')
    .single()
  if (error || !engagement) return apiError(error?.message || 'No se pudo crear', 500)

  if (contractIds.length > 0) {
    const { error: assignError } = await supabase
      .from('contracts')
      .update({ engagement_id: engagement.id })
      .in('id', contractIds)
      .eq('org_id', auth.orgId)
    if (assignError) return apiError(`Engagement creado pero sin asignar contratos: ${assignError.message}`, 500)
  }

  return apiOk(engagement)
}
