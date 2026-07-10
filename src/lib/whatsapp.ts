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

// ─────────────────────────────────────────────────────────────────────────────
// Plantillas HSM (Meta) — los mensajes business-initiated (cobranza proactiva)
// SOLO pueden salir como plantilla pre-aprobada; el texto libre está limitado
// a la ventana de 24h después de que el cliente escribe (error 131047 fuera
// de ella). Los nombres default calzan con las plantillas registradas por
// Fran en Meta Business Manager; si Meta obliga a renombrar, se sobreescriben
// por env sin tocar código.
// ─────────────────────────────────────────────────────────────────────────────

export interface WhatsAppTemplateSpec {
  /** Nombre EXACTO de la plantilla aprobada en Meta */
  name: string
  /** Parámetros de body en orden ({{1}}, {{2}}, …) */
  params: string[]
}

/**
 * Meta rechaza parámetros con saltos de línea, tabs o 4+ espacios seguidos
 * (error 132000/132012). Normalizamos antes de enviar.
 */
function sanitizeTemplateParam(value: string): string {
  return value.replace(/[\n\t]/g, ' ').replace(/ {4,}/g, '   ').trim()
}

/** Envía una plantilla HSM aprobada. No lanza; devuelve el resultado. */
export async function sendWhatsAppTemplate(
  to: string,
  template: WhatsAppTemplateSpec,
): Promise<WhatsAppSendResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!accessToken || !phoneNumberId) return { ok: false, error: 'whatsapp_not_configured' }
  if (!to) return { ok: false, error: 'missing_recipient' }
  if (!template.name) return { ok: false, error: 'missing_template_name' }

  const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'es_MX'
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
          type: 'template',
          template: {
            name: template.name,
            language: { code: lang },
            components: [
              {
                type: 'body',
                parameters: template.params.map((text) => ({
                  type: 'text',
                  text: sanitizeTemplateParam(text),
                })),
              },
            ],
          },
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

/**
 * Plantilla `cobranza_recordatorio` — "Hola {{1}}, te recordamos que la renta
 * del depto {{2}} por un monto de {{3}} y {{4}}. Puedes pagar desde tu
 * portal. ¡Gracias! — BaW"
 */
export function buildReminderTemplate(o: {
  name: string
  unit: string
  amount: number
  daysUntil: number
}): WhatsAppTemplateSpec {
  const cuando =
    o.daysUntil <= 0 ? 'vence hoy' : `vence en ${o.daysUntil} día${o.daysUntil === 1 ? '' : 's'}`
  return {
    name: process.env.WHATSAPP_TEMPLATE_RECORDATORIO || 'cobranza_recordatorio',
    params: [o.name, o.unit, fmtMoney(o.amount), cuando],
  }
}

/**
 * Plantilla `cobranza_mora` — "Hola {{1}}, la renta del depto {{2}} por un
 * monto de {{3}} (incluye cargo por mora) tiene {{4}} de atraso. {{5}} Puedes
 * revisar y pagar en tu portal. — BaW Admin"
 */
export function buildDunningTemplate(o: {
  name: string
  unit: string
  amount: number
  daysPastDue: number
  level: MoraLevel
}): WhatsAppTemplateSpec {
  const atraso = `${o.daysPastDue} día${o.daysPastDue === 1 ? '' : 's'}`
  const instruccion: Record<MoraLevel, string> = {
    grace: 'Te pedimos regularizar tu pago a la brevedad.',
    warning: 'Te pedimos regularizar tu pago a la brevedad.',
    critical: 'Por favor regulariza con urgencia.',
    legal: 'Tu cuenta entró en proceso de aviso legal, contáctanos hoy mismo para evitar acciones adicionales.',
    abogado: 'Tu cuenta fue escalada a cobranza legal, es indispensable que te comuniques de inmediato.',
  }
  return {
    name: process.env.WHATSAPP_TEMPLATE_MORA || 'cobranza_mora',
    params: [
      o.name,
      o.unit,
      fmtMoney(o.amount),
      atraso,
      instruccion[o.level] ?? instruccion.warning,
    ],
  }
}

/**
 * Plantilla `pago_recibido` — "Hola {{1}}, recibimos tu pago de {{2}} del
 * depto {{3}} con fecha {{4}}. Detalle: {{5}}. Puedes ver tu estado de cuenta
 * en tu portal. ¡Gracias! — BaW"
 */
export function buildReceiptTemplate(o: {
  name: string
  unit: string
  amount: number
  method?: string | null
  reference?: string | null
  date?: string | null
}): WhatsAppTemplateSpec {
  const detalle =
    [o.method, o.reference ? `ref ${o.reference}` : null].filter(Boolean).join(', ') ||
    'pago registrado'
  return {
    name: process.env.WHATSAPP_TEMPLATE_PAGO_RECIBIDO || 'pago_recibido',
    params: [o.name, fmtMoney(o.amount), o.unit, o.date || 'hoy', detalle],
  }
}

/**
 * Plantilla `contrato_renovacion` — "Hola {{1}}, tu contrato del depto {{2}}
 * {{3}}, con fecha de término {{4}}. Contáctanos para dejar lista tu
 * renovación a tiempo. ¡Gracias por seguir con nosotros! — BaW Admin"
 */
export function buildRenewalTemplate(o: {
  name: string
  unit: string
  endDate: string
  daysUntil: number
}): WhatsAppTemplateSpec {
  const estado =
    o.daysUntil < 0
      ? 'venció y sigue vigente mientras lo renovamos'
      : o.daysUntil === 0
        ? 'vence hoy'
        : `vence en ${o.daysUntil} día${o.daysUntil === 1 ? '' : 's'}`
  return {
    name: process.env.WHATSAPP_TEMPLATE_RENOVACION || 'contrato_renovacion',
    params: [o.name, o.unit, estado, o.endDate],
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
