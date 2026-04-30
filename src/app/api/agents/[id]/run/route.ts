// BaW OS — POST /api/agents/[id]/run · invoca un agente
import { NextRequest, NextResponse } from 'next/server'
import { resolveOrgId, OrgContextError } from '@/lib/org-context'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getAgentRunner } from '@/lib/agents/registry'
import { executeAgentRun } from '@/lib/agents/runner'
import type { AgentId } from '@/lib/agents/types'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const agentId = params.id as AgentId
  const runner = getAgentRunner(agentId)

  if (!runner) {
    return NextResponse.json(
      { success: false, error: `Agente '${agentId}' no implementado o aún 'planned'` },
      { status: 404 },
    )
  }

  let orgId: string
  try {
    orgId = await resolveOrgId()
  } catch (e) {
    if (e instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 401 })
    }
    return NextResponse.json({ success: false, error: 'org_resolve_failed' }, { status: 500 })
  }

  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  try {
    const result = await executeAgentRun(runner, {
      orgId,
      agentId,
      triggeredBy: 'manual',
      triggeredByUser: user?.id || null,
      input: body,
    })

    return NextResponse.json({ success: true, data: result })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'run_failed' },
      { status: 500 },
    )
  }
}
