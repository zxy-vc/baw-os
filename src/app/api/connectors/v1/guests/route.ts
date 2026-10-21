// BaW OS — Conector v1 (ENG-624) · GET /api/connectors/v1/guests
// Huéspedes de paso: SOLO nombre y fechas de las reservas firmes del periodo.
// Nada de teléfono, correo, documentos, identificaciones ni acompañantes.
import { connectorRead } from '@/lib/connectors/handler'
import { loadReservations, loadScopedUnits, paginateById, parsePeriod } from '@/lib/connectors/data'
import { FIRM_RESERVATION_STATUSES } from '@/lib/connectors/rules'

export const dynamic = 'force-dynamic'

export const GET = connectorRead('guests', async (ctx) => {
  const period = parsePeriod(ctx.params)
  const units = await loadScopedUnits(ctx)
  const rows = await loadReservations(
    ctx.db,
    ctx.key.org_id,
    units.map((u) => u.id),
    period,
    FIRM_RESERVATION_STATUSES,
  )
  const { page, next_cursor, limit } = paginateById(rows, ctx.params)
  const data = page.map((r) => ({
    reservation_id: r.id,
    unit_id: r.unit_id,
    guest_name: r.guest_name,
    check_in: r.check_in,
    check_out: r.check_out,
  }))
  return { data, rowCount: data.length, pagination: { next_cursor, limit }, meta: { period } }
})
