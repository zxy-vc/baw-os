// BaW OS v1 — POST /v1/messages
// Registra intención de mensaje (a tenant o interno). Entrega real se hará en
// fase 5 (channel routing). Aquí solo: clasificar, encolar approval si aplica,
// y dejar audit trail. Los mensajes a tenants son REQUIRE_APPROVAL por default.
import { v1Write } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'

interface MessageBody {
  channel: 'whatsapp' | 'email' | 'sms' | 'internal'
  to: string // phone, email, o agent slug si internal
  subject?: string
  body: string
  audience: 'tenant' | 'internal'
  context?: { entity_type?: string; entity_id?: string }
}

export const POST = v1Write<MessageBody>({
  scopes: ['messages:send'],
  // Discriminamos action_type según audience: el classifier elige guardrail.
  // Sin embargo, al momento de definir el wrapper, ya sabemos un default. Para
  // soportar dos tipos en el mismo endpoint usamos 'message.send_to_tenant'
  // (más restrictivo) y degradamos solo si audience='internal'. Implementamos
  // la doble vía dentro del handler: si audience=internal, pre-validamos y
  // registramos como send_internal directamente vía recordAction.
  actionType: 'message.send_to_tenant',
  endpoint: '/v1/messages',
  validate: (raw) => {
    if (typeof raw !== 'object' || raw === null) throw new Error('body must be object')
    const b = raw as Record<string, unknown>
    if (typeof b.channel !== 'string') throw new Error('channel is required')
    if (typeof b.to !== 'string' || b.to.length === 0) throw new Error('to is required')
    if (typeof b.body !== 'string' || b.body.trim().length === 0) throw new Error('body is required')
    const audience = b.audience === 'internal' ? 'internal' : 'tenant'
    return {
      channel: b.channel as MessageBody['channel'],
      to: b.to,
      subject: typeof b.subject === 'string' ? b.subject : undefined,
      body: b.body,
      audience,
      context:
        typeof b.context === 'object' && b.context !== null
          ? (b.context as MessageBody['context'])
          : undefined,
    }
  },
  handler: async ({ body, recordAction }) => {
    // Si llegamos aquí es porque ya pasó el classifier (AUTO o LOG, o approval granted).
    // Para v1 no hacemos delivery real: registramos como audit y devolvemos un id ficticio.
    const messageRecord = {
      id: crypto.randomUUID(),
      channel: body.channel,
      to: body.to,
      audience: body.audience,
      subject: body.subject ?? null,
      preview: body.body.slice(0, 120),
      delivery_status: 'queued',
      queued_at: new Date().toISOString(),
    }

    await recordAction({
      actionType: body.audience === 'internal' ? 'message.send_internal' : 'message.send_to_tenant',
      entityType: body.context?.entity_type ?? 'message',
      entityId: body.context?.entity_id ?? messageRecord.id,
      payload: body as unknown as Record<string, unknown>,
      result: { message_id: messageRecord.id },
      status: 'ok',
    })

    if (!body.to) {
      return v1Error('invalid_body', 'to is required', 400)
    }

    return v1Ok(messageRecord)
  },
})
