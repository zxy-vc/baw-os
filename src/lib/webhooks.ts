// BaW OS — Webhook Event Dispatcher
import { createServiceClient, getOrgId } from '@/lib/api-auth'

export type WebhookEventType =
  | 'payment.received'
  | 'payment.overdue'
  | 'contract.expiring'
  | 'contract.created'
  | 'incident.opened'
  | 'incident.resolved'
  | 'unit.status_changed'

export async function logEvent(
  eventType: WebhookEventType | string,
  payload: object,
  source?: string
) {
  const supabase = createServiceClient()
  const orgId = getOrgId()

  const { error } = await supabase.from('webhook_events').insert({
    org_id: orgId,
    event_type: eventType,
    payload,
    source: source || 'api',
    read: false,
  })

  if (error) {
    console.error('[webhook] Failed to log event:', eventType, error.message)
  }
}
