// BaW OS — Chat in-app · enviar mensaje
// POST /api/chat/conversations/[id]/messages  { text }
//
// Crea una interacción channel='app' status='deferred' que el agente recoge por
// su long-poll (GET /v1/interactions) y responde (PATCH response + completed).

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireMemberCaller } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await requireMemberCaller()
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status })

  const { id } = await ctx.params

  let body: { text?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 })
  }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ success: false, error: 'text requerido' }, { status: 400 })
  if (text.length > 4000) return NextResponse.json({ success: false, error: 'mensaje demasiado largo' }, { status: 400 })

  const db = createServiceClient()
  const { data: conv } = await db
    .from('agent_conversations')
    .select('id, org_id, agent_id')
    .eq('id', id)
    .maybeSingle()
  if (!conv || (conv as { org_id: string }).org_id !== auth.orgId) {
    return NextResponse.json({ success: false, error: 'Conversación no encontrada' }, { status: 404 })
  }

  const { data: interaction, error } = await db
    .from('agent_interactions')
    .insert({
      agent_id: (conv as { agent_id: string }).agent_id,
      org_id: auth.orgId,
      channel: 'app',
      channel_id: id,
      interaction_type: 'chat_message',
      payload: { text, conversation_id: id },
      status: 'deferred', // lo recoge el long-poll del agente
      conversation_id: id,
      created_by_user_id: auth.userId,
    })
    .select('id, payload, response, status, created_at')
    .single()

  if (error || !interaction) {
    return NextResponse.json({ success: false, error: error?.message || 'No se pudo enviar' }, { status: 500 })
  }

  await db.from('agent_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', id)

  return NextResponse.json({
    success: true,
    data: {
      id: interaction.id,
      user_text: text,
      agent_text: null,
      status: interaction.status,
      created_at: interaction.created_at,
    },
  })
}
