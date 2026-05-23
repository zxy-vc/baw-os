/**
 * Sprint 5B / WS-2 — Formateadores para la cara pública.
 * Locale principal: es-MX. Moneda: MXN.
 */

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
})

const MXN_FRACTIONAL = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatMXN(amount: number, opts: { fractional?: boolean } = {}): string {
  if (!Number.isFinite(amount)) return '—'
  return opts.fractional ? MXN_FRACTIONAL.format(amount) : MXN.format(amount)
}

const ES_DATE_LONG = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const ES_DATE_SHORT = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
})

const ES_DATE_WEEKDAY = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export function formatDate(input: string | Date, style: 'long' | 'short' | 'weekday' = 'long'): string {
  const d = typeof input === 'string' ? parseISODate(input) : input
  if (!d || isNaN(d.getTime())) return ''
  if (style === 'short') return ES_DATE_SHORT.format(d)
  if (style === 'weekday') return ES_DATE_WEEKDAY.format(d)
  return ES_DATE_LONG.format(d)
}

/**
 * Parsea fechas YYYY-MM-DD como locales (no UTC) para evitar drift de un día.
 */
export function parseISODate(s: string): Date | null {
  if (!s || typeof s !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function diffNights(from: string, to: string): number {
  const a = parseISODate(from)
  const b = parseISODate(to)
  if (!a || !b) return 0
  const ms = b.getTime() - a.getTime()
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
}

export function formatNights(n: number): string {
  if (n === 1) return '1 noche'
  return `${n} noches`
}

export function formatGuests(n: number): string {
  if (n === 1) return '1 huésped'
  return `${n} huéspedes`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function plusDaysISO(n: number, from?: string): string {
  const base = from ? parseISODate(from) ?? new Date() : new Date()
  return toISODate(addDays(base, n))
}
