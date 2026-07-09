// BaW OS — Acciones de cobranza compartidas entre /cobros y /cobros/[contractId]
// (extraídas de cobros/page.tsx al crear la cuenta del inquilino, para no
// duplicar la escritura cargo + abono + bitácora — AGENTS.md §1.3).
//
// Modelo por mes: fila `payments` (cargo) + N `payment_receipts` (abonos) +
// asientos `payment_ledger` (auditoría). El amount_paid/status del cargo se
// recalcula SIEMPRE en el server (POST /api/payments/[id]/recompute) — nunca
// en el cliente.

import { supabase } from '@/lib/supabase'
import { mapPaymentMethod } from '@/lib/cobros'

export interface QuickPayContract {
  id: string
  unit_id: string
  monthly_amount: number
  occupant: { name: string } | null
}

export interface QuickPayRow {
  contract: QuickPayContract
  payment: { id: string; rent_amount: number | null; water_fee: number | null } | null
  dueDate: string
  waterFee: number
}

/** Recalcula amount_paid/status del cargo en el server. Devuelve ok. */
export async function recomputeCharge(paymentId: string): Promise<boolean> {
  const res = await fetch(`/api/payments/${paymentId}/recompute`, { method: 'POST' })
  return res.ok
}

export interface QuickPayResult {
  ok: boolean
  /** false = el abono quedó escrito pero el cargo no se recalculó (server) */
  recomputeOk: boolean
}

/**
 * Marca el mes pagado completo (renta + agua, sin mora, fecha = vencimiento,
 * referencia "histórico"). `ok` = pipeline escrito; `recomputeOk` = el server
 * recalculó amount_paid/status (si es false, el mes puede seguir viéndose
 * impago — el caller debe avisar, como hacía el toast original de /cobros).
 */
export async function quickPayMonth(
  orgId: string,
  row: QuickPayRow,
  confirmedBy: string,
): Promise<QuickPayResult> {
  const c = row.contract
  const rent = row.payment?.rent_amount ?? c.monthly_amount
  const water = row.payment?.water_fee ?? row.waterFee
  const charge = {
    amount: rent + water,
    rent_amount: rent,
    water_fee: water,
    late_fee_amount: 0,
    late_fee_level: null,
  }
  let cid = row.payment?.id ?? null
  if (cid) {
    await supabase.from('payments').update(charge).eq('id', cid)
  } else {
    const { data, error } = await supabase
      .from('payments')
      .insert({ ...charge, org_id: orgId, contract_id: c.id, due_date: row.dueDate, amount_paid: 0, status: 'pending' })
      .select('id')
      .single()
    if (error || !data) return { ok: false, recomputeOk: true }
    cid = data.id
  }
  const { methodEnum, paymentMethodEs } = mapPaymentMethod('Transferencia')
  const { error } = await supabase.from('payment_receipts').insert({
    org_id: orgId,
    payment_id: cid,
    contract_id: c.id,
    amount: rent + water,
    paid_date: row.dueDate,
    method: methodEnum,
    payment_method: paymentMethodEs,
    reference: 'Histórico (pago rápido)',
    payer_occupant_id: null,
    confirmed_by: confirmedBy,
  })
  if (error) return { ok: false, recomputeOk: true }
  const recomputeOk = await recomputeCharge(cid as string)
  await supabase.from('payment_ledger').insert({
    org_id: orgId,
    payment_id: cid,
    contract_id: c.id,
    unit_id: c.unit_id,
    tenant_name: c.occupant?.name || null,
    amount: rent,
    water_fee: water,
    total: rent + water,
    payment_method: paymentMethodEs,
    confirmed_by: confirmedBy,
    notes: 'Pago rápido (histórico)',
  })
  return { ok: true, recomputeOk }
}
