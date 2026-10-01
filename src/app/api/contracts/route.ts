// BaW OS — Contracts API (Tier 2 Agent Interface)
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'
import { requireMemberCaller } from '@/lib/admin-auth'
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

// BAW-2: DELETE solo con sesión de un miembro y acotado a su org (antes API
// key global → borraba contratos de cualquier org por id).
export async function DELETE(request: NextRequest) {
  const auth = await requireMemberCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)

  const id = searchParams.get('id')
  if (!id) return apiError('id query param is required')

  const { data: contract } = await supabase
    .from('contracts')
    .select('id')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .maybeSingle()
  if (!contract) return apiError('Contract not found', 404)

  // Guard: NUNCA borrar pagos en silencio. Si el contrato tiene historia
  // financiera, se rechaza (la vía correcta es archivar — ver /api/lifecycle).
  const { count: payCount } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('contract_id', id)
    .eq('org_id', auth.orgId)

  if ((payCount ?? 0) > 0) {
    return apiError('No se puede eliminar: el contrato tiene pagos registrados. Archívalo en su lugar.', 409)
  }

  const { error } = await supabase
    .from('contracts')
    .delete()
    .eq('id', id)
    .eq('org_id', auth.orgId)

  if (error) return apiError(error.message, 500)

  await logEvent('contract.deleted', { contract_id: id })

  return apiOk({ deleted: id })
}
