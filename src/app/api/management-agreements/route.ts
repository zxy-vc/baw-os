// BaW OS — Acuerdos de comisión de administración (ADR-022 §3.2)
// GET: lista los acuerdos de la org. POST: crea uno nuevo (append-only, estilo
// service_rates — la resolución de vigencia elige el más reciente aplicable;
// sin acuerdo, aplica el 10% base).
import { NextRequest } from 'next/server'
import { createServiceClient, apiError, apiOk } from '@/lib/api-auth'
import { requireAdminCaller, requireMemberCaller } from '@/lib/admin-auth'
import { canFinance } from '@/lib/finance-permissions'

export const dynamic = 'force-dynamic'

const FEE_TYPES = ['percent_collected', 'percent_billed', 'flat_monthly']

export async function GET() {
  const auth = await requireMemberCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('management_agreements')
    .select(
      'id, building_id, owner_id, fee_type, fee_value, effective_from, effective_to, notes, created_at, building:buildings(name), owner:property_owners(full_name)',
    )
    .eq('org_id', auth.orgId)
    .order('effective_from', { ascending: false })
  if (error) return apiError(error.message, 500)
  return apiOk(data ?? [])
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)
  if (!auth.isPlatformAdmin && !canFinance(auth.role, 'finance.configure_agreements')) {
    return apiError('Tu rol no puede configurar comisiones', 403)
  }

  const body = await request.json().catch(() => null)
  const buildingId = body?.building_id
  const feeType = body?.fee_type
  const feeValue = Number(body?.fee_value)
  const effectiveFrom = body?.effective_from
  if (!buildingId) return apiError('building_id es requerido')
  if (!FEE_TYPES.includes(feeType)) return apiError('fee_type inválido')
  if (!Number.isFinite(feeValue) || feeValue < 0) return apiError('fee_value inválido')
  if (typeof effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return apiError('effective_from (YYYY-MM-DD) es requerido')
  }

  const supabase = createServiceClient()
  const { data: building } = await supabase
    .from('buildings')
    .select('id')
    .eq('id', buildingId)
    .eq('org_id', auth.orgId)
    .maybeSingle()
  if (!building) return apiError('Edificio no encontrado en tu organización', 404)

  if (body?.owner_id) {
    const { data: owner } = await supabase
      .from('property_owners')
      .select('id')
      .eq('id', body.owner_id)
      .eq('org_id', auth.orgId)
      .maybeSingle()
    if (!owner) return apiError('Propietario no encontrado en tu organización', 404)
  }

  const { data, error } = await supabase
    .from('management_agreements')
    .insert({
      org_id: auth.orgId,
      building_id: buildingId,
      owner_id: body?.owner_id || null,
      fee_type: feeType,
      fee_value: feeValue,
      effective_from: effectiveFrom,
      effective_to: body?.effective_to || null,
      notes: body?.notes || null,
      created_by: auth.userId,
    })
    .select()
    .single()
  if (error) return apiError(error.message, 500)
  return apiOk(data)
}
