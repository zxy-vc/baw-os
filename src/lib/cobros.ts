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
