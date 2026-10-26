// BaW OS — Chat in-app: quién puede chatear y con qué agentes (BAW-26).
// Chateable = agente con credencial activa en la org (mismo criterio que antes).
// Tener credencial NO significa que el conector del agente esté encendido.

import type { createServiceClient } from '@/lib/supabase'
import { ORG_ADMIN_ROLES } from '@/lib/admin-auth'

/**
 * Quién puede DARLE ÓRDENES a un agente por chat. El conector relaya el chat
 * como instrucción humana (`x-baw-trigger: human`), así que lo reversible se
 * ejecuta sin aprobación con los scopes del agente (pagos, contratos,
 * inquilinos…). Si cualquier miembro pudiera escribir, un pm_viewer o un client
 * escalaría privilegios a través del agente. Por eso: solo owners/admins de la
 * org y platform admin. El resto de los miembros puede leer el historial.
 */
export function canCommandAgents(caller: { isPlatformAdmin: boolean; role: string | null }): boolean {
  return caller.isPlatformAdmin || (!!caller.role && ORG_ADMIN_ROLES.includes(caller.role))
}

export const COMMAND_FORBIDDEN_MESSAGE =
  'Solo owners y admins de la organización pueden pedirle cosas a los agentes.'

export interface AgentLite {
  id: string
  display_name: string
  full_name: string
  role_label: string | null
  domain: string | null
}

type DB = ReturnType<typeof createServiceClient>

/** Agentes con credencial activa en la org. */
export async function connectedAgents(db: DB, orgId: string): Promise<AgentLite[]> {
  const { data: creds } = await db
    .from('agent_credentials')
    .select('agent_id')
    .eq('org_id', orgId)
    .eq('status', 'active')
  const ids = Array.from(new Set((creds || []).map((c) => c.agent_id as string)))
  if (ids.length === 0) return []
  const { data: agents } = await db
    .from('agents')
    .select('id, display_name, full_name, role_label, domain')
    .in('id', ids)
  return (agents || []) as AgentLite[]
}
