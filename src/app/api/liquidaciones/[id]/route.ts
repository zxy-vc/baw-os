// BaW OS — Anular un estado de cuenta emitido (ADR-022 §3.2)
// PATCH { action: 'void' } — solo statements 'issued' sin payouts. El snapshot
// no se edita jamás: para corregir, se anula y se re-emite.
import { NextRequest } from 'next/server'
import { createServiceClient, apiError, apiOk } from '@/lib/api-auth'
import { requireAdminCaller } from '@/lib/admin-auth'
import { canFinance } from '@/lib/finance-permissions'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAdminCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)
  if (!auth.isPlatformAdmin && !canFinance(auth.role, 'finance.emit_statements')) {
    return apiError('Tu rol no puede anular estados de cuenta', 403)
  }

  const body = await request.json().catch(() => null)
  if (body?.action !== 'void') return apiError("action debe ser 'void'")

  const supabase = createServiceClient()
  const { data: statement } = await supabase
    .from('owner_statements')
    .select('id, status')
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .maybeSingle()

  if (!statement) return apiError('Estado de cuenta no encontrado', 404)
  if (statement.status !== 'issued') {
    return apiError('Solo se pueden anular estados de cuenta emitidos sin pagos', 409)
  }

  const { count } = await supabase
    .from('owner_payouts')
    .select('id', { count: 'exact', head: true })
    .eq('statement_id', statement.id)
  if ((count ?? 0) > 0) {
    return apiError('Tiene pagos registrados — no se puede anular', 409)
  }

  const { data, error } = await supabase
    .from('owner_statements')
    .update({ status: 'void' })
    .eq('id', statement.id)
    .select()
    .single()
  if (error) return apiError(error.message, 500)
  return apiOk(data)
}
