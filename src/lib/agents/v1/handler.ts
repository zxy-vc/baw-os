// BaW OS — High-level wrapper para endpoints v1 (read + write)
// Compone: auth → idempotency → classifier → ejecución → audit + cache.
//
// Uso típico (read):
//   export const GET = v1Read({
//     scopes: ['units:read'],
//     handler: async ({ ctx, req }) => { ... return v1Ok([...]) }
//   })
//
// Uso típico (write con possible approval):
//   export const POST = v1Write({
//     scopes: ['incidents:write'],
//     actionType: 'incident.create',
//     handler: async ({ ctx, body }) => { ... return v1Ok(row) }
//   })

import { NextRequest, NextResponse } from 'next/server'
import {
  authenticateAgentRequest,
  agentAuthErrorResponse,
  type AgentAuthResult,
} from '@/lib/agents/auth'
import { v1Error, v1Pending, v1Disabled } from './responses'
import {
  checkIdempotency,
  idempotencyConflictResponse,
  persistIdempotency,
} from './idempotency'
import {
  resolveActionClassification,
  type ResolvedClassification,
  type TriggerSource,
} from './classifier'
import { createServiceClient } from '@/lib/supabase'
import { hashApiKey } from '@/lib/agents/auth'

export interface V1HandlerCtx {
  auth: AgentAuthResult
  req: NextRequest
}

export interface V1WriteHandlerCtx<TBody = unknown> extends V1HandlerCtx {
  body: TBody
  classification: ResolvedClassification
  /**
   * Cuando classification === 'AUTO' y la acción es exitosa, llamar a
   * recordAction para auditar. Si is REQUIRE_APPROVAL, la acción se difiere
   * (no llamar handler todavía); el caller del wrapper devuelve v1Pending.
   */
  recordAction: (input: {
    actionType: string
    entityType?: string
    entityId?: string
    payload?: Record<string, unknown>
    result?: Record<string, unknown>
    status?: 'ok' | 'failed' | 'skipped'
    error?: string
  }) => Promise<void>
}

/**
 * Wrapper para endpoints read.
 */
export function v1Read(opts: {
  scopes: string[]
  handler: (ctx: V1HandlerCtx) => Promise<NextResponse>
}) {
  return async function (req: NextRequest): Promise<NextResponse> {
    const auth = await authenticateAgentRequest(req, opts.scopes)
    if (!auth.ok) return agentAuthErrorResponse(auth)

    try {
      return await opts.handler({ auth, req })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error'
      return v1Error('internal_error', msg, 500)
    }
  }
}

/**
 * Wrapper para endpoints write con classifier + idempotency + approval flow.
 */
export function v1Write<TBody = Record<string, unknown>>(opts: {
  scopes: string[]
  actionType: string
  endpoint: string // p.ej. '/v1/incidents'
  method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /**
   * Validador opcional del body. Lanza v1Error si inválido.
   */
  validate?: (body: unknown) => TBody
  /**
   * Handler que ejecuta la acción cuando ya está autorizada (AUTO o approval granted).
   */
  handler: (ctx: V1WriteHandlerCtx<TBody>) => Promise<NextResponse>
}) {
  const method = opts.method || 'POST'
  return async function (req: NextRequest): Promise<NextResponse> {
    const auth = await authenticateAgentRequest(req, opts.scopes)
    if (!auth.ok) return agentAuthErrorResponse(auth)

    // Parse body
    let rawBody = ''
    let parsed: unknown = {}
    try {
      rawBody = await req.text()
      parsed = rawBody.length > 0 ? JSON.parse(rawBody) : {}
    } catch {
      return v1Error('invalid_json', 'Body must be valid JSON', 400)
    }

    let body: TBody
    try {
      body = opts.validate ? opts.validate(parsed) : (parsed as TBody)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'invalid body'
      return v1Error('invalid_body', msg, 400)
    }

    const idCtx = {
      orgId: auth.orgId,
      agentId: auth.agentId,
      credentialId: auth.credentialId,
      endpoint: opts.endpoint,
      method,
    }

    // Idempotency check
    const idem = await checkIdempotency(req, idCtx, rawBody)
    if ('conflict' in idem) return idempotencyConflictResponse()
    if (idem.hit) {
      return NextResponse.json(idem.body, { status: idem.status })
    }

    // Origen del disparo: el skill manda `x-baw-trigger: human` cuando la acción
    // es una solicitud directa de Fran (p.ej. comando en Discord), o `auto`
    // (default) cuando la detonó un trigger externo/autónomo. Ver classifier.
    const triggerHeader = (req.headers.get('x-baw-trigger') || '').toLowerCase()
    const triggerSource: TriggerSource = triggerHeader === 'human' ? 'human' : 'auto'

    // Classifier
    const classification = await resolveActionClassification(
      auth.orgId,
      auth.agentId,
      opts.actionType,
      triggerSource
    )

    if (classification.classification === 'DISABLED') {
      return v1Disabled()
    }

    // REQUIRE_APPROVAL → encolar y devolver 202
    if (classification.classification === 'REQUIRE_APPROVAL') {
      const supabase = createServiceClient()
      const { data: approval, error: insertErr } = await supabase
        .from('agent_approvals')
        .insert({
          org_id: auth.orgId,
          agent_id: auth.agentId,
          credential_id: auth.credentialId,
          action_type: opts.actionType,
          resource_type: opts.actionType.split('.')[0],
          payload: body as object,
          reason: (req.headers.get('x-baw-reason') || '').slice(0, 500) || null,
        })
        .select('id, expires_at')
        .single()
      if (insertErr || !approval) {
        return v1Error(
          'approval_enqueue_failed',
          insertErr?.message || 'failed to enqueue approval',
          500
        )
      }
      const response = v1Pending(approval.id as string, approval.expires_at as string)

      // Idempotent cache de la respuesta pending
      if (idem.key && idem.bodyHash) {
        const respBody = await response.clone().json()
        await persistIdempotency(idCtx, idem.key, idem.bodyHash, 202, respBody)
      }
      return response
    }

    // AUTO o LOG → ejecutar y auditar
    const supabase = createServiceClient()

    // Crear un agent_run sintético para esta llamada API directa (lazy: solo
    // si la acción se va a ejecutar). Permite cumplir FK NOT NULL en
    // agent_actions.run_id y mantiene auditoría unificada con runs programados.
    let runIdCache: string | null = null
    const ensureRun = async (): Promise<string | null> => {
      if (runIdCache) return runIdCache
      const { data: run, error: runErr } = await supabase
        .from('agent_runs')
        .insert({
          org_id: auth.orgId,
          agent_id: auth.agentId,
          triggered_by: 'agent',
          status: 'running',
          input: { endpoint: opts.endpoint, action_type: opts.actionType } as object,
        })
        .select('id')
        .single()
      if (runErr || !run) return null
      runIdCache = run.id as string
      return runIdCache
    }

    const recordAction: V1WriteHandlerCtx['recordAction'] = async (a) => {
      const runId = await ensureRun()
      if (!runId) return // si no hay run no podemos auditar (FK NOT NULL)
      await supabase.from('agent_actions').insert({
        run_id: runId,
        org_id: auth.orgId,
        agent_id: auth.agentId,
        action_type: a.actionType,
        entity_type: a.entityType ?? null,
        entity_id: a.entityId ?? null,
        status: a.status ?? 'ok',
        payload: (a.payload || {}) as object,
        result: (a.result || {}) as object,
        error: a.error ?? null,
      })
    }

    let response: NextResponse
    try {
      response = await opts.handler({
        auth,
        req,
        body,
        classification,
        recordAction,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'handler error'
      // Cerrar run con failed si fue creado
      if (runIdCache) {
        await supabase
          .from('agent_runs')
          .update({ status: 'failed', finished_at: new Date().toISOString(), error: msg })
          .eq('id', runIdCache)
      }
      return v1Error('handler_error', msg, 500)
    }

    // Cerrar run como succeeded si se creó
    if (runIdCache) {
      const finalStatus = response.status >= 400 ? 'failed' : 'succeeded'
      await supabase
        .from('agent_runs')
        .update({ status: finalStatus, finished_at: new Date().toISOString() })
        .eq('id', runIdCache)
    }

    // Cache idempotente solo si éxito
    if (idem.key && idem.bodyHash && response.status < 500) {
      try {
        const respBody = await response.clone().json()
        await persistIdempotency(
          idCtx,
          idem.key,
          idem.bodyHash,
          response.status,
          respBody
        )
      } catch {
        // ignore — no esencial
      }
    }
    return response
  }
}

// Re-export para conveniencia
export { hashApiKey }
