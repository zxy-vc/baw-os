// BaW OS v1 — PATCH /v1/interactions/:id
// El skill del agente cierra una interacción que procesó vía long-poll o push:
// status 'completed' (con response) o 'failed' (con error). Telemetría del
// pipeline Discord — no pasa por classifier/approvals (no es acción de negocio).
import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgentRequest, agentAuthErrorResponse } from '@/lib/agents/auth'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { createServiceClient } from '@/lib/supabase'

function extractId(req: NextRequest): string | null {
  const m = req.nextUrl.pathname.match(/\/v1\/interactions\/([^/]+)/)
  return m?.[1] ?? null
}

interface PatchBody {
  status?: string
  response?: Record<string, unknown>
  error?: string
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateAgentRequest(req, ['interactions:write'])
  if (!auth.ok) return agentAuthErrorResponse(auth)

  const id = extractId(req)
  if (!id) return v1Error('invalid_path', 'interaction id missing', 400)

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return v1Error('invalid_json', 'body must be valid JSON', 400)
  }

  if (body.status !== 'completed' && body.status !== 'failed') {
    return v1Error('invalid_status', "status must be 'completed' or 'failed'", 400)
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('agent_interactions')
    .update({
      status: body.status,
      response: body.response ?? null,
      error: body.status === 'failed' ? (body.error ?? 'unknown error') : null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('agent_id', auth.agentId) // cada agente solo cierra sus propias interacciones
    .in('status', ['received', 'processing', 'deferred']) // no reabrir cerradas
    .select('id, agent_id, status, completed_at')
    .maybeSingle()

  if (error) return v1Error('query_error', error.message, 500)
  if (!data) {
    return v1Error(
      'not_found',
      `interaction ${id} not found, not yours, or already closed`,
      404
    )
  }

  return v1Ok(data)
}
