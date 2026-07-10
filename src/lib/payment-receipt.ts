// BaW OS — Envío de comprobante de pago por WhatsApp (Bloque 1: cobranza).
// Reutilizable desde varios puntos donde se registra un pago: API v1 de Alicia,
// webhook de Stripe, y el flujo manual de /cobros (vía /api/payments/[id]/receipt).
//
// Gateado por las mismas condiciones que la cobranza: solo envía si las
// credenciales de Meta están y COBRANZA_WHATSAPP_ENABLED='true'.

import { createServiceClient } from '@/lib/api-auth'
import {
  sendWhatsAppTemplate,
  whatsAppConfigured,
  cobranzaWhatsAppEnabled,
  buildReceiptTemplate,
} from '@/lib/whatsapp'

export interface ReceiptResult {
  ok: boolean
  reason?: string
}

/**
 * Envía el comprobante del pago indicado. No lanza; seguro como fire-and-forget.
 * `orgId` (opcional pero recomendado): si se pasa, el pago debe pertenecer a esa
 * org — evita IDOR (un caller que itera payment ids de otro tenant).
 */
export async function sendPaymentReceipt(paymentId: string, orgId?: string): Promise<ReceiptResult> {
  try {
    if (!whatsAppConfigured() || !cobranzaWhatsAppEnabled()) {
      return { ok: false, reason: 'whatsapp_disabled' }
    }
    const supabase = createServiceClient()

    let paymentQuery = supabase
      .from('payments')
      .select('id, org_id, contract_id, amount, amount_paid, paid_date, method, reference, late_fee_amount')
      .eq('id', paymentId)
    if (orgId) paymentQuery = paymentQuery.eq('org_id', orgId)
    const { data: payment } = await paymentQuery.maybeSingle()
    if (!payment || !payment.contract_id) return { ok: false, reason: 'payment_not_found' }

    const { data: contract } = await supabase
      .from('contracts')
      .select('id, occupant_id, unit_id')
      .eq('id', payment.contract_id as string)
      .maybeSingle()
    if (!contract) return { ok: false, reason: 'contract_not_found' }

    const [{ data: occupant }, { data: unit }] = await Promise.all([
      contract.occupant_id
        ? supabase.from('occupants').select('name, phone').eq('id', contract.occupant_id as string).maybeSingle()
        : Promise.resolve({ data: null }),
      contract.unit_id
        ? supabase.from('units').select('number').eq('id', contract.unit_id as string).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const phone = (occupant?.phone as string) || null
    if (!phone) return { ok: false, reason: 'no_phone' }

    const paidAmount = Number(payment.amount_paid ?? payment.amount ?? 0)
    // Comprobante = mensaje business-initiated → plantilla HSM aprobada
    // (texto libre fuera de la ventana de 24h lo rechaza Meta, error 131047).
    const template = buildReceiptTemplate({
      name: (occupant?.name as string) || 'inquilino',
      unit: (unit?.number as string) || '—',
      amount: paidAmount,
      method: payment.method as string | null,
      reference: payment.reference as string | null,
      date: payment.paid_date as string | null,
    })

    const res = await sendWhatsAppTemplate(phone, template)
    if (!res.ok) return { ok: false, reason: res.error }

    await supabase.from('audit_log').insert({
      org_id: payment.org_id,
      actor_type: 'agent',
      actor_id: 'cobranza',
      action: 'pago.comprobante_enviado',
      entity_type: 'payment',
      entity_id: payment.id,
      metadata: { to: phone, amount: paidAmount },
    })

    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'error' }
  }
}
