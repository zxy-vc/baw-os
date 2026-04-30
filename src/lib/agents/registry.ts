// BaW OS — Registry de runners disponibles (S4-3)
// Solo Cobranza v1 implementado. El resto se suma cuando salgan de 'planned'.

import { cobranzaRunner } from './cobranza'
import type { AgentId, AgentRunner } from './types'

const REGISTRY: Partial<Record<AgentId, AgentRunner>> = {
  cobranza: cobranzaRunner,
}

export function getAgentRunner(agentId: AgentId): AgentRunner | null {
  return REGISTRY[agentId] || null
}

export function listImplementedAgents(): AgentId[] {
  return Object.keys(REGISTRY) as AgentId[]
}
