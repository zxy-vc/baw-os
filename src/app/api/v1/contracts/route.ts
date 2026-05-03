// BaW OS v1 — GET /v1/contracts
import { v1Read } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { parsePagination, makeCursor } from '@/lib/agents/v1/pagination'
import { createServiceClient } from '@/lib/supabase'

export const GET = v1Read({
  scopes: ['contracts:read'],
  handler: async ({ auth, req }) => {
    const { limit, afterTs } = parsePagination(req)
    const status = req.nextUrl.searchParams.get('status')
    const unitId = req.nextUrl.searchParams.get('unit_id')
    const occupantId = req.nextUrl.searchParams.get('occupant_id')
    const supabase = createServiceClient()

    let q = supabase
      .from('contracts')
      .select(
        'id, org_id, unit_id, occupant_id, start_date, end_date, monthly_amount, deposit_amount, deposit_paid, payment_day, status, contract_url, created_at, updated_at'
      )
      .eq('org_id', auth.orgId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)

    if (status) q = q.eq('status', status)
    if (unitId) q = q.eq('unit_id', unitId)
    if (occupantId) q = q.eq('occupant_id', occupantId)
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
