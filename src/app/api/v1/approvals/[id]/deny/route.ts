// BaW OS v1 — POST /v1/approvals/:id/deny
import { NextRequest, NextResponse } from 'next/server'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { createServiceClient } from '@/lib/supabase'
import { authenticateAgentRequest, agentAuthErrorResponse } from '@/lib/agents/auth'

function extractId(req: NextRequest): string | null {
  const m = req.nextUrl.pathname.match(/\/v1\/approvals\/([^/]+)\/deny/)
  return m?.[1] ?? null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateAgentRequest(req, ['approvals:resolve'])
  if (!auth.ok) return agentAuthErrorResponse(auth)

  const id = extractId(req)
  if (!id) return v1Error('invalid_path', 'approval id missing', 400)

  let bodyJson: { resolution_note?: string } = {}
  try {
    const text = await req.text()
    if (text) bodyJson = JSON.parse(text)
  } catch {
    return v1Error('invalid_json', 'body must be valid JSON', 400)
  }

  const supabase = createServiceClient()
  const { data: approval, error } = await supabase
    .from('agent_approvals')
    .select('id, status, agent_id, action_type')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .maybeSingle()

  if (error) return v1Error('query_error', error.message, 500)
  if (!approval) return v1Error('not_found', `approval ${id} not found`, 404)
  if (approval.status !== 'pending') {
    return v1Error('invalid_state', `approval is '${approval.status}', cannot deny`, 409)
  }

  await supabase
    .from('agent_approvals')
    .update({
      status: 'denied',
      resolved_at: new Date().toISOString(),
      resolution_note: bodyJson.resolution_note ?? null,
    })
    .eq('id', id)

  return v1Ok({
    approval_id: id,
    status: 'denied',
    action_type: approval.action_type,
  })
}
