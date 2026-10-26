// BaW OS — Chat in-app · conversaciones
// GET  /api/chat/conversations  → lista de hilos + agentes conectados (para iniciar)
// POST /api/chat/conversations  → crea un hilo con un agente conectado
//
// GET: cualquier miembro (historial). POST: solo owners/admins (ver
// canCommandAgents, BAW-26). Solo se puede chatear con agentes CONECTADOS
// (con credencial activa en la org).

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireMemberCaller } from '@/lib/admin-auth'
import { getAgentDisplayName } from '@/lib/agents/attribution'
import type { AgentId } from '@/lib/agents/types'
import { COMMAND_FORBIDDEN_MESSAGE, canCommandAgents, connectedAgents } from '@/lib/agents/chat-agents'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMemberCaller()
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status })

  const db = createServiceClient()
  const [{ data: convs }, agents] = await Promise.all([
    db
      .from('agent_conversations')
      .select('id, agent_id, title, created_at, last_message_at')
      .eq('org_id', auth.orgId)
      .order('last_message_at', { ascending: false })
      .limit(100),
    connectedAgents(db, auth.orgId),
  ])

  const nameById = new Map(agents.map((a) => [a.id, a.full_name || a.display_name]))
  const roleById = new Map(agents.map((a) => [a.id, a.role_label || a.domain || null]))
  const conversations = (convs || []).map((c) => ({
    ...c,
    agent_name: nameById.get(c.agent_id as string) ?? (c.agent_id as string),
    agent_role: roleById.get(c.agent_id as string) ?? null,
    agent_short_name: getAgentDisplayName(c.agent_id as AgentId),
  }))

  return NextResponse.json({
    success: true,
    data: { conversations, agents, can_send: canCommandAgents(auth) },
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
  const agentId = body.agent_id
  if (typeof agentId !== 'string' || !agentId) {
    return NextResponse.json({ success: false, error: 'agent_id requerido' }, { status: 400 })
  }

  const db = createServiceClient()
  // Solo agentes conectados (credencial activa) son chateables.
  const agents = await connectedAgents(db, auth.orgId)
  if (!agents.some((a) => a.id === agentId)) {
    return NextResponse.json(
      { success: false, error: 'Ese agente no está conectado en esta organización' },
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
