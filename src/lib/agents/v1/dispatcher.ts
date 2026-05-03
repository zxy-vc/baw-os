// BaW OS — Dispatcher de acciones aprobadas
// Cuando un humano hace POST /v1/approvals/:id/grant, no podemos re-llamar el
// handler HTTP original (no hay request, ni idempotency). En su lugar, el
// dispatcher conoce cómo ejecutar cada action_type a partir de su payload
// almacenado en agent_approvals.payload.
//
// Mantener este dispatcher en sync con los handlers de cada endpoint write.

import { createServiceClient } from '@/lib/supabase'

export interface DispatchContext {
  approvalId: string
  orgId: string
  agentId: string
  actionType: string
  payload: Record<string, unknown>
  resolvedBy: string | null
}

export interface DispatchResult {
  ok: boolean
  result?: Record<string, unknown>
  error?: string
  entityType?: string
  entityId?: string
}

export async function dispatchApprovedAction(ctx: DispatchContext): Promise<DispatchResult> {
  const supabase = createServiceClient()

  switch (ctx.actionType) {
    case 'incident.create': {
      const p = ctx.payload as {
        unit_id?: string
        title: string
        description?: string
        priority?: string
        estimated_cost?: number
        reported_by?: string
      }
      const { data, error } = await supabase
        .from('incidents')
        .insert({
          org_id: ctx.orgId,
          unit_id: p.unit_id ?? null,
          title: p.title,
          description: p.description ?? null,
          priority: p.priority ?? 'normal',
          estimated_cost: p.estimated_cost ?? null,
          reported_by: p.reported_by ?? `agent:${ctx.agentId}`,
          status: 'open',
        })
        .select('id')
        .single()
      if (error || !data) return { ok: false, error: error?.message || 'insert failed' }
      return { ok: true, result: { id: data.id }, entityType: 'incident', entityId: data.id as string }
    }

    case 'task.create': {
      const p = ctx.payload as {
        title: string
        description?: string
        assigned_to?: string
        entity_type?: string
        entity_id?: string
        due_date?: string
        priority?: string
      }
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          org_id: ctx.orgId,
          title: p.title,
          description: p.description ?? null,
          assigned_to: p.assigned_to ?? null,
          created_by: `agent:${ctx.agentId}`,
          entity_type: p.entity_type ?? null,
          entity_id: p.entity_id ?? null,
          due_date: p.due_date ?? null,
          priority: p.priority ?? 'normal',
          status: 'pending',
        })
        .select('id')
        .single()
      if (error || !data) return { ok: false, error: error?.message || 'insert failed' }
      return { ok: true, result: { id: data.id }, entityType: 'task', entityId: data.id as string }
    }

    case 'message.send_to_tenant':
    case 'message.send_internal': {
      const p = ctx.payload as { channel: string; to: string; subject?: string; body: string }
      // Stub: registrar como queued. v2 hace delivery real.
      const messageId = crypto.randomUUID()
      return {
        ok: true,
        result: {
          message_id: messageId,
          channel: p.channel,
          to: p.to,
          delivery_status: 'queued',
          queued_at: new Date().toISOString(),
        },
        entityType: 'message',
        entityId: messageId,
      }
    }

    // Acciones que requieren aprobación pero deben ejecutarse mediante un runner
    // o un servicio externo: por ahora dejamos stubs explícitos.
    case 'payment.charge':
    case 'payment.refund':
    case 'cfdi.emit':
    case 'contract.sign':
    case 'contract.terminate': {
      return {
        ok: false,
        error: `Action '${ctx.actionType}' approval granted but executor not yet implemented (Fase 5)`,
      }
    }

    default:
      return {
        ok: false,
        error: `No dispatcher registered for action_type='${ctx.actionType}'`,
      }
  }
}
