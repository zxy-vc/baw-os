// BaW OS — Chat in-app · hilo de una conversación
// GET /api/chat/conversations/[id] → conversación + sus mensajes (interacciones)
//
// Cada "turno" es una interacción channel='app': payload.text = mensaje del
// usuario; response.text = respuesta del agente (cuando status='completed').

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireMemberCaller } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const auth = await requireMemberCaller()
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status })

  const { id } = await ctx.params
  const db = createServiceClient()

  const { data: conv } = await db
    .from('agent_conversations')
    .select('id, org_id, agent_id, title, created_at, last_message_at')
    .eq('id', id)
    .maybeSingle()
  if (!conv || (conv as { org_id: string }).org_id !== auth.orgId) {
    return NextResponse.json({ success: false, error: 'Conversación no encontrada' }, { status: 404 })
  }

  const { data: rows, error } = await db
    .from('agent_interactions')
    .select('id, payload, response, status, error, created_at, completed_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const messages = (rows || []).map((r) => {
    const payload = (r.payload as { text?: string }) || {}
    const response = (r.response as { text?: string } | null) || null
    return {
      id: r.id,
      user_text: payload.text ?? '',
      agent_text: response?.text ?? null,
      status: r.status,
      error: r.error,
      created_at: r.created_at,
      completed_at: r.completed_at,
    }
  })

  return NextResponse.json({ success: true, data: { conversation: conv, messages } })
}
