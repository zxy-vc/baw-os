// BaW OS — Conector v1 (ENG-624) · GET /api/connectors/v1/occupancy
// Ocupación por unidad y total del periodo [from, to). Regla única en
// unitOccupancy() (src/lib/connectors/rules.ts), explicada en docs/connectors-v1.md.
import { connectorRead } from '@/lib/connectors/handler'
import {
  groupByUnit,
  loadBlocks,
  loadContracts,
  loadReservations,
  loadScopedUnits,
  parsePeriod,
} from '@/lib/connectors/data'
import {
  FIRM_RESERVATION_STATUSES,
  blockInterval,
  contractInterval,
  localDateOf,
  rate,
  reservationInterval,
  unitOccupancy,
  type Interval,
} from '@/lib/connectors/rules'

export const dynamic = 'force-dynamic'

const notNull = (iv: Interval | null): iv is Interval => iv !== null

export const GET = connectorRead('occupancy', async (ctx) => {
  const period = parsePeriod(ctx.params)
  // Áreas comunes no se rentan: no entran al denominador.
  const units = (await loadScopedUnits(ctx)).filter((u) => u.type !== 'COMMON')
  const unitIds = units.map((u) => u.id)
  const [reservations, contracts, blocks] = await Promise.all([
    loadReservations(ctx.db, ctx.key.org_id, unitIds, period, FIRM_RESERVATION_STATUSES),
    loadContracts(ctx.db, ctx.key.org_id, unitIds, period),
    loadBlocks(ctx.db, ctx.key.org_id, unitIds, period),
  ])
  const resByUnit = groupByUnit(reservations)
  const conByUnit = groupByUnit(contracts)
  const blkByUnit = groupByUnit(blocks)

  const totals = {
    units: units.length,
    nights_in_period: 0,
    blocked_nights: 0,
    available_nights: 0,
    occupied_nights: 0,
    occupied_nights_by_instrument: { reservation: 0, contract: 0 },
    occupancy_rate: null as number | null,
  }

  const byUnit = units.map((u) => {
    const occ = unitOccupancy({
      period,
      reservations: (resByUnit.get(u.id) ?? []).map(reservationInterval).filter(notNull),
      contracts: (conByUnit.get(u.id) ?? []).map(contractInterval).filter(notNull),
      blocks: (blkByUnit.get(u.id) ?? []).map(blockInterval).filter(notNull),
      // Deja de contar desde el día LOCAL de archivo (no la fecha UTC).
      activeUntil: u.archived_at ? localDateOf(u.archived_at) : null,
    })
    totals.nights_in_period += occ.nights_in_period
    totals.blocked_nights += occ.blocked_nights
    totals.available_nights += occ.available_nights
    totals.occupied_nights += occ.occupied_nights
    totals.occupied_nights_by_instrument.reservation += occ.occupied_nights_by_instrument.reservation
    totals.occupied_nights_by_instrument.contract += occ.occupied_nights_by_instrument.contract
    return { unit_id: u.id, building_id: u.building_id, unit_number: u.number, unit_type: u.type, ...occ }
  })
  totals.occupancy_rate = rate(totals.occupied_nights, totals.available_nights)

  return { data: { totals, by_unit: byUnit }, rowCount: byUnit.length, meta: { period } }
})
