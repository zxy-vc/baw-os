// BaW OS — Ancillary Charges API (Tier 2 Agent Interface)
// Cargos accesorios (estacionamiento extra, espectaculares) SIEMPRE ligados a
// un contrato. La generación automática en cobranza vive en el cron (PR B3).
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'
import { logEvent } from '@/lib/webhooks'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const { searchParams } = new URL(request.url)
  const contractId = searchParams.get('contract_id')
  const kind = searchParams.get('kind')
  const status = searchParams.get('status')

  let query = supabase
    .from('ancillary_charges')
    .select('*, contract:contracts(*, unit:units(*), occupant:occupants(*)), asset:ancillary_assets(*)')
    .eq('org_id', orgId)

  if (contractId) query = query.eq('contract_id', contractId)
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

  // Invariante: todo cargo accesorio cuelga de un contrato.
  if (!body.contract_id) return apiError('contract_id is required')
  if (!body.kind) return apiError('kind is required')
  if (body.amount === undefined || body.amount === null) return apiError('amount is required')

  const { data, error } = await supabase
    .from('ancillary_charges')
    .insert({ ...body, org_id: orgId })
    .select('*, contract:contracts(*, unit:units(*), occupant:occupants(*)), asset:ancillary_assets(*)')
    .single()

  if (error) return apiError(error.message, 500)

  await logEvent('ancillary_charge.created', {
    charge_id: data.id,
    contract_id: data.contract_id,
    kind: data.kind,
    amount: data.amount,
    cadence: data.cadence,
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
    .from('ancillary_charges')
    .delete()
    .eq('id', id)

  if (error) return apiError(error.message, 500)

  await logEvent('ancillary_charge.deleted', { charge_id: id })

  return apiOk({ deleted: id })
}
