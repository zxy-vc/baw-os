// BaW OS — Marcar cobro en efectivo desde el portal de conserje (ADR-022 D5)
//
// POST con header x-conserje-token. Reemplaza el UPDATE directo a `payments`
// que el browser hacía con la anon key. Límites del conserje (ADR-022 §4.1):
// solo puede marcar como pagado un cargo EXISTENTE, pendiente y de su org —
// no crea cargos, no edita montos, no toca otros estados. Todo asiento queda
// atribuido (confirmed_by) y deja bitácora inmutable en payment_ledger,
// igual que el webhook de Stripe.
import { NextRequest } from 'next/server'
import { createServiceClient, apiError, apiOk, unauthorized } from '@/lib/api-auth'
import { verifyConserjeToken } from '@/lib/conserje-auth'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const orgId = verifyConserjeToken(request.headers.get('x-conserje-token'))
  if (!orgId) return unauthorized('Sesión de conserje inválida o expirada')

  const supabase = createServiceClient()
  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .select(
      'id, org_id, status, amount, water_fee, late_fee_amount, contract_id, contract:contracts(unit_id, occupant:occupants(name))',
    )
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (payErr) return apiError(payErr.message, 500)
  if (!payment) return apiError('Cobro no encontrado', 404)
  if (payment.status !== 'pending') {
    return apiError('Solo se pueden marcar cobros pendientes', 409)
  }

  // Mismo criterio que el webhook de Stripe: el cargo se liquida completo
  // (base + recargo de mora) para que billing.ts lo proyecte como pagado.
  const totalDue =
    Number(payment.amount || 0) + Number(payment.late_fee_amount || 0)
  const today = new Date().toISOString().split('T')[0]

  const { error: updErr } = await supabase
    .from('payments')
    .update({
      status: 'paid',
      method: 'cash',
      payment_method: 'efectivo',
      paid_date: today,
      amount_paid: totalDue,
      confirmed_by: 'conserje',
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', payment.id)
    .eq('org_id', orgId)
    .eq('status', 'pending')

  if (updErr) return apiError(updErr.message, 500)

  const contract = payment.contract as unknown as {
    unit_id: string | null
    occupant: { name: string } | null
  } | null

  await supabase.from('payment_ledger').insert({
    org_id: orgId,
    payment_id: payment.id,
    contract_id: payment.contract_id,
    unit_id: contract?.unit_id || null,
    tenant_name: contract?.occupant?.name || null,
    amount: Number(payment.amount || 0) - Number(payment.water_fee || 0),
    water_fee: Number(payment.water_fee || 0),
    total: Number(payment.amount || 0),
    payment_method: 'efectivo',
    confirmed_by: 'conserje',
    notes: 'Cobro en recepción (portal conserje)',
  })

  return apiOk({ id: payment.id, status: 'paid', amount_paid: totalDue })
}
