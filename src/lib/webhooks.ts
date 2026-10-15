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

/**
 * `orgId`: la org validada del caller. Los handlers con sesión DEBEN pasarla
 * (BAW-2: el shim getOrgId() devuelve la org cacheada del proceso, no la del
 * caller → el evento caía en otra org). Sin ella se conserva el shim legacy.
 */
export async function logEvent(
  eventType: WebhookEventType | string,
  payload: object,
  source?: string,
  orgId?: string,
) {
  const supabase = createServiceClient()
  const targetOrgId = orgId ?? getOrgId()

  const { error } = await supabase.from('webhook_events').insert({
    org_id: targetOrgId,
    event_type: eventType,
    payload,
    source: source || 'api',
    read: false,
  })

  if (error) {
    console.error('[webhook] Failed to log event:', eventType, error.message)
  }
}
