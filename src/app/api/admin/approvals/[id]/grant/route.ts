// BaW OS — Admin: grant approval (humanos via supabase auth)
// POST /api/admin/approvals/:id/grant
// Reusa el dispatcher de v1 para ejecutar la acción aprobada.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdminCaller } from '@/lib/admin-auth'
import { dispatchApprovedAction } from '@/lib/agents/v1/dispatcher'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminCaller()
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: { code: 'unauthorized', message: auth.message } },
      { status: auth.status }
    )
  }

  const { id } = await ctx.params
  if (!id) {
    return NextResponse.json(
      { success: false, error: { code: 'invalid_path', message: 'approval id missing' } },
      { status: 400 }
    )
  }

  let body: { resolution_note?: string } = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text)
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'invalid_json', message: 'body must be JSON' } },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const { data: approval, error } = await supabase
    .from('agent_approvals')
    .select('id, org_id, agent_id, action_type, payload, status, expires_at')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'query_error', message: error.message } },
      { status: 500 }
    )
  }
  if (!approval) {
    return NextResponse.json(
      { success: false, error: { code: 'not_found', message: 'approval not found' } },
      { status: 404 }
    )
  }
  if (approval.status !== 'pending') {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'invalid_state',
          message: `approval is '${approval.status}', cannot grant`,
        },
      },
      { status: 409 }
    )
  }
  if (new Date(approval.expires_at as string).getTime() < Date.now()) {
    await supabase
      .from('agent_approvals')
      .update({ status: 'expired', resolved_at: new Date().toISOString() })
      .eq('id', id)
    return NextResponse.json(
      { success: false, error: { code: 'expired', message: 'approval expired' } },
      { status: 410 }
    )
  }

  const dispatch = await dispatchApprovedAction({
    approvalId: id,
    orgId: auth.orgId,
    agentId: approval.agent_id as string,
    actionType: approval.action_type as string,
    payload: (approval.payload as Record<string, unknown>) || {},
    resolvedBy: auth.userId,
  })

  // Persistir resolución
  await supabase
    .from('agent_approvals')
    .update({
      status: dispatch.ok ? 'granted' : 'pending',
      resolved_at: dispatch.ok ? new Date().toISOString() : null,
      resolved_by: dispatch.ok ? auth.userId : null,
      resolution_note: body.resolution_note ?? null,
      result: dispatch.ok
        ? (dispatch.result as object)
        : ({ error: dispatch.error } as object),
    })
    .eq('id', id)

  // Audit como agent_run + agent_action
  const { data: run } = await supabase
    .from('agent_runs')
    .insert({
      org_id: auth.orgId,
      agent_id: approval.agent_id,
      triggered_by: 'manual',
      triggered_by_user: auth.userId,
      status: dispatch.ok ? 'succeeded' : 'failed',
      input: { approval_id: id, action_type: approval.action_type } as object,
      output: dispatch.ok
        ? ((dispatch.result || {}) as object)
        : ({ error: dispatch.error } as object),
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
    return NextResponse.json(
      {
        success: false,
        error: { code: 'dispatch_failed', message: dispatch.error || 'execution failed' },
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      approval_id: id,
      status: 'granted',
      action_type: approval.action_type,
      result: dispatch.result,
    },
  })
}
