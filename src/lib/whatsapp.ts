// BaW OS — WhatsApp Business (Meta Cloud API) — sender + plantillas de cobranza
//
// Helper server-side reutilizable para enviar mensajes reales. El disparo
// automático de cobranza está detrás de COBRANZA_WHATSAPP_ENABLED para que el
// despliegue sea seguro: nada se envía hasta que Fran lo encienda con sus
// credenciales de Meta.

import type { MoraLevel } from '@/lib/mora-engine'

export interface WhatsAppSendResult {
  ok: boolean
  error?: string
  messageId?: string
}

/** ¿Están las credenciales de Meta configuradas? */
export function whatsAppConfigured(): boolean {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
}

/** Gate maestro: el envío automático de cobranza solo ocurre si esto es 'true'. */
export function cobranzaWhatsAppEnabled(): boolean {
  return process.env.COBRANZA_WHATSAPP_ENABLED === 'true'
}

/** Envía un mensaje de texto por WhatsApp Business. No lanza; devuelve el resultado. */
export async function sendWhatsAppText(
  to: string,
  message: string,
): Promise<WhatsAppSendResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!accessToken || !phoneNumberId) return { ok: false, error: 'whatsapp_not_configured' }
  if (!to) return { ok: false, error: 'missing_recipient' }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    )
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string }
      messages?: Array<{ id?: string }>
    }
    if (!res.ok) return { ok: false, error: json?.error?.message ?? `meta_error_${res.status}` }
    return { ok: true, messageId: json?.messages?.[0]?.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'send_failed' }
  }
}

function fmtMoney(amount: number): string {
  return `$${Number(amount).toLocaleString('es-MX', { minimumFractionDigits: 0 })} MXN`
}

function portalLine(portalUrl?: string | null): string {
  return portalUrl ? ` Revisa tu estado de cuenta y paga aquí: ${portalUrl}` : ' Revisa tu estado de cuenta en tu portal.'
}

/** Recordatorio preventivo: el pago vence en N días. */
export function buildReminderMessage(o: {
  name: string
  unit: string
  amount: number
  daysUntil: number
  portalUrl?: string | null
}): string {
  const cuando = o.daysUntil <= 0 ? 'vence HOY' : `vence en ${o.daysUntil} día${o.daysUntil === 1 ? '' : 's'}`
  return `Hola ${o.name} 👋 Te recordamos que la renta del depto ${o.unit} por ${fmtMoney(o.amount)} ${cuando}.${portalLine(o.portalUrl)} ¡Gracias! — BaW`
}

/** Comprobante: confirmación de pago recibido. */
export function buildReceiptMessage(o: {
  name: string
  unit: string
  amount: number
  method?: string | null
  reference?: string | null
  date?: string | null
}): string {
  const metodo = o.method ? ` (${o.method})` : ''
  const ref = o.reference ? ` Ref: ${o.reference}.` : ''
  const fecha = o.date ? ` el ${o.date}` : ''
  return `Hola ${o.name} ✅ Recibimos tu pago de ${fmtMoney(o.amount)} del depto ${o.unit}${metodo}${fecha}.${ref} ¡Gracias! Puedes ver tu estado de cuenta en tu portal. — BaW`
}

/** Aviso de renovación: el contrato vence pronto o ya venció (sigue vigente). */
export function buildRenewalMessage(o: {
  name: string
  unit: string
  endDate: string
  daysUntil: number
}): string {
  if (o.daysUntil < 0) {
    return `Hola ${o.name} 👋 Tu contrato del depto ${o.unit} venció el ${o.endDate}, pero sigue vigente mientras lo renovamos. Para no dejar pendientes, contáctanos y armamos tu renovación. — BaW Admin`
  }
  const cuando = o.daysUntil === 0 ? 'vence HOY' : `vence en ${o.daysUntil} día${o.daysUntil === 1 ? '' : 's'} (${o.endDate})`
  return `Hola ${o.name} 👋 Te avisamos que tu contrato del depto ${o.unit} ${cuando}. Si deseas renovar, contáctanos y lo dejamos listo a tiempo. ¡Gracias por seguir con nosotros! — BaW Admin`
}

/** Aviso de mora según el nivel de escalamiento. */
export function buildDunningMessage(o: {
  name: string
  unit: string
  amount: number
  daysPastDue: number
  level: MoraLevel
  portalUrl?: string | null
}): string {
  const base = `Hola ${o.name}, la renta del depto ${o.unit} por ${fmtMoney(o.amount)} (incluye cargo por mora) tiene ${o.daysPastDue} día${o.daysPastDue === 1 ? '' : 's'} de atraso.`
  const portal = portalLine(o.portalUrl)
  switch (o.level) {
    case 'warning':
      return `${base} Te pedimos regularizar tu pago a la brevedad.${portal} Cualquier duda, contáctanos. — BaW Admin`
    case 'critical':
      return `${base} Por favor regulariza con urgencia.${portal} — BaW Admin`
    case 'legal':
      return `⚠️ ${base} Tu cuenta entró en proceso de aviso legal. Contáctanos hoy mismo para evitar acciones adicionales.${portal} — BaW Admin`
    case 'abogado':
      return `🚨 ${base} Tu cuenta fue escalada a cobranza legal. Es indispensable que te comuniques de inmediato.${portal} — BaW Admin`
    default:
      return base
  }
}
