// BaW OS — Orquestador genérico de runs de agentes (S4-3)
// Crea un agent_run, invoca el runner específico, registra acciones, finaliza.

import { createServiceClient } from '@/lib/api-auth'
import type {
  AgentActionInput,
  AgentId,
  AgentRunContext,
  AgentRunResult,
  AgentRunner,
  AgentTrigger,
} from './types'

interface RunOptions {
  orgId: string
  agentId: AgentId
  triggeredBy: AgentTrigger
  triggeredByUser?: string | null
  input?: Record<string, unknown>
}

export async function executeAgentRun(
  runner: AgentRunner,
  opts: RunOptions,
): Promise<{ runId: string; status: 'succeeded' | 'failed' | 'partial'; result: AgentRunResult; error?: string }> {
  const supabase = createServiceClient()
  const startedAt = Date.now()

  const { data: runRow, error: runErr } = await supabase
    .from('agent_runs')
    .insert({
      org_id: opts.orgId,
      agent_id: opts.agentId,
      triggered_by: opts.triggeredBy,
      triggered_by_user: opts.triggeredByUser || null,
      status: 'running',
      input: opts.input || {},
    })
    .select('id')
    .single()

  if (runErr || !runRow) {
    throw new Error(`No se pudo crear agent_run: ${runErr?.message || 'unknown'}`)
  }

  const runId = runRow.id as string
  const collectedActions: AgentActionInput[] = []

  const recordAction = async (action: AgentActionInput) => {
    collectedActions.push(action)
    await supabase.from('agent_actions').insert({
      run_id: runId,
      org_id: opts.orgId,
      agent_id: opts.agentId,
      action_type: action.action_type,
      entity_type: action.entity_type || null,
      entity_id: action.entity_id || null,
      status: action.status || 'ok',
      payload: action.payload || {},
      result: action.result || {},
      error: action.error || null,
    })
  }

  const ctx: AgentRunContext = {
    runId,
    orgId: opts.orgId,
    agentId: opts.agentId,
    triggeredBy: opts.triggeredBy,
    triggeredByUser: opts.triggeredByUser || undefined,
    input: opts.input || {},
    recordAction,
  }

  let status: 'succeeded' | 'failed' | 'partial' = 'succeeded'
  let result: AgentRunResult = { output: {}, metrics: { actions_total: 0, actions_ok: 0, actions_failed: 0 } }
  let errMessage: string | undefined

  try {
    result = await runner.run(ctx)
    if (result.metrics.actions_failed > 0 && result.metrics.actions_ok > 0) {
      status = 'partial'
    } else if (result.metrics.actions_failed > 0 && result.metrics.actions_ok === 0) {
      status = 'failed'
    }
  } catch (e) {
    status = 'failed'
    errMessage = e instanceof Error ? e.message : String(e)
  }

  const finishedAt = Date.now()
  await supabase
    .from('agent_runs')
    .update({
      status,
      finished_at: new Date(finishedAt).toISOString(),
      duration_ms: finishedAt - startedAt,
      output: result.output,
      metrics: result.metrics,
      error: errMessage || null,
    })
    .eq('id', runId)

  return { runId, status, result, error: errMessage }
}
