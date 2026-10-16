// BaW OS — Chat in-app: qué agentes son chateables en una org (BAW-26).
// Chateable = credencial activa en la org + no retirado. Tener credencial NO
// significa que el conector del agente esté encendido.

import type { createServiceClient } from '@/lib/supabase'
import { ORG_ADMIN_ROLES } from '@/lib/admin-auth'
import { isRetiredAgent } from '@/lib/agents/roster'

/**
 * Quién puede DARLE ÓRDENES a un agente por chat. El conector relaya el chat
 * con `x-baw-trigger: human`, así que lo reversible se ejecuta sin aprobación
 * con los scopes del agente (pagos, contratos, inquilinos…). Si cualquier
 * miembro pudiera escribir, un pm_viewer o un client escalaría privilegios a
 * través del agente. Por eso: solo owners/admins de la org y platform admin.
 * El resto de los miembros puede leer el historial.
 */
export function canCommandAgents(caller: { isPlatformAdmin: boolean; role: string | null }): boolean {
  return caller.isPlatformAdmin || (!!caller.role && ORG_ADMIN_ROLES.includes(caller.role))
}

export const COMMAND_FORBIDDEN_MESSAGE =
  'Solo owners y admins de la organización pueden pedirle cosas a Hugo.'

export interface AgentLite {
  id: string
  display_name: string
  full_name: string
  role_label: string | null
  domain: string | null
  status: string | null
}

export type DB = ReturnType<typeof createServiceClient>

export async function activeCredentialAgentIds(db: DB, orgId: string): Promise<string[]> {
  const { data: creds } = await db
    .from('agent_credentials')
    .select('agent_id')
    .eq('org_id', orgId)
    .eq('status', 'active')
  return Array.from(new Set((creds || []).map((c) => c.agent_id as string)))
}

export async function loadAgents(db: DB, ids: string[]): Promise<AgentLite[]> {
  if (ids.length === 0) return []
  const { data } = await db
    .from('agents')
    .select('id, display_name, full_name, role_label, domain, status')
    .in('id', ids)
  return (data || []) as AgentLite[]
}

/** Agentes con los que se puede iniciar/continuar un chat en esta org. */
export async function chattableAgents(db: DB, orgId: string): Promise<AgentLite[]> {
  const agents = await loadAgents(db, await activeCredentialAgentIds(db, orgId))
  return agents.filter((a) => !isRetiredAgent(a.id, a.status))
}
