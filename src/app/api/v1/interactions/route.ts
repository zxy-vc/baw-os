// BaW OS v1 — GET /v1/interactions
// Safety net de long-poll para el skill del agente: lista interacciones Discord
// pendientes de procesar (deferred/processing) del propio agente. El payload
// completo incluye application_id + token para que el skill haga el followup.
// Filtros: status (CSV, default 'deferred,processing'), limit/cursor estándar.
import { v1Read } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { parsePagination, makeCursor } from '@/lib/agents/v1/pagination'
import { createServiceClient } from '@/lib/supabase'

const VALID_STATUSES = ['received', 'processing', 'deferred', 'completed', 'failed']

export const GET = v1Read({
  scopes: ['interactions:read'],
  handler: async ({ auth, req }) => {
    const { limit, afterTs } = parsePagination(req)
    const statusParam = req.nextUrl.searchParams.get('status') || 'deferred,processing'
    const statuses = statusParam
      .split(',')
      .map((s) => s.trim())
      .filter((s) => VALID_STATUSES.includes(s))
    if (statuses.length === 0) {
      return v1Error(
        'invalid_status',
        `status must be CSV of: ${VALID_STATUSES.join(', ')}`,
        400
      )
    }

    const supabase = createServiceClient()
    let q = supabase
      .from('agent_interactions')
      .select(
        'id, agent_id, org_id, channel, channel_id, interaction_type, interaction_id, discord_guild_id, discord_user_id, payload, status, error, created_at, completed_at'
      )
      .eq('agent_id', auth.agentId) // cada agente solo ve sus propias interacciones
      .in('status', statuses)
      .order('created_at', { ascending: true }) // FIFO: procesar lo más viejo primero
      .order('id', { ascending: true })
      .limit(limit + 1)

    if (afterTs) q = q.gt('created_at', afterTs)

    const { data, error } = await q
    if (error) return v1Error('query_error', error.message, 500)

    const rows = data || []
    const hasMore = rows.length > limit
    const trimmed = hasMore ? rows.slice(0, limit) : rows
    const last = trimmed[trimmed.length - 1]
    const next_cursor =
      hasMore && last
        ? makeCursor({ id: last.id as string, created_at: last.created_at as string })
        : null

    return v1Ok(trimmed, { next_cursor, limit })
  },
})
