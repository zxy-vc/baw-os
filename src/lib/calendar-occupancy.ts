// BaW OS — Calendario de unidades: lógica de ocupación compartida.
//
// Fusiona los tres instrumentos de ocupación (contratos LTR/MTR, reservaciones
// STR y holds del booking público) en un modelo único `CalendarStay` que las
// dos vistas del calendario (/calendario timeline y /calendario/[unitId]
// mensual) renderizan. Solo lógica pura: nada de Tailwind aquí (tailwind no
// escanea src/lib — las clases visuales viven en src/components/calendar/).
//
// Convención de fechas: strings ISO `yyyy-mm-dd` comparables lexicográficamente.
// Los rangos son SEMIABIERTOS [start, endExclusive) — misma semántica que los
// EXCLUDE constraints de la DB (daterange '[)') y que blocked_days del API
// público: el día de check_out queda libre. Los contratos usan end_date
// INCLUSIVO en DB, por eso su endExclusive = end_date + 1 día.

export type StayType = 'STR' | 'MTR' | 'LTR'
export type StayKind = 'contrato' | 'reservacion' | 'hold' | 'bloqueo'

export interface CalendarStay {
  key: string
  kind: StayKind
  /** null solo para holds (no tienen modalidad) */
  type: StayType | null
  person: string
  unitId: string
  /** Primer día ocupado (inclusive) */
  start: string
  /** Primer día libre (exclusivo). null = contrato sin fecha de fin. */
  endExclusive: string | null
  /** Día en que la persona sale: check_out (reserva) o end_date (contrato). */
  moveOutDay: string | null
  status: string
  /** true = no bloquea disponibilidad con certeza (reserva tentativa / contrato pendiente) */
  tentative: boolean
  amount: number
  amountSuffix: string
  href: string | null
  channel?: string | null
  guests?: number | null
  paymentStatus?: string | null
  notes?: string | null
  /** Cotización: la tentativa aparta fechas hasta aquí (null = sin vencimiento) */
  holdExpiresAt?: string | null
}

export interface Season {
  id: string
  name: string
  /** inclusive */
  start_date: string
  /** inclusive (misma semántica que /quotes: date >= start && date <= end) */
  end_date: string
  price_multiplier: number
  notes?: string | null
}

/** Precio fijo por unidad+rango (unit_rate_overrides). Fechas inclusivas.
 *  Gana sobre base × temporada. */
export interface RateOverride {
  id: string
  unit_id: string
  start_date: string
  end_date: string
  nightly_rate_mxn: number
  notes?: string | null
}

/* ------------------------------ Fechas ISO ------------------------------ */

function toUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function todayISO(): string {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

export function addDaysISO(iso: string, days: number): string {
  return new Date(toUTC(iso) + days * 86_400_000).toISOString().slice(0, 10)
}

/** Días de a → b (positivo si b es después de a) */
export function diffDaysISO(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000)
}

export function isWeekendISO(iso: string): boolean {
  const dow = new Date(toUTC(iso)).getUTCDay()
  return dow === 0 || dow === 6
}

/* ----------------------- Mappers de filas Supabase ----------------------- */

// Supabase devuelve joins to-one como objeto pero el tipo infiere array.
function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel ?? null
}

/** Estatus de contrato que pintan ocupación. `terminated` queda fuera (terminó
 *  antes de su end_date y no guardamos cuándo); `expired` sí — su rango ya es
 *  pasado y es historia real de ocupación. */
export const CONTRACT_VISIBLE_STATUSES = ['active', 'pending', 'renewed', 'en_renovacion', 'expired']

/** `cancelled` no bloquea fechas, no se pinta. */
export const RESERVATION_VISIBLE_STATUSES = ['tentative', 'confirmed', 'checked_in', 'checked_out']

export interface ContractRow {
  id: string
  unit_id: string | null
  rent_type: string | null
  status: string
  monthly_amount: number | null
  start_date: string
  end_date: string | null
  notes?: string | null
  occupant?: { name: string } | { name: string }[] | null
}

export interface ReservationRow {
  id: string
  unit_id: string
  guest_name: string | null
  check_in: string
  check_out: string
  status: string
  payment_status: string | null
  total_price: number | null
  guests_count: number | null
  channel: string | null
  notes?: string | null
  hold_expires_at?: string | null
}

export interface HoldRow {
  id: string
  unit_id: string
  from_date: string
  to_date: string
  guests_count: number | null
  guest_email: string | null
  expires_at: string
}

export function contractToStay(c: ContractRow): CalendarStay | null {
  if (!c.unit_id || !c.start_date) return null
  if (!CONTRACT_VISIBLE_STATUSES.includes(c.status)) return null
  const type: StayType =
    c.rent_type === 'STR' || c.rent_type === 'MTR' || c.rent_type === 'LTR' ? c.rent_type : 'LTR'
  return {
    key: `c-${c.id}`,
    kind: 'contrato',
    type,
    person: one<{ name: string }>(c.occupant)?.name ?? 'Sin inquilino',
    unitId: c.unit_id,
    start: c.start_date,
    endExclusive: c.end_date ? addDaysISO(c.end_date, 1) : null,
    moveOutDay: c.end_date ?? null,
    status: c.status,
    tentative: c.status === 'pending',
    amount: c.monthly_amount ?? 0,
    amountSuffix: '/mes',
    href: `/contracts/${c.id}`,
    notes: c.notes ?? null,
  }
}

export function reservationToStay(r: ReservationRow): CalendarStay | null {
  if (!r.check_in || !r.check_out) return null
  if (!RESERVATION_VISIBLE_STATUSES.includes(r.status)) return null
  return {
    key: `r-${r.id}`,
    kind: 'reservacion',
    type: 'STR',
    person: r.guest_name ?? 'Sin huésped',
    unitId: r.unit_id,
    start: r.check_in,
    endExclusive: r.check_out,
    moveOutDay: r.check_out,
    status: r.status,
    tentative: r.status === 'tentative',
    amount: r.total_price ?? 0,
    amountSuffix: '',
    href: '/reservations',
    channel: r.channel,
    guests: r.guests_count,
    paymentStatus: r.payment_status,
    notes: r.notes ?? null,
    holdExpiresAt: r.hold_expires_at ?? null,
  }
}

/** true si la estancia es una cotización tentativa cuyo apartado ya venció. */
export function isHoldExpired(stay: CalendarStay, nowIso: string): boolean {
  return (
    stay.kind === 'reservacion' &&
    stay.status === 'tentative' &&
    stay.holdExpiresAt !== null &&
    stay.holdExpiresAt !== undefined &&
    stay.holdExpiresAt <= nowIso
  )
}

export interface BlockRow {
  id: string
  unit_id: string
  start_date: string
  end_date: string
  reason: string
  notes?: string | null
}

export const BLOCK_REASON_LABEL: Record<string, string> = {
  maintenance: 'Mantenimiento',
  personal: 'Uso personal',
  other: 'Bloqueado',
}

/** Bloqueo operativo (unit_blocks): fechas inclusivas en DB → endExclusive+1. */
export function blockToStay(b: BlockRow): CalendarStay {
  return {
    key: `b-${b.id}`,
    kind: 'bloqueo',
    type: null,
    person: BLOCK_REASON_LABEL[b.reason] ?? 'Bloqueado',
    unitId: b.unit_id,
    start: b.start_date,
    endExclusive: addDaysISO(b.end_date, 1),
    moveOutDay: b.end_date,
    status: b.reason,
    tentative: false,
    amount: 0,
    amountSuffix: '',
    href: null,
    notes: b.notes ?? null,
  }
}

export function holdToStay(h: HoldRow): CalendarStay {
  return {
    key: `h-${h.id}`,
    kind: 'hold',
    type: null,
    person: h.guest_email ? `Hold · ${h.guest_email}` : 'Hold booking público',
    unitId: h.unit_id,
    start: h.from_date,
    endExclusive: h.to_date,
    moveOutDay: h.to_date,
    status: 'hold',
    tentative: true,
    amount: 0,
    amountSuffix: '',
    href: null,
    guests: h.guests_count,
    notes: `Bloqueo temporal del sitio público, expira ${new Date(h.expires_at).toLocaleString('es-MX')}`,
  }
}

/* ------------------------------ Temporadas ------------------------------ */

export function seasonForDate(seasons: Season[], iso: string): Season | null {
  return seasons.find((s) => iso >= s.start_date && iso <= s.end_date) ?? null
}

export function overrideForDate(overrides: RateOverride[], iso: string): RateOverride | null {
  return overrides.find((o) => iso >= o.start_date && iso <= o.end_date) ?? null
}

/** Precio por noche resuelto: override por unidad GANA; si no, tarifa base ×
 *  multiplicador de temporada. null si no hay ni override ni tarifa base. */
export function nightlyPrice(
  baseRate: number | null | undefined,
  seasons: Season[],
  iso: string,
  overrides: RateOverride[] = [],
): number | null {
  const ov = overrideForDate(overrides, iso)
  if (ov) return Math.round(Number(ov.nightly_rate_mxn))
  if (baseRate == null) return null
  const s = seasonForDate(seasons, iso)
  return Math.round(baseRate * (s ? Number(s.price_multiplier) : 1))
}

/* --------------------- Layout del timeline (Vista A) --------------------- */

export interface BarSegment {
  stay: CalendarStay
  /** índice de día dentro de la ventana (0-based) */
  startIdx: number
  /** días visibles */
  span: number
  clippedStart: boolean
  clippedEnd: boolean
  lane: number
}

/** Recorta las estancias a la ventana [windowStart, windowStart+days) y les
 *  asigna carriles para que barras solapadas (tentativas, holds) no se pisen. */
export function layoutLanes(
  stays: CalendarStay[],
  windowStart: string,
  days: number,
): { bars: BarSegment[]; laneCount: number } {
  const windowEnd = addDaysISO(windowStart, days)
  const segments = stays
    .map((stay) => {
      const end = stay.endExclusive ?? windowEnd // sin fin: llena hasta el borde
      if (end <= windowStart || stay.start >= windowEnd) return null
      const s = stay.start < windowStart ? windowStart : stay.start
      const e = end > windowEnd ? windowEnd : end
      return {
        stay,
        startIdx: diffDaysISO(windowStart, s),
        span: Math.max(1, diffDaysISO(s, e)),
        clippedStart: stay.start < windowStart,
        clippedEnd: end > windowEnd || stay.endExclusive === null,
        lane: 0,
      }
    })
    .filter((x): x is BarSegment => x !== null)
    .sort((a, b) => a.startIdx - b.startIdx || b.span - a.span)

  const laneEnds: number[] = []
  for (const seg of segments) {
    let lane = laneEnds.findIndex((endIdx) => endIdx <= seg.startIdx)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(0)
    }
    seg.lane = lane
    laneEnds[lane] = seg.startIdx + seg.span
  }
  return { bars: segments, laneCount: Math.max(1, laneEnds.length) }
}

/* -------------------------------- KPIs ---------------------------------- */

export interface CalendarKpis {
  occupancyPct: number
  vacantNights: number
  movesInToday: number
  movesOutToday: number
  /** contratos activos/en renovación que vencen en ≤60 días */
  expiringSoon: number
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1]
    const cur = sorted[i]
    if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1])
    else out.push([...cur] as [number, number])
  }
  return out
}

/** Ocupación sobre la ventana visible. Tentativas y holds NO cuentan como
 *  noches ocupadas (no son certeza); los bloqueos tampoco (no son ingreso);
 *  sí cuentan checked_out/expired (historia). */
export function computeKpis(
  unitIds: string[],
  stays: CalendarStay[],
  windowStart: string,
  days: number,
  today: string,
): CalendarKpis {
  const windowEnd = addDaysISO(windowStart, days)
  const unitSet = new Set(unitIds)
  const byUnit = new Map<string, Array<[number, number]>>()

  for (const s of stays) {
    if (s.kind === 'hold' || s.kind === 'bloqueo' || s.tentative) continue
    if (!unitSet.has(s.unitId)) continue
    const end = s.endExclusive ?? windowEnd
    if (end <= windowStart || s.start >= windowEnd) continue
    const a = diffDaysISO(windowStart, s.start < windowStart ? windowStart : s.start)
    const b = diffDaysISO(windowStart, end > windowEnd ? windowEnd : end)
    if (!byUnit.has(s.unitId)) byUnit.set(s.unitId, [])
    byUnit.get(s.unitId)!.push([a, b])
  }

  let occupied = 0
  for (const uid of unitIds) {
    for (const [a, b] of mergeIntervals(byUnit.get(uid) ?? [])) occupied += b - a
  }
  const total = unitIds.length * days
  const inScope = stays.filter(
    (s) => s.kind !== 'hold' && s.kind !== 'bloqueo' && unitSet.has(s.unitId),
  )
  const horizon = addDaysISO(today, 60)

  return {
    occupancyPct: total > 0 ? Math.round((occupied / total) * 100) : 0,
    vacantNights: Math.max(0, total - occupied),
    movesInToday: inScope.filter((s) => s.start === today).length,
    movesOutToday: inScope.filter((s) => s.moveOutDay === today).length,
    expiringSoon: inScope.filter(
      (s) =>
        s.kind === 'contrato' &&
        (s.status === 'active' || s.status === 'en_renovacion') &&
        s.moveOutDay !== null &&
        s.moveOutDay >= today &&
        s.moveOutDay <= horizon,
    ).length,
  }
}

/** Noches libres de UNA unidad dentro de la ventana (para el rótulo "Nn libres"
 *  de la fila). Igual que los KPIs: tentativas y holds no cuentan ocupado. */
export function freeNightsInWindow(
  stays: CalendarStay[],
  windowStart: string,
  days: number,
): number {
  const windowEnd = addDaysISO(windowStart, days)
  const intervals: Array<[number, number]> = []
  for (const s of stays) {
    if (s.kind === 'hold' || s.tentative) continue
    const end = s.endExclusive ?? windowEnd
    if (end <= windowStart || s.start >= windowEnd) continue
    intervals.push([
      diffDaysISO(windowStart, s.start < windowStart ? windowStart : s.start),
      diffDaysISO(windowStart, end > windowEnd ? windowEnd : end),
    ])
  }
  let occupied = 0
  for (const [a, b] of mergeIntervals(intervals)) occupied += b - a
  return Math.max(0, days - occupied)
}

/* --------------------- Matriz mensual (Vista B) -------------------------- */

export interface MonthCell {
  iso: string
  day: number
  inMonth: boolean
}

/** Celdas de un mes en semanas completas, iniciando en lunes (es-MX). */
export function monthMatrix(year: number, month1to12: number): MonthCell[] {
  const first = `${year}-${String(month1to12).padStart(2, '0')}-01`
  const daysInMonth = new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
  const firstDow = new Date(toUTC(first)).getUTCDay() // 0=domingo
  const leading = (firstDow + 6) % 7 // lunes-first
  const cells: MonthCell[] = []
  for (let i = leading; i > 0; i--) {
    const iso = addDaysISO(first, -i)
    cells.push({ iso, day: Number(iso.slice(8, 10)), inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: addDaysISO(first, d - 1), day: d, inMonth: true })
  }
  while (cells.length % 7 !== 0) {
    const iso = addDaysISO(cells[cells.length - 1].iso, 1)
    cells.push({ iso, day: Number(iso.slice(8, 10)), inMonth: false })
  }
  return cells
}

export function monthLabel(year: number, month1to12: number): string {
  return new Date(Date.UTC(year, month1to12 - 1, 1)).toLocaleDateString('es-MX', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Meses [año, mes 1-12] desde `offsetBack` meses antes del actual hasta
 *  `offsetForward` meses después (relativo al mes de `todayIso`). */
export function monthRange(
  todayIso: string,
  offsetBack: number,
  offsetForward: number,
): Array<{ year: number; month: number }> {
  const y = Number(todayIso.slice(0, 4))
  const m = Number(todayIso.slice(5, 7))
  const out: Array<{ year: number; month: number }> = []
  for (let i = -offsetBack; i < offsetForward; i++) {
    const total = y * 12 + (m - 1) + i
    out.push({ year: Math.floor(total / 12), month: (total % 12) + 1 })
  }
  return out
}
