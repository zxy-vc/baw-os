'use client'

import { formatMXN, formatNights } from '@/lib/public-booking-client/format'
import type { Quote } from '@/lib/public-booking/schemas'
import MonoLabel from './MonoLabel'

export default function PriceBreakdown({
  quote,
  loading,
  error,
}: {
  quote: Quote | null
  loading?: boolean
  error?: string | null
}) {
  if (loading) {
    return (
      <div style={{ padding: 24, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-3)' }}>
        <div className="pb-skeleton" style={{ height: 16, width: '60%', marginBottom: 12 }} />
        <div className="pb-skeleton" style={{ height: 12, width: '90%', marginBottom: 8 }} />
        <div className="pb-skeleton" style={{ height: 12, width: '80%', marginBottom: 8 }} />
        <div className="pb-skeleton" style={{ height: 12, width: '70%', marginBottom: 24 }} />
        <div className="pb-skeleton" style={{ height: 20, width: '50%' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div
        role="alert"
        style={{
          padding: 20,
          background: 'rgba(138, 42, 42, 0.05)',
          border: '1px solid rgba(138, 42, 42, 0.2)',
          borderRadius: 'var(--r-3)',
          color: 'var(--danger)',
          fontSize: 14,
        }}
      >
        No fue posible calcular la cotización: {error}
      </div>
    )
  }

  if (!quote) {
    return (
      <div
        style={{
          padding: 24,
          background: 'var(--surface-2)',
          border: '1px dashed var(--line-2)',
          borderRadius: 'var(--r-3)',
          fontSize: 14,
          color: 'var(--ink-3)',
        }}
      >
        Selecciona fechas para ver el desglose.
      </div>
    )
  }

  const rows: Array<{ label: string; amount: number; emphasize?: boolean }> = [
    {
      label: `${formatNights(quote.nights)} × tarifa`,
      amount: quote.subtotal_mxn,
    },
    { label: 'Limpieza', amount: quote.cleaning_fee_mxn },
    { label: 'IVA', amount: quote.tax_iva_mxn },
  ]

  return (
    <div
      style={{
        padding: 24,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-3)',
      }}
    >
      <MonoLabel as="div" style={{ marginBottom: 16 }}>
        Desglose
      </MonoLabel>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r) => (
          <li
            key={r.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 14,
              color: 'var(--ink-2)',
            }}
          >
            <span>{r.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink)' }}>
              {formatMXN(r.amount, { fractional: true })}
            </span>
          </li>
        ))}
      </ul>

      <hr className="pb-rule" style={{ marginTop: 16, marginBottom: 16 }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)' }}>Total</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
          {formatMXN(quote.total_mxn)}
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--ink-3)', marginLeft: 6, letterSpacing: 0 }}>
            {quote.currency}
          </span>
        </span>
      </div>
    </div>
  )
}
