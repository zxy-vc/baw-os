import { Quote, QuoteBreakdownItem, PublicUnit } from './schemas'

const IVA_RATE = 0.16 // 16% IVA México

/**
 * Count nights between two YYYY-MM-DD strings.
 * Uses simple date arithmetic (midnight UTC).
 */
export function countNights(from: string, to: string): number {
  const msPerDay = 86_400_000
  return Math.round(
    (new Date(to).getTime() - new Date(from).getTime()) / msPerDay,
  )
}

/**
 * Compute a full price quote for a unit.
 * Throws if unit has no base_rate_mxn configured.
 */
export function computeQuote(
  unit: Pick<PublicUnit, 'slug' | 'base_rate_mxn' | 'cleaning_fee_mxn' | 'max_guests' | 'min_nights'>,
  from: string,
  to: string,
  guests: number,
): Quote {
  if (unit.base_rate_mxn === null || unit.base_rate_mxn === undefined) {
    throw new Error('Unit has no base rate configured')
  }
  if (guests > unit.max_guests) {
    throw new Error(`Unit supports max ${unit.max_guests} guests`)
  }

  const nights = countNights(from, to)
  if (nights < unit.min_nights) {
    throw new Error(`Minimum stay is ${unit.min_nights} night(s)`)
  }
  if (nights <= 0) {
    throw new Error('"to" must be after "from"')
  }

  const baseRate = Number(unit.base_rate_mxn)
  const cleaningFee = Number(unit.cleaning_fee_mxn ?? 0)

  const subtotal = round2(baseRate * nights)
  const preTaxTotal = round2(subtotal + cleaningFee)
  const taxIva = round2(preTaxTotal * IVA_RATE)
  const total = round2(preTaxTotal + taxIva)

  const breakdown: QuoteBreakdownItem[] = [
    {
      label: `${nights} ${nights === 1 ? 'noche' : 'noches'} × $${baseRate.toLocaleString('es-MX')} MXN`,
      amount_mxn: subtotal,
    },
  ]

  if (cleaningFee > 0) {
    breakdown.push({ label: 'Limpieza', amount_mxn: cleaningFee })
  }

  breakdown.push({ label: 'IVA (16%)', amount_mxn: taxIva })

  return {
    unit_slug: unit.slug,
    from,
    to,
    guests,
    nights,
    subtotal_mxn: subtotal,
    cleaning_fee_mxn: cleaningFee,
    tax_iva_mxn: taxIva,
    total_mxn: total,
    currency: 'MXN',
    breakdown,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
