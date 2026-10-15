// BaW OS — Contracts API (Tier 2 Agent Interface)
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'
import { requireAdminCaller } from '@/lib/admin-auth'
import { logEvent } from '@/lib/webhooks'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('contracts')
    .select('*, unit:units(*), occupant:occupants(*)')
    .eq('org_id', orgId)

  if (status === 'active') {
    query = query.eq('status', 'active')
  } else if (status === 'overdue') {
    // Filter active contracts; overdue logic applied below
    query = query.eq('status', 'active')
  } else if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return apiError(error.message, 500)

  if (status === 'overdue') {
    const now = new Date()
    const currentDay = now.getDate()
    const overdue = (data || []).filter((c: { payment_day: number }) => c.payment_day < currentDay)
    return apiOk(overdue)
  }

  return apiOk(data)
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  const { data, error } = await supabase
    .from('contracts')
    .insert({ ...body, org_id: orgId })
    .select('*, unit:units(*), occupant:occupants(*)')
    .single()

  if (error) return apiError(error.message, 500)

  await logEvent('contract.created', {
    contract_id: data.id,
    unit_id: body.unit_id,
    occupant_id: body.occupant_id,
    rent: body.rent,
  })

  return apiOk(data)
}

// BAW-2: DELETE solo con sesión owner/admin de la org activa y acotado a esa
// org (antes API key global → borraba contratos de cualquier org por id).
//
// El borrado FÍSICO queda deshabilitado: las FKs son por id (no por (org_id,
// id)) y ancillary_charges / stay_occupants lo referencian con ON DELETE
// CASCADE (y de ahí payments.ancillary_charge_id con SET NULL), así que borrar
// una fila propia podía borrar o modificar filas de OTRA org (también de forma
// transitiva y en carrera con inserciones concurrentes). Sin una migración que
// lo haga atómico no hay forma segura de garantizarlo → id ajeno 404 (sin
// revelar existencia), id propio 409 con la alternativa: archivar vía POST
// /api/lifecycle { entity: 'contract', action: 'archive' }.
export async function DELETE(request: NextRequest) {
  const auth = await requireAdminCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)

  const id = searchParams.get('id')
  if (!id) return apiError('id query param is required')

  const { data: existing } = await supabase
    .from('contracts')
    .select('id')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .maybeSingle()
  if (!existing) return apiError('Contract not found', 404)

  return apiError('No se puede eliminar un contrato. Archívalo en su lugar (Ciclo de vida → Archivar).', 409)
}
