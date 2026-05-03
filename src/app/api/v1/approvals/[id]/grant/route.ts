// BaW OS v1 — POST /v1/approvals/:id/grant
// Otorga aprobación humana a una acción pendiente y la ejecuta vía dispatcher.
// Importante: este endpoint es para HUMANOS (autenticación supabase user, no
// API key de agente). Lo exponemos también bajo /v1 para que herramientas de
// admin lo invoquen con permisos elevados. Si se llama con API key de agente,
// requerimos scope 'approvals:resolve' que solo se otorga a credenciales de
// admin/supervisor.
import { NextRequest, NextResponse } from 'next/server'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { createServiceClient } from '@/lib/supabase'
import { authenticateAgentRequest, agentAuthErrorResponse } from '@/lib/agents/auth'
import { dispatchApprovedAction } from '@/lib/agents/v1/dispatcher'

function extractId(req: NextRequest): string | null {
  const m = req.nextUrl.pathname.match(/\/v1\/approvals\/([^/]+)\/grant/)
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
    .select('id, org_id, agent_id, action_type, payload, status, expires_at')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .maybeSingle()

  if (error) return v1Error('query_error', error.message, 500)
  if (!approval) return v1Error('not_found', `approval ${id} not found`, 404)

  if (approval.status !== 'pending') {
    return v1Error(
      'invalid_state',
      `approval is '${approval.status}', cannot grant`,
      409
    )
  }
  if (new Date(approval.expires_at as string).getTime() < Date.now()) {
    await supabase
      .from('agent_approvals')
      .update({ status: 'expired', resolved_at: new Date().toISOString() })
      .eq('id', id)
    return v1Error('expired', 'approval expired before grant', 410)
  }

  // Ejecutar la acción aprobada
  const dispatch = await dispatchApprovedAction({
    approvalId: id,
    orgId: auth.orgId,
    agentId: approval.agent_id as string,
    actionType: approval.action_type as string,
    payload: (approval.payload as Record<string, unknown>) || {},
    resolvedBy: null,
  })

  // Persistir resolución (siempre, incluso si dispatch falla — para audit)
  await supabase
    .from('agent_approvals')
    .update({
      status: dispatch.ok ? 'granted' : 'pending', // si fallo de dispatch, mantenemos pending para retry manual
      resolved_at: dispatch.ok ? new Date().toISOString() : null,
      resolution_note: bodyJson.resolution_note ?? null,
      result: dispatch.ok
        ? (dispatch.result as object)
        : ({ error: dispatch.error } as object),
    })
    .eq('id', id)

  // Audit como agent_action: necesitamos un run wrapper
  const { data: run } = await supabase
    .from('agent_runs')
    .insert({
      org_id: auth.orgId,
      agent_id: approval.agent_id,
      triggered_by: 'agent',
      status: dispatch.ok ? 'succeeded' : 'failed',
      input: { approval_id: id, action_type: approval.action_type } as object,
      output: dispatch.ok ? (dispatch.result || {}) as object : ({ error: dispatch.error } as object),
      finished_at: new Date().toISOString(),
      error: dispatch.ok ? null : dispatch.error,
    })
    .select('id')
    .single()

  if (run) {
    await supabase.from('agent_actions').insert({
      run_id: run.id as string,
      org_id: auth.orgId,
      agent_id: approval.agent_id,
      action_type: approval.action_type,
      entity_type: dispatch.entityType ?? null,
      entity_id: dispatch.entityId ?? null,
      status: dispatch.ok ? 'ok' : 'failed',
      payload: (approval.payload || {}) as object,
      result: (dispatch.result || {}) as object,
      error: dispatch.error ?? null,
    })
  }

  if (!dispatch.ok) {
    return v1Error('dispatch_failed', dispatch.error || 'execution failed', 500)
  }

  return v1Ok({
    approval_id: id,
    status: 'granted',
    action_type: approval.action_type,
    result: dispatch.result,
  })
}
