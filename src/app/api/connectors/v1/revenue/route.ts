// BaW OS — Conector v1 (ENG-624) · GET /api/connectors/v1/revenue
// Ingreso del periodo [from, to) de las reservas firmes: devengado por noche,
// cobrado registrado, noches vendidas y tarifa promedio (ADR), en total y por
// fuente, mes y unidad. Regla única en allocateReservation() (rules.ts); el
// detalle por reserva sale de /reservations (in_period). Contratos (rentas
// LTR/MTR) no entran en v1 — ver docs/connectors-v1.md §Pago.
import { connectorRead } from '@/lib/connectors/handler'
import { loadReservations, loadScopedUnits, parsePeriod } from '@/lib/connectors/data'
import {
  FIRM_RESERVATION_STATUSES,
  adrMxn,
  allocateReservation,
  fromCents,
  normalizeChannel,
} from '@/lib/connectors/rules'

export const dynamic = 'force-dynamic'

interface Acc {
  reservations: number
  nights: number
  revenue_cents: number
  collected_cents: number
}

const empty = (): Acc => ({ reservations: 0, nights: 0, revenue_cents: 0, collected_cents: 0 })

function present(a: Acc) {
  return {
    reservations: a.reservations,
    nights: a.nights,
    revenue_mxn: fromCents(a.revenue_cents),
    collected_mxn: fromCents(a.collected_cents),
    outstanding_mxn: fromCents(a.revenue_cents - a.collected_cents),
    adr_mxn: adrMxn(a.revenue_cents, a.nights),
  }
}

export const GET = connectorRead('revenue', async (ctx) => {
  const period = parsePeriod(ctx.params)
  const units = await loadScopedUnits(ctx)
  const rows = await loadReservations(
    ctx.db,
    ctx.key.org_id,
    units.map((u) => u.id),
    period,
    FIRM_RESERVATION_STATUSES,
  )

  const total = empty()
  const byChannel = new Map<string, Acc>()
  const byMonth = new Map<string, Acc>()
  const byUnit = new Map<string, Acc>()
  const bump = (m: Map<string, Acc>, k: string) => {
    if (!m.has(k)) m.set(k, empty())
    return m.get(k)!
  }

  for (const r of rows) {
    const alloc = allocateReservation(r, period)
    if (!alloc || alloc.nights_in_period === 0) continue
    for (const a of [total, bump(byChannel, normalizeChannel(r.channel, r.platform)), bump(byUnit, r.unit_id)]) {
      a.reservations++
      a.nights += alloc.nights_in_period
      a.revenue_cents += alloc.revenue_cents
      a.collected_cents += alloc.collected_cents
    }
    for (const [month, m] of Object.entries(alloc.by_month)) {
      const a = bump(byMonth, month)
      a.reservations++
      a.nights += m.nights
      a.revenue_cents += m.revenue_cents
      a.collected_cents += m.collected_cents
    }
  }

  const sorted = (m: Map<string, Acc>, key: string) =>
    Array.from(m.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, a]) => ({ [key]: k, ...present(a) }))

  return {
    data: {
      currency: 'MXN',
      totals: present(total),
      by_channel: sorted(byChannel, 'channel'),
      by_month: sorted(byMonth, 'month'),
      by_unit: sorted(byUnit, 'unit_id'),
    },
    rowCount: total.reservations,
    meta: { period },
  }
})
