// ENG-624 · Conector v1: las tres cifras (ocupación, tarifa, pago) contra el
// fixture de tests/connectors/fixture.ts. Los valores esperados están
// calculados a mano en los comentarios; docs/connectors-v1.md §Ejemplo los
// repite para que Engrane pueda verificar su estampa.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeFakeDb, type Row } from './fake-db'
import { buildFixture, KEYS, B1, U1, U2, U3, U5, R } from './fixture'
import {
  allocateCents,
  allocateReservation,
  localDateOf,
  nightlyRateMxn,
  normalizeChannel,
  toCents,
  unitOccupancy,
} from '@/lib/connectors/rules'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: () => h.db }))

import * as reservationsRoute from '@/app/api/connectors/v1/reservations/route'
import * as occupancyRoute from '@/app/api/connectors/v1/occupancy/route'
import * as revenueRoute from '@/app/api/connectors/v1/revenue/route'
import * as unitsRoute from '@/app/api/connectors/v1/units/route'

const ROUTES = {
  reservations: reservationsRoute,
  occupancy: occupancyRoute,
  revenue: revenueRoute,
  units: unitsRoute,
}

async function read(dataset: keyof typeof ROUTES, query: Record<string, string>, key = KEYS.fullA) {
  const url = new URL(`http://localhost/api/connectors/v1/${dataset}`)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  const res = await ROUTES[dataset].GET(new NextRequest(url, { headers: { authorization: `Bearer ${key}` } }))
  const body = await res.json()
  expect(res.status, JSON.stringify(body)).toBe(200)
  return body
}

const OCT = { from: '2026-10-01', to: '2026-11-01' }

beforeEach(async () => {
  h.db = makeFakeDb(await buildFixture())
})

describe('reglas puras', () => {
  it('toCents redondea half-up sin pasar por float', () => {
    expect(toCents('3999.99')).toBe(399999)
    expect(toCents('1000.005')).toBe(100001)
    expect(toCents('1000.004')).toBe(100000)
    expect(toCents(1234.565)).toBe(123457)
    expect(toCents(5000)).toBe(500000)
    expect(toCents(null)).toBe(0)
    expect(toCents('abc')).toBe(0)
  })

  it('toCents: un solo redondeo, igual para número y string (hallazgo de revisión #1)', () => {
    // Antes: toFixed(6) redondeaba 1.0049999 → 1.005000 → 101 centavos.
    for (const [num, str, cents] of [
      [1.0049999, '1.0049999', 100],
      [1.005, '1.005', 101],
      [0.145, '0.145', 15],
      [1234.565, '1234.565', 123457],
      [-1.005, '-1.005', -101],
      [-1.0049999, '-1.0049999', -100],
      [3999.99, '3999.99', 399999],
    ] as const) {
      expect(toCents(num), String(num)).toBe(cents)
      expect(toCents(str), str).toBe(cents)
    }
    expect(toCents(1e-7)).toBe(0)
    expect(toCents(5e-3)).toBe(1)
    expect(toCents(1e21)).toBe(1e23)
    expect(toCents(Number.NaN)).toBe(0)
    expect(toCents(Infinity)).toBe(0)
    expect(toCents('.5')).toBe(50)
    expect(toCents('-')).toBe(0)
  })

  it('allocateCents reparte sin perder ni inventar centavos', () => {
    expect(allocateCents(399999, 4)).toEqual([100000, 100000, 100000, 99999])
    expect(allocateCents(100, 3)).toEqual([34, 33, 33])
    for (const [total, n] of [[1, 7], [999_999, 13], [0, 5], [123_456_789, 31]]) {
      expect(allocateCents(total, n).reduce((a, b) => a + b, 0)).toBe(total)
    }
  })

  it('fuente normalizada: Airbnb · Booking · Lodgify · directa · otra · desconocida', () => {
    expect(normalizeChannel('airbnb', null)).toBe('airbnb')
    expect(normalizeChannel('Airbnb.com', null)).toBe('airbnb')
    expect(normalizeChannel('booking', null)).toBe('booking')
    expect(normalizeChannel('BookingCom', null)).toBe('booking')
    expect(normalizeChannel('Lodgify', null)).toBe('lodgify')
    expect(normalizeChannel('direct', null)).toBe('direct')
    expect(normalizeChannel(null, 'direct')).toBe('direct')
    expect(normalizeChannel(null, 'airbnb')).toBe('airbnb')
    expect(normalizeChannel('booking', 'airbnb')).toBe('booking') // channel gana
    expect(normalizeChannel('expedia', null)).toBe('other')
    expect(normalizeChannel(null, null)).toBe('unknown')
    expect(normalizeChannel('', '  ')).toBe('unknown')
  })

  it('una reserva que cruza meses se parte por noche y las partes suman el total', () => {
    const r = { check_in: '2026-09-28', check_out: '2026-10-03', status: 'confirmed', total_price: '1000.01', amount_paid: 0 }
    const sep = allocateReservation(r, { from: '2026-09-01', to: '2026-10-01' })!
    const oct = allocateReservation(r, { from: '2026-10-01', to: '2026-11-01' })!
    expect(sep.nights_in_period + oct.nights_in_period).toBe(5)
    expect(sep.revenue_cents + oct.revenue_cents).toBe(100001)
  })

  it('cotizaciones y cancelaciones no generan ingreso ni ocupación', () => {
    for (const status of ['tentative', 'cancelled']) {
      expect(
        allocateReservation({ check_in: '2026-10-01', check_out: '2026-10-03', status, total_price: 100, amount_paid: 100 }, OCT),
      ).toBeNull()
    }
  })

  it('ocupación: una noche con reserva y contrato cuenta una vez; bloqueo bajo estancia no resta', () => {
    const occ = unitOccupancy({
      period: { from: '2026-10-01', to: '2026-10-11' },
      reservations: [{ start: '2026-10-01', endExclusive: '2026-10-04' }],
      contracts: [{ start: '2026-10-03', endExclusive: '2026-10-06' }],
      blocks: [{ start: '2026-10-05', endExclusive: '2026-10-09' }],
    })
    // 1,2,3 reserva · 4,5 contrato · 6,7,8 bloqueo · 9,10 libres
    expect(occ).toEqual({
      nights_in_period: 10,
      blocked_nights: 3,
      available_nights: 7,
      occupied_nights: 5,
      occupied_nights_by_instrument: { reservation: 3, contract: 2 },
      occupancy_rate: 0.7143,
    })
  })
})

describe('base temporal (hallazgo de revisión #2)', () => {
  it('un timestamp se lee en hora de CDMX, no en UTC', () => {
    expect(localDateOf('2026-10-21T02:00:00Z')).toBe('2026-10-20') // 20:00 del 20 en CDMX
    expect(localDateOf('2026-10-21T06:00:00Z')).toBe('2026-10-21') // 00:00 del 21 en CDMX
    expect(localDateOf('2026-10-21T05:59:59Z')).toBe('2026-10-20')
  })
})

describe('OCUPACIÓN contra el fixture (octubre 2026)', () => {
  it('por unidad', async () => {
    const body = await read('occupancy', OCT)
    const byUnit = Object.fromEntries(body.data.by_unit.map((u: Row) => [u.unit_id, u]))
    // U1: 2 (R1) + 4 (R2) + 2 (R5) ocupadas; 2 bloqueadas; 31 − 2 = 29 disponibles
    expect(byUnit[U1]).toMatchObject({
      nights_in_period: 31,
      blocked_nights: 2,
      available_nights: 29,
      occupied_nights: 8,
      occupied_nights_by_instrument: { reservation: 8, contract: 0 },
      occupancy_rate: 0.2759,
    })
    // U2: contrato 1-15 oct (end_date inclusivo); el bloqueo 10-12 cae sobre el contrato
    expect(byUnit[U2]).toMatchObject({
      nights_in_period: 31,
      blocked_nights: 0,
      available_nights: 31,
      occupied_nights: 15,
      occupied_nights_by_instrument: { reservation: 0, contract: 15 },
      occupancy_rate: 0.4839,
    })
    // U3: R6 (3) + R7 (1, sin organization_id: la dueña es la unidad)
    expect(byUnit[U3]).toMatchObject({ nights_in_period: 31, occupied_nights: 4, occupancy_rate: 0.129 })
    // U5: archivada el 21-oct → solo cuenta del 1 al 20
    expect(byUnit[U5]).toMatchObject({ nights_in_period: 20, available_nights: 20, occupied_nights: 0, occupancy_rate: 0 })
    // U4 (área común) no entra
    expect(Object.keys(byUnit).sort()).toEqual([U1, U2, U3, U5].sort())
  })

  it('un contrato terminated que se solapa con el periodo no ocupa', async () => {
    const { data } = await read('occupancy', OCT)
    const u3 = data.by_unit.find((u: Row) => u.unit_id === U3)
    // c-terminated-oct cubre 1-20 oct en U3; si contara, U3 tendría ≥20 ocupadas
    expect(u3.occupied_nights_by_instrument).toEqual({ reservation: 4, contract: 0 })
    expect(u3.occupied_nights).toBe(4)
  })

  it('unidad archivada: corta en el día LOCAL de archivo (UTC 21-oct 02:00 = 20-oct CDMX)', async () => {
    const tables = await buildFixture()
    tables.units.find((u) => u.id === U5)!.archived_at = '2026-10-21T02:00:00Z'
    h.db = makeFakeDb(tables)
    const { data } = await read('occupancy', OCT)
    const u5 = data.by_unit.find((u: Row) => u.unit_id === U5)
    expect(u5.nights_in_period).toBe(19) // 1-19 oct; con la fecha UTC habrían sido 20
  })

  it('total = Σ ocupadas ÷ Σ disponibles (no promedio de porcentajes)', async () => {
    const { data } = await read('occupancy', OCT)
    expect(data.totals).toEqual({
      units: 4,
      nights_in_period: 113, // 31 + 31 + 31 + 20
      blocked_nights: 2,
      available_nights: 111,
      occupied_nights: 27, // 8 + 15 + 4 + 0
      occupied_nights_by_instrument: { reservation: 12, contract: 15 },
      occupancy_rate: 0.2432, // 27 / 111
    })
  })

  it('filtro por edificio', async () => {
    const { data } = await read('occupancy', { ...OCT, building_id: B1 })
    expect(data.totals).toMatchObject({ units: 3, occupied_nights: 23, available_nights: 80 })
  })
})

describe('TARIFA contra el fixture', () => {
  it('es la realizada: total pactado ÷ noches (no base × temporada)', async () => {
    const { data } = await read('reservations', OCT)
    const byId = Object.fromEntries(data.map((r: Row) => [r.id, r]))
    expect(byId[R.R1]).toMatchObject({ nights: 5, total_mxn: 5000, nightly_rate_mxn: 1000 })
    expect(byId[R.R2]).toMatchObject({ nights: 4, total_mxn: 3999.99, nightly_rate_mxn: 1000 }) // 999.9975 → 1000.00
    expect(byId[R.R6]).toMatchObject({ nights: 3, total_mxn: 2400, nightly_rate_mxn: 800 })
    // U1 tiene base_rate_mxn = 1200 en la fixture: la tarifa del conector NO la usa
    expect(byId[R.R1].nightly_rate_mxn).not.toBe(1200)
    expect(nightlyRateMxn('3000', 3)).toBe(1000)
    expect(nightlyRateMxn('3000', 0)).toBeNull()
  })

  it('las unidades no publican tarifa de lista', async () => {
    const { data } = await read('units', {})
    for (const u of data) expect(u).not.toHaveProperty('base_rate_mxn')
  })

  it('ADR del periodo = devengado ÷ noches vendidas', async () => {
    const { data } = await read('revenue', OCT)
    expect(data.totals.adr_mxn).toBe(950) // 11,400.00 / 12
  })
})

describe('PAGO / INGRESO contra el fixture', () => {
  it('por reserva: lo que le toca al periodo', async () => {
    const { data } = await read('reservations', OCT)
    const byId = Object.fromEntries(data.map((r: Row) => [r.id, r]))
    expect(Object.keys(byId).sort()).toEqual([R.R1, R.R2, R.R4, R.R5, R.R6, R.R7].sort()) // R3 cotización fuera
    expect(byId[R.R1]).toMatchObject({ channel: 'airbnb', external_ref: 'HMABC123', paid_mxn: 5000, in_period: { nights: 2, revenue_mxn: 2000, collected_mxn: 2000 } })
    expect(byId[R.R2]).toMatchObject({ channel: 'booking', paid_mxn: 0, in_period: { nights: 4, revenue_mxn: 3999.99, collected_mxn: 0 } })
    expect(byId[R.R4]).toMatchObject({ status: 'cancelled', counts_for_revenue: false, channel: 'airbnb', in_period: { nights: 0, revenue_mxn: 0, collected_mxn: 0 } })
    expect(byId[R.R5]).toMatchObject({ channel: 'direct', in_period: { nights: 2, revenue_mxn: 2000, collected_mxn: 1000 } })
    expect(byId[R.R6]).toMatchObject({ channel: 'lodgify', channel_raw: 'Lodgify', in_period: { nights: 3, revenue_mxn: 2400, collected_mxn: 2400 } })
    expect(byId[R.R7]).toMatchObject({ channel: 'unknown', total_mxn: 1000.01, in_period: { nights: 1, revenue_mxn: 1000.01 } })
  })

  it('por periodo: totales y por fuente', async () => {
    const { data } = await read('revenue', OCT)
    expect(data.totals).toEqual({
      reservations: 5,
      nights: 12,
      revenue_mxn: 11400, // 2,000 + 3,999.99 + 2,000 + 2,400 + 1,000.01
      collected_mxn: 5400, // 2,000 + 0 + 1,000 + 2,400 + 0
      outstanding_mxn: 6000,
      adr_mxn: 950,
    })
    const ch = Object.fromEntries(data.by_channel.map((c: Row) => [c.channel, c]))
    expect(Object.keys(ch).sort()).toEqual(['airbnb', 'booking', 'direct', 'lodgify', 'unknown'])
    expect(ch.airbnb).toMatchObject({ reservations: 1, nights: 2, revenue_mxn: 2000, collected_mxn: 2000 })
    expect(ch.booking).toMatchObject({ reservations: 1, nights: 4, revenue_mxn: 3999.99, collected_mxn: 0, outstanding_mxn: 3999.99 })
    expect(ch.lodgify).toMatchObject({ nights: 3, revenue_mxn: 2400, adr_mxn: 800 })
    expect(data.by_month).toEqual([
      { month: '2026-10', reservations: 5, nights: 12, revenue_mxn: 11400, collected_mxn: 5400, outstanding_mxn: 6000, adr_mxn: 950 },
    ])
  })

  it('periodo que cruza meses: by_month parte las reservas y suma el total', async () => {
    const { data } = await read('revenue', { from: '2026-09-15', to: '2026-11-15' })
    const m = Object.fromEntries(data.by_month.map((x: Row) => [x.month, x]))
    expect(m['2026-09']).toMatchObject({ nights: 3, revenue_mxn: 3000 }) // R1 28,29,30 sep
    expect(m['2026-10']).toMatchObject({ nights: 12, revenue_mxn: 11400 })
    expect(m['2026-11']).toMatchObject({ nights: 1, revenue_mxn: 1000 }) // R5 1 nov
    // Σ meses = total = Σ total_price de las reservas firmes completas
    expect(data.totals.revenue_mxn).toBe(15400) // 5,000 + 3,999.99 + 3,000 + 2,400 + 1,000.01
  })

  it('periodos contiguos suman lo mismo que el periodo completo (sin doble conteo)', async () => {
    const a = (await read('revenue', { from: '2026-09-01', to: '2026-10-15' })).data.totals
    const b = (await read('revenue', { from: '2026-10-15', to: '2026-12-01' })).data.totals
    const all = (await read('revenue', { from: '2026-09-01', to: '2026-12-01' })).data.totals
    expect(Math.round((a.revenue_mxn + b.revenue_mxn) * 100)).toBe(Math.round(all.revenue_mxn * 100))
    expect(a.nights + b.nights).toBe(all.nights)
  })

  it('noches vendidas del ingreso = noches ocupadas por reservas (misma regla de estatus)', async () => {
    const occ = (await read('occupancy', OCT)).data.totals
    const rev = (await read('revenue', OCT)).data.totals
    expect(rev.nights).toBe(occ.occupied_nights_by_instrument.reservation)
  })

  it('los cargos/abonos de contratos (payments, payment_receipts) no entran al ingreso', async () => {
    // La fixture tiene un cargo pagado de $15,000 de U2; el ingreso de octubre no lo incluye.
    const { data } = await read('revenue', OCT)
    expect(data.totals.revenue_mxn).toBe(11400)
    expect(data.by_unit.map((u: Row) => u.unit_id)).not.toContain(U2)
  })
})
