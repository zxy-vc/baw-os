// BaW OS — Registrar pago al propietario (ADR-022 §3.2, el "abono" del flujo B)
// POST { amount, method?, reference?, paid_date?, notes? }. Registro manual
// (transferencia/SPEI hecha fuera del sistema) — no mueve dinero. Cuando la
// suma de payouts cubre el net_payout, el statement pasa a 'paid'.
import { NextRequest } from 'next/server'
import { createServiceClient, apiError, apiOk } from '@/lib/api-auth'
import { requireAdminCaller } from '@/lib/admin-auth'
import { canFinance } from '@/lib/finance-permissions'

export const dynamic = 'force-dynamic'

const METHODS = ['transfer', 'spei', 'cash', 'other']

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAdminCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)
  if (!auth.isPlatformAdmin && !canFinance(auth.role, 'finance.record_payout')) {
    return apiError('Tu rol no puede registrar pagos a propietarios', 403)
  }

  const body = await request.json().catch(() => null)
  const amount = Number(body?.amount)
  if (!Number.isFinite(amount) || amount <= 0) return apiError('amount inválido')
  const method = METHODS.includes(body?.method) ? body.method : 'transfer'
  const paidDate =
    typeof body?.paid_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.paid_date)
      ? body.paid_date
      : new Date().toISOString().split('T')[0]

  const supabase = createServiceClient()
  const { data: statement } = await supabase
    .from('owner_statements')
    .select('id, status, net_payout')
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .maybeSingle()

  if (!statement) return apiError('Estado de cuenta no encontrado', 404)
  if (statement.status !== 'issued' && statement.status !== 'paid') {
    return apiError('Solo se registran pagos sobre estados de cuenta emitidos', 409)
  }

  const { data: payout, error } = await supabase
    .from('owner_payouts')
    .insert({
      org_id: auth.orgId,
      statement_id: statement.id,
      amount,
      method,
      reference: body?.reference || null,
      paid_date: paidDate,
      notes: body?.notes || null,
      confirmed_by: auth.userId,
    })
    .select()
    .single()
  if (error) return apiError(error.message, 500)

  // ¿Ya quedó cubierto el neto? → statement pagado.
  const { data: allPayouts } = await supabase
    .from('owner_payouts')
    .select('amount')
    .eq('statement_id', statement.id)
  const totalPaid = (allPayouts ?? []).reduce((s, p) => s + Number(p.amount || 0), 0)
  let status = statement.status
  if (totalPaid >= Number(statement.net_payout) && statement.status === 'issued') {
    await supabase
      .from('owner_statements')
      .update({ status: 'paid' })
      .eq('id', statement.id)
    status = 'paid'
  }

  return apiOk({ payout, statement_status: status, total_paid: totalPaid })
}
