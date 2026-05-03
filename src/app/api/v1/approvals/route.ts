// BaW OS v1 — GET /v1/approvals
// Lista approvals de la org del caller. Filtros: status, agent_id.
import { v1Read } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { parsePagination, makeCursor } from '@/lib/agents/v1/pagination'
import { createServiceClient } from '@/lib/supabase'

export const GET = v1Read({
  scopes: ['approvals:read'],
  handler: async ({ auth, req }) => {
    const { limit, afterTs } = parsePagination(req)
    const status = req.nextUrl.searchParams.get('status') || 'pending'
    const agentId = req.nextUrl.searchParams.get('agent_id')
    const supabase = createServiceClient()

    let q = supabase
      .from('agent_approvals')
      .select(
        'id, org_id, agent_id, action_type, resource_type, resource_id, reason, status, requested_at, expires_at, resolved_at, resolved_by, resolution_note, payload'
      )
      .eq('org_id', auth.orgId)
      .order('requested_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)

    if (status && status !== 'all') q = q.eq('status', status)
    if (agentId) q = q.eq('agent_id', agentId)
    if (afterTs) q = q.lt('requested_at', afterTs)

    const { data, error } = await q
    if (error) return v1Error('query_error', error.message, 500)

    const rows = (data || []).map((r) => ({
      ...r,
      created_at: r.requested_at, // alias para pagination cursor uniform
    }))

    const hasMore = rows.length > limit
    const trimmed = hasMore ? rows.slice(0, limit) : rows
    const last = trimmed[trimmed.length - 1]
    const next_cursor =
      hasMore && last
        ? makeCursor({ id: last.id as string, created_at: last.requested_at as string })
        : null

    return v1Ok(trimmed, { next_cursor, limit })
  },
})
