// BaW OS v1 — GET /v1/reservations
import { v1Read } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { parsePagination, makeCursor } from '@/lib/agents/v1/pagination'
import { createServiceClient } from '@/lib/supabase'

export const GET = v1Read({
  scopes: ['reservations:read'],
  handler: async ({ auth, req }) => {
    const { limit, afterTs } = parsePagination(req)
    const status = req.nextUrl.searchParams.get('status')
    const unitId = req.nextUrl.searchParams.get('unit_id')
    const fromDate = req.nextUrl.searchParams.get('from_date')
    const supabase = createServiceClient()

    // OJO: reservations usa organization_id (no org_id como el resto de tablas)
    // y sus columnas reales vienen de 20260329_reservations.sql. El select
    // anterior pedía columnas fantasma de docs/schema.sql (aspiracional, nunca
    // migrado) — org_id/guest_id/nights/nightly_rate/total_amount/cleaning_fee
    // no existen y todo GET devolvía 500.
    let q = supabase
      .from('reservations')
      .select(
        'id, organization_id, unit_id, guest_name, check_in, check_out, guests_count, price_per_night, total_price, status, payment_status, channel, external_id, created_at'
      )
      .eq('organization_id', auth.orgId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)

    if (status) q = q.eq('status', status)
    if (unitId) q = q.eq('unit_id', unitId)
    if (fromDate) q = q.gte('check_in', fromDate)
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
