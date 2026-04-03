// BaW OS — WhatsApp Notifications API
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

const MESSAGE_TEMPLATES: Record<string, (name: string) => string> = {
  mora: (name) => `Hola ${name}, tu pago del mes está pendiente. Por favor realiza tu transferencia a la brevedad. BaW.`,
  recordatorio: (name) => `Hola ${name}, te recordamos que tu pago vence pronto. BaW.`,
  welcome: (name) => `Hola ${name}, bienvenido a BaW. Cualquier duda estamos a tus órdenes.`,
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  const { occupant_id, message_type, custom_message } = body
  if (!occupant_id || !message_type) {
    return apiError('occupant_id and message_type are required')
  }

  // Get occupant info
  const { data: occupant, error: occErr } = await supabase
    .from('occupants')
    .select('name, phone')
    .eq('id', occupant_id)
    .single()

  if (occErr || !occupant) return apiError('Occupant not found', 404)
  if (!occupant.phone) return apiError('Occupant has no phone number')

  const message = message_type === 'custom'
    ? custom_message || ''
    : (MESSAGE_TEMPLATES[message_type]?.(occupant.name) || custom_message || '')

  if (!message) return apiError('Message is empty')

  // Insert notification record
  const { data: notification, error: insertErr } = await supabase
    .from('whatsapp_notifications')
    .insert({
      org_id: orgId,
      occupant_id,
      message_type,
      message,
      status: 'pending',
    })
    .select()
    .single()

  if (insertErr) return apiError(insertErr.message, 500)

  // Attempt webhook delivery if configured
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL
  let status = 'pending'

  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: occupant.phone, message, message_type }),
      })
      status = res.ok ? 'sent' : 'failed'
    } catch {
      status = 'failed'
    }

    await supabase
      .from('whatsapp_notifications')
      .update({ status, sent_at: status === 'sent' ? new Date().toISOString() : null })
      .eq('id', notification.id)
  }

  return apiOk({ ...notification, status, message: status === 'sent' ? 'Mensaje enviado' : status === 'failed' ? 'Error al enviar' : 'Mensaje en cola' })
}
