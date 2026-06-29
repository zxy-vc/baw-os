// Helpers puros del dominio de cobros. Sin React ni DB: viven aquí para tener
// una sola fuente de verdad y poder testearlos en aislamiento (ver tests/cobros).

/** Valores válidos del enum `payment_method` en la DB (en inglés). */
export const PAYMENT_METHOD_ENUM = ['cash', 'transfer', 'stripe', 'other'] as const
export type PaymentMethodEnum = (typeof PAYMENT_METHOD_ENUM)[number]

/**
 * Mapea el label de la UI (español) a las dos columnas de la DB:
 *  - `method`         → enum en inglés: 'cash' | 'transfer'
 *  - `payment_method` → texto en español: 'efectivo' | 'transferencia' | 'otro'
 *
 * Regla clave (candado del bug #94): a `method` NUNCA debe llegar un valor en
 * español, o Postgres rechaza el insert y el pago no se guarda.
 */
export function mapPaymentMethod(uiLabel: string): {
  methodEnum: PaymentMethodEnum
  paymentMethodEs: string
} {
  const m = (uiLabel || '').toLowerCase()
  const methodEnum: PaymentMethodEnum = m === 'efectivo' ? 'cash' : 'transfer' // transferencia y depósito → transfer
  const paymentMethodEs =
    m === 'efectivo' ? 'efectivo' : m === 'transferencia' ? 'transferencia' : 'otro'
  return { methodEnum, paymentMethodEs }
}

/**
 * Referencia auto-generada de un pago: depto + periodo (ej. 'D102-2026-02').
 * Determinista y ordenada por fecha, no aleatoria (candado del bug #95).
 */
export function referenceFor(unitNumber: string | null | undefined, month: string): string {
  const depto = (unitNumber || '').trim().replace(/\s+/g, '') || 'SN'
  return `${depto}-${month}`
}

/** Tarifa de un servicio (agua, luz…) por edificio, con fecha de vigencia. */
export type ServiceRate = {
  building_id: string | null
  service: string
  amount: number
  effective_from: string // 'YYYY-MM-DD'
}

/**
 * Resuelve la tarifa vigente de un servicio para un edificio y mes dados.
 * Prefiere la tarifa específica del edificio sobre la de toda la org, y dentro
 * de eso la de fecha de vigencia más reciente (≤ el mes). Devuelve null si no
 * hay ninguna aplicable (el caller usa su fallback).
 */
export function resolveServiceRate(
  rates: ServiceRate[],
  service: string,
  buildingId: string | null,
  month: string, // 'YYYY-MM'
): number | null {
  const applicable = rates.filter(
    (r) =>
      r.service === service &&
      r.effective_from.slice(0, 7) <= month &&
      (r.building_id === buildingId || r.building_id === null),
  )
  if (!applicable.length) return null
  applicable.sort((a, b) => {
    const aSpecific = a.building_id === buildingId ? 1 : 0
    const bSpecific = b.building_id === buildingId ? 1 : 0
    if (aSpecific !== bSpecific) return bSpecific - aSpecific
    return b.effective_from.localeCompare(a.effective_from)
  })
  return applicable[0].amount
}
