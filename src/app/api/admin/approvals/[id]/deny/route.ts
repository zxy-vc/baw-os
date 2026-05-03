// BaW OS — Admin: deny approval (humano)
// POST /api/admin/approvals/:id/deny
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdminCaller } from '@/lib/admin-auth'

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
  const { data: approval } = await supabase
    .from('agent_approvals')
    .select('id, status, action_type')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .maybeSingle()

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
          message: `approval is '${approval.status}', cannot deny`,
        },
      },
      { status: 409 }
    )
  }

  await supabase
    .from('agent_approvals')
    .update({
      status: 'denied',
      resolved_at: new Date().toISOString(),
      resolved_by: auth.userId,
      resolution_note: body.resolution_note ?? null,
    })
    .eq('id', id)

  return NextResponse.json({
    success: true,
    data: {
      approval_id: id,
      status: 'denied',
      action_type: approval.action_type,
    },
  })
}
