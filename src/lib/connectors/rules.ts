// BaW OS — Conector v1 (ENG-624): las reglas de conteo, en UN solo lugar.
//
// Ocupación, tarifa y pago se cuentan aquí y en ningún otro lado del conector.
// La explicación (qué regla y por qué) vive en docs/connectors-v1.md; si cambias
// una regla, sube RULES_VERSION y actualiza el doc en el mismo PR.
//
// Solo lógica pura (sin Supabase) para poder probar las cifras contra un
// fixture. Fechas: strings `yyyy-mm-dd` (fecha local del inmueble), rangos
// SEMIABIERTOS [inicio, fin) — la misma semántica que los EXCLUDE de la DB.
//
// No toca las pantallas de BaW OS: el calendario (calendar-occupancy.ts), el
// sitio público y /cobros siguen con su lógica. Diferencias documentadas en
// docs/connectors-v1.md §«Diferencias con las pantallas».

import { addDaysISO, diffDaysISO } from '@/lib/calendar-occupancy'

export const RULES_VERSION = 'connectors-v1.2026-10-26'

/* ------------------------------- Fuentes ------------------------------- */

export type ReservationChannel = 'airbnb' | 'booking' | 'lodgify' | 'direct' | 'other' | 'unknown'

/**
 * Fuente de la reserva. `channel` lo escriben Channex y la cotización
 * telefónica; `platform` lo captura la pantalla /reservations. Gana `channel`.
 * Sin ninguno de los dos → 'unknown' (no lo adivinamos como 'direct').
 */
export function normalizeChannel(
  channel: string | null | undefined,
  platform: string | null | undefined,
): ReservationChannel {
  const raw = (channel || platform || '').trim().toLowerCase()
  if (!raw) return 'unknown'
  if (raw.includes('airbnb')) return 'airbnb'
  if (raw.includes('booking')) return 'booking'
  if (raw.includes('lodgify')) return 'lodgify'
  if (raw === 'direct' || raw === 'directo' || raw === 'directa') return 'direct'
  return 'other'
}

/* ------------------------------- Estatus ------------------------------- */

/** Reservas que son hecho (no cotización ni cancelación). */
export const FIRM_RESERVATION_STATUSES = ['confirmed', 'checked_in', 'checked_out'] as const

/** Lo que el conector expone en /reservations. `tentative` = cotización con
 *  apartado (prospecto del CRM), no reserva: nunca sale del conector. */
export const LISTED_RESERVATION_STATUSES = [...FIRM_RESERVATION_STATUSES, 'cancelled'] as const

/** Contratos que ocupan la unidad. `pending` no ocupa (no ha arrancado con
 *  certeza); `terminated` no ocupa porque BaW OS no guarda cuándo terminó. */
export const OCCUPYING_CONTRACT_STATUSES = ['active', 'renewed', 'en_renovacion', 'expired'] as const

export function isFirmReservation(status: string | null | undefined): boolean {
  return (FIRM_RESERVATION_STATUSES as readonly string[]).includes(status ?? '')
}

/* ------------------------------- Dinero -------------------------------- */

/** numeric de Postgres (número o string) → centavos enteros. Un solo redondeo,
 *  half-up (mitades lejos de cero), sobre la representación decimal exacta del
 *  dato: un número usa su representación más corta (la misma que el string de
 *  PostgREST), así 1.0049999 y '1.0049999' dan lo mismo. null/basura → 0. */
export function toCents(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  let s: string
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 0
    s = String(v)
    // Notación científica (|v| < 1e-6 o ≥ 1e21): a decimal plano.
    if (/e/i.test(s)) s = Math.abs(v) >= 1e21 ? BigInt(Math.trunc(v)).toString() : v.toFixed(20)
  } else {
    s = String(v).trim()
  }
  const m = /^([-+]?)(\d*)(?:\.(\d*))?$/.exec(s)
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return 0
  const sign = m[1] === '-' ? -1 : 1
  const frac = (m[3] ?? '').padEnd(3, '0')
  let cents = Number(m[2] || '0') * 100 + Number(frac.slice(0, 2))
  if (Number(frac[2]) >= 5) cents += 1
  return sign * cents
}

export function fromCents(c: number): number {
  return c / 100
}

/** Reparte `totalCents` entre `nights` noches: misma cuota por noche y los
 *  centavos sobrantes a las primeras noches. La suma SIEMPRE es el total. */
export function allocateCents(totalCents: number, nights: number): number[] {
  if (nights <= 0) return []
  const base = Math.floor(totalCents / nights)
  const rem = totalCents - base * nights
  return Array.from({ length: nights }, (_, i) => base + (i < rem ? 1 : 0))
}

/* ------------------------------ Periodos ------------------------------- */

/**
 * Base temporal del conector. BaW OS no guarda zona por inmueble; la
 * convención del producto es America/Mexico_City (default de
 * user_preferences.timezone en 20260430010640_platform_admin.sql y "hoy en
 * CDMX" de los scripts BAW-18). Las fechas de negocio (check_in, end_date…)
 * ya son fechas locales; solo los timestamps (archived_at) se convierten.
 */
export const CONNECTOR_TIME_ZONE = 'America/Mexico_City'

/** Timestamp → fecha local `yyyy-mm-dd` en la base temporal del conector. */
export function localDateOf(timestamp: string, timeZone: string = CONNECTOR_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp))
}

export interface Period {
  from: string
  /** exclusivo */
  to: string
}

export function nightsBetween(start: string, endExclusive: string): number {
  return diffDaysISO(start, endExclusive)
}

export function eachNight(p: Period): string[] {
  const n = Math.max(0, diffDaysISO(p.from, p.to))
  return Array.from({ length: n }, (_, i) => addDaysISO(p.from, i))
}

/* ------------------------------- Tarifa -------------------------------- */

/**
 * Tarifa = tarifa REALIZADA de la reserva: total pactado ÷ noches. No se
 * recalcula con tarifa base ni temporadas (eso es cotización, y hoy BaW OS
 * tiene dos cotizadores que no coinciden). null si la reserva no tiene noches.
 */
export function nightlyRateMxn(totalPrice: unknown, nights: number): number | null {
  if (nights <= 0) return null
  return Math.round(toCents(totalPrice) / nights) / 100
}

/* ----------------------------- Ocupación ------------------------------- */

export interface Interval {
  start: string
  /** exclusivo; null = sin fin (contrato abierto) */
  endExclusive: string | null
}

export interface ReservationLike {
  check_in: string | null
  check_out: string | null
  status: string | null
}

export interface ContractLike {
  start_date: string | null
  end_date: string | null
  status: string | null
}

export interface BlockLike {
  start_date: string | null
  end_date: string | null
}

/** Noches que ocupa una reserva firme: [check_in, check_out). */
export function reservationInterval(r: ReservationLike): Interval | null {
  if (!r.check_in || !r.check_out || !isFirmReservation(r.status)) return null
  if (r.check_out <= r.check_in) return null
  return { start: r.check_in, endExclusive: r.check_out }
}

/** Noches que ocupa un contrato: end_date es INCLUSIVO en DB → +1 día. */
export function contractInterval(c: ContractLike): Interval | null {
  if (!c.start_date) return null
  if (!(OCCUPYING_CONTRACT_STATUSES as readonly string[]).includes(c.status ?? '')) return null
  return { start: c.start_date, endExclusive: c.end_date ? addDaysISO(c.end_date, 1) : null }
}

/** Bloqueo operativo (unit_blocks): fechas inclusivas en DB → +1 día. */
export function blockInterval(b: BlockLike): Interval | null {
  if (!b.start_date || !b.end_date) return null
  return { start: b.start_date, endExclusive: addDaysISO(b.end_date, 1) }
}

function covers(iv: Interval, night: string): boolean {
  return night >= iv.start && (iv.endExclusive === null || night < iv.endExclusive)
}

export interface UnitOccupancy {
  nights_in_period: number
  blocked_nights: number
  available_nights: number
  occupied_nights: number
  occupied_nights_by_instrument: { reservation: number; contract: number }
  /** occupied / available, 4 decimales; null si no hubo noches disponibles */
  occupancy_rate: number | null
}

/**
 * Ocupación de UNA unidad en el periodo. Por noche:
 *  - ocupada si la cubre una reserva firme o un contrato vigente (una noche
 *    cubierta por ambos cuenta UNA vez, atribuida a la reserva);
 *  - bloqueada si la cubre un unit_block y NO está ocupada;
 *  - disponible = noches del periodo − bloqueadas.
 * Tentativas, holds del checkout y cancelaciones no cuentan para nada.
 * `activeUntil` (exclusivo) recorta el periodo de una unidad archivada.
 */
export function unitOccupancy(input: {
  period: Period
  reservations: Interval[]
  contracts: Interval[]
  blocks: Interval[]
  activeUntil?: string | null
}): UnitOccupancy {
  let nights = 0
  let blocked = 0
  let byReservation = 0
  let byContract = 0
  for (const night of eachNight(input.period)) {
    if (input.activeUntil && night >= input.activeUntil) break
    nights++
    if (input.reservations.some((iv) => covers(iv, night))) byReservation++
    else if (input.contracts.some((iv) => covers(iv, night))) byContract++
    else if (input.blocks.some((iv) => covers(iv, night))) blocked++
  }
  const occupied = byReservation + byContract
  const available = nights - blocked
  return {
    nights_in_period: nights,
    blocked_nights: blocked,
    available_nights: available,
    occupied_nights: occupied,
    occupied_nights_by_instrument: { reservation: byReservation, contract: byContract },
    occupancy_rate: rate(occupied, available),
  }
}

export function rate(num: number, den: number): number | null {
  if (den <= 0) return null
  return Math.round((num / den) * 10_000) / 10_000
}

/* ---------------------------- Pago / ingreso --------------------------- */

export interface ReservationMoneyLike extends ReservationLike {
  total_price: unknown
  amount_paid: unknown
}

export interface ReservationAllocation {
  /** noches totales de la reserva */
  nights: number
  /** noches de la reserva que caen en el periodo */
  nights_in_period: number
  /** devengado en el periodo (centavos) */
  revenue_cents: number
  /** cobrado registrado, asignado al periodo por noche (centavos) */
  collected_cents: number
  /** devengado por mes calendario (yyyy-mm → centavos y noches) */
  by_month: Record<string, { nights: number; revenue_cents: number; collected_cents: number }>
}

/**
 * Pago/ingreso de una reserva en el periodo:
 *  - devengado = total_price de la reserva repartido por noche; al periodo le
 *    toca la suma de sus noches (una reserva que cruza meses se parte);
 *  - cobrado = amount_paid de la reserva, repartido igual (BaW OS no guarda la
 *    fecha del cobro de una reserva, así que NO es flujo de caja).
 * Nunca se leen payments / payment_receipts / payment_ledger: son cargos y
 * abonos de CONTRATOS; sumarlos con reservas mezcla instrumentos y los abonos
 * ya están dentro de payments.amount_paid (doble conteo).
 * Solo reservas firmes; las demás devuelven null.
 */
export function allocateReservation(
  r: ReservationMoneyLike,
  period: Period,
): ReservationAllocation | null {
  const iv = reservationInterval(r)
  if (!iv || !iv.endExclusive) return null
  const nights = nightsBetween(iv.start, iv.endExclusive)
  const revenue = allocateCents(toCents(r.total_price), nights)
  const collected = allocateCents(toCents(r.amount_paid), nights)
  const out: ReservationAllocation = {
    nights,
    nights_in_period: 0,
    revenue_cents: 0,
    collected_cents: 0,
    by_month: {},
  }
  for (let i = 0; i < nights; i++) {
    const night = addDaysISO(iv.start, i)
    if (night < period.from || night >= period.to) continue
    out.nights_in_period++
    out.revenue_cents += revenue[i]
    out.collected_cents += collected[i]
    const month = night.slice(0, 7)
    const m = (out.by_month[month] ??= { nights: 0, revenue_cents: 0, collected_cents: 0 })
    m.nights++
    m.revenue_cents += revenue[i]
    m.collected_cents += collected[i]
  }
  return out
}

/** Tarifa promedio (ADR) del periodo = devengado ÷ noches vendidas. */
export function adrMxn(revenueCents: number, nights: number): number | null {
  if (nights <= 0) return null
  return Math.round(revenueCents / nights) / 100
}
