// BaW OS — Registry de runners disponibles (S4-3)
// Implementados: Cobranza y Renovaciones. El resto se suma cuando salga de 'planned'.

import { cobranzaRunner } from './cobranza'
import { renovacionesRunner } from './renovaciones'
import type { AgentId, AgentRunner } from './types'

const REGISTRY: Partial<Record<AgentId, AgentRunner>> = {
  cobranza: cobranzaRunner,
  renovaciones: renovacionesRunner,
}

export function getAgentRunner(agentId: AgentId): AgentRunner | null {
  return REGISTRY[agentId] || null
}

export function listImplementedAgents(): AgentId[] {
  return Object.keys(REGISTRY) as AgentId[]
}
