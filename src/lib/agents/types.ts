// BaW OS — Tipos compartidos infra agentes (S4-3)

export type AgentId =
  | 'baw'
  | 'cobranza'
  | 'renovaciones'
  | 'reservas'
  | 'mantenimiento'
  | 'huesped'
  | 'hugo-cos'
  | 'alicia-ops'
  | 'conta-beto'
  | 'maribel-law'
  | 'luis-growth'
  | 'andres-tech'

export type AgentRunStatus = 'running' | 'succeeded' | 'failed' | 'partial' | 'canceled'
export type AgentTrigger = 'manual' | 'cron' | 'webhook' | 'agent'
export type AgentActionStatus = 'ok' | 'failed' | 'skipped' | 'pending_approval'

export interface AgentActionInput {
  action_type: string
  entity_type?: string
  entity_id?: string
  status?: AgentActionStatus
  payload?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: string
}

export interface AgentRunContext {
  runId: string
  orgId: string
  agentId: AgentId
  triggeredBy: AgentTrigger
  triggeredByUser?: string
  input: Record<string, unknown>
  recordAction: (action: AgentActionInput) => Promise<void>
}

export interface AgentRunResult {
  output: Record<string, unknown>
  metrics: {
    actions_total: number
    actions_ok: number
    actions_failed: number
    actions_skipped?: number
  }
}

export interface AgentRunner {
  agentId: AgentId
  run: (ctx: AgentRunContext) => Promise<AgentRunResult>
}
