// BaW OS v1 — GET /v1/runs
import { v1Read } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { parsePagination, makeCursor } from '@/lib/agents/v1/pagination'
import { createServiceClient } from '@/lib/supabase'

export const GET = v1Read({
  scopes: ['runs:read'],
  handler: async ({ auth, req }) => {
    const { limit, afterTs } = parsePagination(req)
    const agentId = req.nextUrl.searchParams.get('agent_id')
    const status = req.nextUrl.searchParams.get('status')
    const supabase = createServiceClient()

    let q = supabase
      .from('agent_runs')
      .select('id, org_id, agent_id, status, input, output, started_at, completed_at, created_at')
      .eq('org_id', auth.orgId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)

    if (agentId) q = q.eq('agent_id', agentId)
    if (status) q = q.eq('status', status)
    if (afterTs) q = q.lt('created_at', afterTs)

    const { data, error } = await q
    if (error) return v1Error('query_error', error.message, 500)

    const rows = data || []
    const hasMore = rows.length > limit
    const trimmed = hasMore ? rows.slice(0, limit) : rows
    const last = trimmed[trimmed.length - 1]
    const next_cursor = hasMore && last ? makeCursor(last) : null

    return v1Ok(trimmed, { next_cursor, limit })
  },
})
