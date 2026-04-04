// BaW OS — WhatsApp Notification API
import { NextRequest } from 'next/server'
import { validateApiKey, unauthorized, apiError, apiOk, createServiceClient, getOrgId } from '@/lib/api-auth'

type NotifyType = 'mora_day1' | 'mora_day5' | 'mora_day10' | 'checkin' | 'contract_expiring'

interface NotifyBody {
  type: NotifyType
  tenantPhone: string
  tenantName: string
  unit: string
  amount?: number
  checkInCode?: string
}

function buildMessage(body: NotifyBody): string {
  const { type, tenantName, unit, amount, checkInCode } = body
  const fmt = amount ? `$${amount.toLocaleString('es-MX')} MXN` : ''

  const templates: Record<NotifyType, string> = {
    mora_day1: `Hola ${tenantName} 👋 Tu renta del depto ${unit} por ${fmt} vence en 5 días (día 5 del mes). Paga a tiempo para evitar cargos adicionales. — BaW`,
    mora_day5: `Hola ${tenantName}, recordatorio: tu renta del depto ${unit} por ${fmt} vence HOY. Contáctanos si tienes algún problema. — BaW Admin`,
    mora_day10: `Hola ${tenantName}, tu renta del depto ${unit} por ${fmt} está vencida. Se aplica cargo por mora del 3%. Contáctanos urgente para regularizar. — BaW Admin`,
    checkin: `Bienvenido/a ${tenantName} 🏠 Tu depto ${unit} está listo. Código de acceso: ${checkInCode ?? 'N/A'}. Cualquier duda responde este mensaje. — BaW`,
    contract_expiring: `Hola ${tenantName}, tu contrato del depto ${unit} vence en 30 días. Contáctanos para renovar. — BaW Admin`,
  }

  return templates[type]
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!accessToken || !phoneNumberId) {
    return apiError('WhatsApp no configurado', 503)
  }

  const body: NotifyBody = await request.json()

  if (!body.type || !body.tenantPhone || !body.tenantName || !body.unit) {
    return apiError('type, tenantPhone, tenantName, and unit are required')
  }

  const validTypes: NotifyType[] = ['mora_day1', 'mora_day5', 'mora_day10', 'checkin', 'contract_expiring']
  if (!validTypes.includes(body.type)) {
    return apiError(`type must be one of: ${validTypes.join(', ')}`)
  }

  const message = buildMessage(body)

  // Send via Meta API
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
        to: body.tenantPhone,
        type: 'text',
        text: { body: message },
      }),
    }
  )

  const result = await res.json()

  if (!res.ok) {
    return apiError(result?.error?.message ?? 'Meta API error', res.status)
  }

  // Audit log
  const supabase = createServiceClient()
  await supabase.from('audit_log').insert({
    org_id: getOrgId(),
    actor_type: 'agent',
    actor_id: 'whatsapp-bot',
    action: 'whatsapp.notification.sent',
    metadata: {
      to: body.tenantPhone,
      type: body.type,
      tenant: body.tenantName,
      unit: body.unit,
    },
  })

  return apiOk({ sent: true, type: body.type, to: body.tenantPhone })
}
