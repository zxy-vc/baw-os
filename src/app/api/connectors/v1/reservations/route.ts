// BaW OS — Conector v1 (ENG-624) · GET /api/connectors/v1/reservations
// Reservas con al menos una noche en [from, to): fuente normalizada, tarifa
// realizada y lo que le toca al periodo (ingreso por reserva). Sin datos de
// contacto del huésped; el nombre vive solo en /guests.
import { connectorRead } from '@/lib/connectors/handler'
import { loadReservations, loadScopedUnits, paginateById, parsePeriod } from '@/lib/connectors/data'
import {
  LISTED_RESERVATION_STATUSES,
  allocateReservation,
  fromCents,
  isFirmReservation,
  nightlyRateMxn,
  nightsBetween,
  normalizeChannel,
  toCents,
} from '@/lib/connectors/rules'

export const dynamic = 'force-dynamic'

export const GET = connectorRead('reservations', async (ctx) => {
  const period = parsePeriod(ctx.params)
  const units = await loadScopedUnits(ctx)
  const buildingOf = new Map(units.map((u) => [u.id, u.building_id]))
  const rows = await loadReservations(
    ctx.db,
    ctx.key.org_id,
    units.map((u) => u.id),
    period,
    LISTED_RESERVATION_STATUSES,
  )
  const { page, next_cursor, limit } = paginateById(rows, ctx.params)

  const data = page.map((r) => {
    const nights = nightsBetween(r.check_in, r.check_out)
    const alloc = allocateReservation(r, period)
    return {
      id: r.id,
      unit_id: r.unit_id,
      building_id: buildingOf.get(r.unit_id) ?? null,
      check_in: r.check_in,
      check_out: r.check_out,
      nights,
      status: r.status,
      counts_for_revenue: isFirmReservation(r.status),
      channel: normalizeChannel(r.channel, r.platform),
      channel_raw: r.channel ?? r.platform ?? null,
      external_ref: r.external_id,
      guests_count: r.guests_count,
      currency: 'MXN',
      total_mxn: fromCents(toCents(r.total_price)),
      nightly_rate_mxn: nightlyRateMxn(r.total_price, nights),
      paid_mxn: fromCents(toCents(r.amount_paid)),
      payment_status: r.payment_status,
      in_period: {
        nights: alloc?.nights_in_period ?? 0,
        revenue_mxn: fromCents(alloc?.revenue_cents ?? 0),
        collected_mxn: fromCents(alloc?.collected_cents ?? 0),
      },
      created_at: r.created_at,
      updated_at: r.updated_at,
    }
  })

  return { data, rowCount: data.length, pagination: { next_cursor, limit }, meta: { period } }
})
