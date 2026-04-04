// BaW OS — WhatsApp Send Message API
import { NextRequest } from 'next/server'
import { validateApiKey, unauthorized, apiError, apiOk, createServiceClient, getOrgId } from '@/lib/api-auth'

interface SendBody {
  to: string
  templateName?: string
  templateParams?: string[]
  message?: string
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!accessToken || !phoneNumberId) {
    return apiError('WhatsApp no configurado', 503)
  }

  const body: SendBody = await request.json()
  if (!body.to) return apiError('to is required')
  if (!body.templateName && !body.message) {
    return apiError('templateName or message is required')
  }

  // Build Meta payload
  let metaBody: Record<string, unknown>

  if (body.templateName) {
    const components = body.templateParams?.length
      ? [
          {
            type: 'body',
            parameters: body.templateParams.map((p) => ({ type: 'text', text: p })),
          },
        ]
      : undefined

    metaBody = {
      messaging_product: 'whatsapp',
      to: body.to,
      type: 'template',
      template: {
        name: body.templateName,
        language: { code: 'es_MX' },
        ...(components ? { components } : {}),
      },
    }
  } else {
    metaBody = {
      messaging_product: 'whatsapp',
      to: body.to,
      type: 'text',
      text: { body: body.message },
    }
  }

  const res = await fetch(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(metaBody),
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
    action: 'whatsapp.message.sent',
    metadata: { to: body.to, template: body.templateName ?? null },
  })

  return apiOk(result)
}
