// BaW OS v1 — POST /v1/agents/:id/run
// Dispara una ejecución de un agente registrado en el registry de runners.
// Ejecuta el runner en band y devuelve el run completo con metrics.
import { NextRequest } from 'next/server'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { v1Write } from '@/lib/agents/v1/handler'
import { getAgentRunner } from '@/lib/agents/registry'
import { createServiceClient } from '@/lib/supabase'
import type { AgentId } from '@/lib/agents/types'

interface RunBody {
  input?: Record<string, unknown>
  dry_run?: boolean
}

// Wrapper típico para una ruta dinámica: necesitamos el slug. Como v1Write no
// recibe params del Next.js dynamic route directamente, hacemos un binding
// manual por agente en el handler examinando la URL.
function extractSlug(req: NextRequest): string | null {
  const m = req.nextUrl.pathname.match(/\/v1\/agents\/([^/]+)\/run/)
  return m?.[1] ?? null
}

export const POST = v1Write<RunBody>({
  scopes: ['agents:run'],
  actionType: 'agent.run',
  endpoint: '/v1/agents/:id/run',
  validate: (raw) => {
    if (raw === null || raw === undefined) return {}
    if (typeof raw !== 'object') throw new Error('body must be object')
    const b = raw as Record<string, unknown>
    return {
      input: typeof b.input === 'object' && b.input !== null ? (b.input as Record<string, unknown>) : {},
      dry_run: typeof b.dry_run === 'boolean' ? b.dry_run : undefined,
    }
  },
  handler: async ({ auth, req, body, recordAction }) => {
    const slug = extractSlug(req)
    if (!slug) return v1Error('invalid_path', 'could not extract agent id from path', 400)

    // Solo permitimos correr agentes para los que el caller tenga identidad
    // o sean el mismo agente (caller dispara su propio runner).
    if (slug !== auth.agentId) {
      return v1Error(
        'forbidden_agent',
        `API key for agent '${auth.agentId}' cannot run agent '${slug}'`,
        403
      )
    }

    const runner = getAgentRunner(slug as AgentId)
    if (!runner) {
      return v1Error('runner_not_implemented', `No runner implemented for agent '${slug}'`, 501)
    }

    const supabase = createServiceClient()
    // Crear un run formal (separado del run sintético del handler)
    const { data: run, error: runErr } = await supabase
      .from('agent_runs')
      .insert({
        org_id: auth.orgId,
        agent_id: slug,
        triggered_by: 'agent',
        status: 'running',
        input: (body.input || {}) as object,
      })
      .select('id, started_at')
      .single()

    if (runErr || !run) {
      return v1Error('run_create_failed', runErr?.message || 'failed to create run', 500)
    }

    const startedMs = Date.now()
    let result: { output: Record<string, unknown>; metrics: Record<string, unknown> } = {
      output: {},
      metrics: {},
    }
    let runStatus: 'succeeded' | 'failed' | 'partial' = 'succeeded'
    let runError: string | null = null

    // recordAction interno para el runner: escribe en agent_actions con run_id real.
    const runnerRecord = async (action: import('@/lib/agents/types').AgentActionInput) => {
      await supabase.from('agent_actions').insert({
        run_id: run.id as string,
        org_id: auth.orgId,
        agent_id: slug,
        action_type: action.action_type,
        entity_type: action.entity_type ?? null,
        entity_id: action.entity_id ?? null,
        status: action.status ?? 'ok',
        payload: (action.payload || {}) as object,
        result: (action.result || {}) as object,
        error: action.error ?? null,
      })
    }

    try {
      const out = await runner.run({
        runId: run.id as string,
        orgId: auth.orgId,
        agentId: slug as AgentId,
        triggeredBy: 'agent',
        input: { ...(body.input || {}), dry_run: body.dry_run ?? true },
        recordAction: runnerRecord,
      })
      result = { output: out.output, metrics: out.metrics }
      const m = out.metrics as { actions_failed?: number; actions_ok?: number }
      if ((m.actions_failed ?? 0) > 0 && (m.actions_ok ?? 0) > 0) runStatus = 'partial'
      else if ((m.actions_failed ?? 0) > 0) runStatus = 'failed'
    } catch (e) {
      runStatus = 'failed'
      runError = e instanceof Error ? e.message : 'runner threw'
    }

    const durationMs = Date.now() - startedMs

    await supabase
      .from('agent_runs')
      .update({
        status: runStatus,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        output: (result.output || {}) as object,
        metrics: (result.metrics || {}) as object,
        error: runError,
      })
      .eq('id', run.id as string)

    await recordAction({
      actionType: 'agent.run',
      entityType: 'agent_run',
      entityId: run.id as string,
      payload: { input: body.input ?? {}, dry_run: body.dry_run ?? true },
      result: { status: runStatus, duration_ms: durationMs },
      status: runStatus === 'succeeded' ? 'ok' : 'failed',
      error: runError ?? undefined,
    })

    return v1Ok({
      run_id: run.id,
      agent_id: slug,
      status: runStatus,
      duration_ms: durationMs,
      metrics: result.metrics || {},
      output: result.output || {},
    })
  },
})
