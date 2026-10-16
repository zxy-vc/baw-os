// BaW OS — Chat in-app · conversaciones
// GET  /api/chat/conversations  → lista de hilos + agentes chateables + estado del operador
// POST /api/chat/conversations  → crea un hilo (default: el operador, Hugo)
//
// GET: cualquier miembro (historial). POST: solo owners/admins (ver
// canCommandAgents). Solo se puede chatear con agentes que tengan
// credencial activa en la org y que no estén retirados (Alicia). Tener
// credencial NO significa que el conector esté encendido: eso no lo sabemos
// hasta que el agente responde, así que aquí no se reporta "conectado".

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireMemberCaller } from '@/lib/admin-auth'
import { OPERATOR_AGENT_ID, OPERATOR_NO_CREDENTIAL_MESSAGE, isRetiredAgent } from '@/lib/agents/roster'
import {
  COMMAND_FORBIDDEN_MESSAGE,
  activeCredentialAgentIds,
  canCommandAgents,
  chattableAgents,
  loadAgents,
} from '@/lib/agents/chat-agents'
import { getAgentDisplayName } from '@/lib/agents/attribution'
import type { AgentId } from '@/lib/agents/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMemberCaller()
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status })

  const db = createServiceClient()
  const [{ data: convs }, credIds] = await Promise.all([
    db
      .from('agent_conversations')
      .select('id, agent_id, title, created_at, last_message_at')
      .eq('org_id', auth.orgId)
      .order('last_message_at', { ascending: false })
      .limit(100),
    activeCredentialAgentIds(db, auth.orgId),
  ])

  // Nombres de todos los agentes involucrados (incluye retirados con historial).
  const convAgentIds = (convs || []).map((c) => c.agent_id as string)
  const allAgents = await loadAgents(db, Array.from(new Set([...credIds, ...convAgentIds, OPERATOR_AGENT_ID])))
  const byId = new Map(allAgents.map((a) => [a.id, a]))
  const credSet = new Set(credIds)
  const agents = allAgents.filter((a) => credSet.has(a.id) && !isRetiredAgent(a.id, a.status))

  const conversations = (convs || []).map((c) => {
    const a = byId.get(c.agent_id as string)
    return {
      ...c,
      agent_name: a ? a.full_name || a.display_name : (c.agent_id as string),
      agent_role: a ? a.role_label || a.domain || null : null,
      agent_short_name: getAgentDisplayName(c.agent_id as AgentId),
      agent_retired: isRetiredAgent(c.agent_id as string, a?.status),
    }
  })

  const op = byId.get(OPERATOR_AGENT_ID)
  const operator = {
    id: OPERATOR_AGENT_ID,
    name: op ? op.full_name || op.display_name : getAgentDisplayName(OPERATOR_AGENT_ID),
    short_name: getAgentDisplayName(OPERATOR_AGENT_ID),
    has_credential: agents.some((a) => a.id === OPERATOR_AGENT_ID),
  }

  return NextResponse.json({
    success: true,
    data: { conversations, agents, operator, can_send: canCommandAgents(auth) },
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireMemberCaller()
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status })
  if (!canCommandAgents(auth)) {
    return NextResponse.json({ success: false, error: COMMAND_FORBIDDEN_MESSAGE }, { status: 403 })
  }

  let body: { agent_id?: unknown; title?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 })
  }
  // Sin agent_id, la conversación va al operador (Hugo).
  const agentId = body.agent_id === undefined || body.agent_id === null ? OPERATOR_AGENT_ID : body.agent_id
  if (typeof agentId !== 'string' || !agentId) {
    return NextResponse.json({ success: false, error: 'agent_id inválido' }, { status: 400 })
  }
  if (isRetiredAgent(agentId)) {
    return NextResponse.json(
      { success: false, error: 'Ese agente fue retirado. Inicia la conversación con Hugo.' },
      { status: 400 }
    )
  }

  const db = createServiceClient()
  const agents = await chattableAgents(db, auth.orgId)
  if (!agents.some((a) => a.id === agentId)) {
    return NextResponse.json(
      {
        success: false,
        error:
          agentId === OPERATOR_AGENT_ID
            ? OPERATOR_NO_CREDENTIAL_MESSAGE
            : 'Ese agente no está disponible para chat en esta organización',
      },
      { status: 400 }
    )
  }

  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : null
  const { data, error } = await db
    .from('agent_conversations')
    .insert({ org_id: auth.orgId, agent_id: agentId, created_by: auth.userId, title })
    .select('id, agent_id, title, created_at, last_message_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ success: false, error: error?.message || 'No se pudo crear' }, { status: 500 })
  }
  return NextResponse.json({ success: true, data })
}
