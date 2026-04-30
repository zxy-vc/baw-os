// BaW OS — GET /api/agents/runs · runs recientes del tenant activo
import { NextRequest, NextResponse } from 'next/server'
import { resolveOrgId, OrgContextError } from '@/lib/org-context'
import { createServiceClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  let orgId: string
  try {
    orgId = await resolveOrgId()
  } catch (e) {
    if (e instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 401 })
    }
    return NextResponse.json({ success: false, error: 'org_resolve_failed' }, { status: 500 })
  }

  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 100)
  const agentFilter = url.searchParams.get('agent_id')

  const supabase = createServiceClient()
  let query = supabase
    .from('agent_runs')
    .select('id, agent_id, triggered_by, status, started_at, finished_at, duration_ms, metrics, error')
    .eq('org_id', orgId)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (agentFilter) query = query.eq('agent_id', agentFilter)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, data: data || [] })
}
