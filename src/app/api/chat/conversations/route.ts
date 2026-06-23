// BaW OS — Chat in-app · conversaciones
// GET  /api/chat/conversations  → lista de hilos + agentes conectados (para iniciar)
// POST /api/chat/conversations  → crea un hilo con un agente conectado
//
// Cualquier miembro del tenant. Solo se puede chatear con agentes CONECTADOS
// (con credencial activa en la org).

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireMemberCaller } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

async function connectedAgents(db: ReturnType<typeof createServiceClient>, orgId: string) {
  const { data: creds } = await db
    .from('agent_credentials')
    .select('agent_id')
    .eq('org_id', orgId)
    .eq('status', 'active')
  const ids = Array.from(new Set((creds || []).map((c) => c.agent_id as string)))
  if (ids.length === 0) return []
  const { data: agents } = await db
    .from('agents')
    .select('id, display_name, full_name')
    .in('id', ids)
  return (agents || []) as { id: string; display_name: string; full_name: string }[]
}

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
  const conversations = (convs || []).map((c) => ({
    ...c,
    agent_name: nameById.get(c.agent_id as string) ?? (c.agent_id as string),
  }))

  return NextResponse.json({ success: true, data: { conversations, agents } })
}

export async function POST(req: NextRequest) {
  const auth = await requireMemberCaller()
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status })

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
