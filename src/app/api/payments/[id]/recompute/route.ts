// BaW OS — POST /api/payments/[id]/recompute
// Deriva amount_paid + status del cargo desde la suma de sus abonos
// (payment_receipts), en el server. Antes este recálculo vivía solo en el
// cliente de /cobros: si el browser moría entre el insert del abono y el
// update del cargo, el mes quedaba inconsistente (abono registrado, cargo sin
// actualizar). Aquí el cliente solo dispara; los datos salen todos de la DB.
import { NextRequest } from 'next/server'
import { createServiceClient, apiError, apiOk } from '@/lib/api-auth'
import { requireMemberCaller } from '@/lib/admin-auth'
import { isVoidCharge } from '@/lib/billing'

export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireMemberCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)

  const supabase = createServiceClient()

  const { data: charge, error: chargeError } = await supabase
    .from('payments')
    .select('id, amount, late_fee_amount, status')
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .maybeSingle()
  if (chargeError) return apiError(chargeError.message, 500)
  if (!charge) return apiError('Cargo no encontrado', 404)
  // Un cargo anulado por corte (BAW-18) no se reactiva recalculando.
  if (isVoidCharge(charge.status)) return apiError('Cargo anulado: no se puede recalcular', 409)

  const { data: receipts, error: receiptsError } = await supabase
    .from('payment_receipts')
    .select('amount, paid_date, method, payment_method, confirmed_by')
    .eq('payment_id', params.id)
    .eq('org_id', auth.orgId)
    .order('paid_date', { ascending: true })
  if (receiptsError) return apiError(receiptsError.message, 500)

  const list = receipts ?? []
  const sum = list.reduce((s, r) => s + Number(r.amount), 0)
  const last = list[list.length - 1]
  const total = Number(charge.amount ?? 0) + Number(charge.late_fee_amount ?? 0)
  const status = total > 0 && sum + 0.001 >= total ? 'paid' : sum > 0 ? 'partial' : 'pending'

  // Metadatos del último abono (método/confirmó/fecha) para que el grid de
  // cobros los muestre igual que antes.
  const updates = {
    amount_paid: sum,
    status,
    paid_date: last?.paid_date ?? null,
    method: last?.method ?? null,
    payment_method: last?.payment_method ?? null,
    confirmed_by: last?.confirmed_by ?? null,
    confirmed_at: last ? new Date().toISOString() : null,
  }

  // Escritura condicionada al estatus leído: si alguien lo anuló entre medio, no se pisa.
  const { data: updated, error: updateError } = await supabase
    .from('payments')
    .update(updates)
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .eq('status', charge.status)
    .select('id')
  if (updateError) return apiError(updateError.message, 500)
  if (!updated || updated.length === 0) return apiError('El cargo cambió mientras se recalculaba; reintenta', 409)

  return apiOk({ id: params.id, ...updates })
}
