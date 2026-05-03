// BaW OS v1 — GET /v1/payments
import { v1Read } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { parsePagination, makeCursor } from '@/lib/agents/v1/pagination'
import { createServiceClient } from '@/lib/supabase'

export const GET = v1Read({
  scopes: ['payments:read'],
  handler: async ({ auth, req }) => {
    const { limit, afterTs } = parsePagination(req)
    const status = req.nextUrl.searchParams.get('status')
    const contractId = req.nextUrl.searchParams.get('contract_id')
    const dueFrom = req.nextUrl.searchParams.get('due_from')
    const dueTo = req.nextUrl.searchParams.get('due_to')
    const supabase = createServiceClient()

    let q = supabase
      .from('payments')
      .select(
        'id, org_id, contract_id, amount, amount_paid, due_date, paid_date, status, method, reference, notes, created_at'
      )
      .eq('org_id', auth.orgId)
      .order('due_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)

    if (status) q = q.eq('status', status)
    if (contractId) q = q.eq('contract_id', contractId)
    if (dueFrom) q = q.gte('due_date', dueFrom)
    if (dueTo) q = q.lte('due_date', dueTo)
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
