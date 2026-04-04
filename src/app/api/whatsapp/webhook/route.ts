// BaW OS — WhatsApp Webhook (Meta Cloud API)
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, getOrgId } from '@/lib/api-auth'

const FAQS: Record<string, string> = {
  FAQ: 'Hola 👋 Soy el asistente de BaW. Para pagos usa la referencia de tu contrato. Para reportar una incidencia responde INCIDENCIA. Para hablar con un asesor responde ASESOR.',
  COMPLEJO: 'Gracias por tu mensaje. Un asesor de BaW te contactará pronto. Horario: Lun-Vie 9am-6pm CST.',
}

// ─── Webhook verification (Meta GET) ──────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const challenge = searchParams.get('hub.challenge')
  const token = searchParams.get('hub.verify_token')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ─── Incoming messages (Meta POST) ────────────────────────────
export async function POST(request: NextRequest) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!accessToken || !phoneNumberId) {
    console.error('[whatsapp] Missing env vars')
    return NextResponse.json({ status: 'ok' })
  }

  try {
    const payload = await request.json()
    const entry = payload?.entry?.[0]
    const change = entry?.changes?.[0]?.value
    if (!change?.messages?.[0]) {
      // Not a message event (e.g. status update)
      return NextResponse.json({ status: 'ok' })
    }

    const message = change.messages[0]
    const from: string = message.from
    const body: string = message.text?.body ?? ''
    const messageId: string = message.id

    // Classify with Groq LLM
    const classification = await classifyMessage(body)

    // Audit log
    const supabase = createServiceClient()
    const orgId = getOrgId()

    await supabase.from('audit_log').insert({
      org_id: orgId,
      actor_type: 'agent',
      actor_id: 'whatsapp-bot',
      action: 'whatsapp.message.received',
      metadata: { from, classification, message_id: messageId, body },
    })

    // Handle by classification
    if (classification === 'FAQ') {
      await sendWhatsAppMessage(from, FAQS.FAQ, accessToken, phoneNumberId)
    } else if (classification === 'INCIDENCIA') {
      await supabase.from('incidents').insert({
        org_id: orgId,
        category: 'whatsapp',
        description: body,
        unit_id: null,
        status: 'open',
        priority: 'medium',
        title: `WhatsApp incidencia de +${from}`,
      })
      await sendWhatsAppMessage(
        from,
        'Tu incidencia fue registrada. Un asesor la revisará pronto. — BaW',
        accessToken,
        phoneNumberId
      )
    } else {
      // PAGO or COMPLEJO
      await sendWhatsAppMessage(from, FAQS.COMPLEJO, accessToken, phoneNumberId)
    }
  } catch (err) {
    console.error('[whatsapp] webhook error:', err)
  }

  // Always 200 to Meta
  return NextResponse.json({ status: 'ok' })
}

// ─── Helpers ──────────────────────────────────────────────────

async function classifyMessage(text: string): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return 'COMPLEJO'

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content:
              'Clasifica este mensaje de un inquilino en: FAQ | PAGO | INCIDENCIA | COMPLEJO. Responde solo la categoría.',
          },
          { role: 'user', content: text },
        ],
        temperature: 0,
        max_tokens: 10,
      }),
    })

    const data = await res.json()
    const raw = (data.choices?.[0]?.message?.content ?? '').trim().toUpperCase()

    if (['FAQ', 'PAGO', 'INCIDENCIA', 'COMPLEJO'].includes(raw)) return raw
    return 'COMPLEJO'
  } catch (err) {
    console.error('[whatsapp] Groq classification error:', err)
    return 'COMPLEJO'
  }
}

async function sendWhatsAppMessage(
  to: string,
  text: string,
  accessToken: string,
  phoneNumberId: string
) {
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
        text: { body: text },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('[whatsapp] send failed:', err)
  }
}
