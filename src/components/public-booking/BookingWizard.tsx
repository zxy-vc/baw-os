'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PublicUnit, Quote } from '@/lib/public-booking/schemas'
import {
  postQuote,
  postCheckout,
  type CheckoutInput,
} from '@/lib/public-booking-client/api-client'
import { getOrCreateIdempotencyKey } from '@/lib/public-booking-client/idempotency'
import { formatDate, diffNights, formatGuests } from '@/lib/public-booking-client/format'
import PriceBreakdown from './PriceBreakdown'
import MonoLabel from './MonoLabel'

type Step = 1 | 2 | 3

export default function BookingWizard({
  unit,
  initialFrom,
  initialTo,
  initialGuests,
}: {
  unit: PublicUnit
  initialFrom: string
  initialTo: string
  initialGuests: number
}) {
  const [step, setStep] = useState<Step>(1)
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [guests, setGuests] = useState(initialGuests)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  const nights = diffNights(from, to)
  const tooFew = nights < unit.min_nights

  // Refrescar quote cuando cambien fechas/huéspedes
  useEffect(() => {
    if (!from || !to || nights <= 0) return
    let cancelled = false
    setQuoteLoading(true)
    setQuoteError(null)
    const handle = setTimeout(async () => {
      const res = await postQuote({ unit_slug: unit.slug, from, to, guests })
      if (cancelled) return
      if (res.error) {
        setQuoteError(res.error.message)
        setQuote(null)
      } else {
        setQuote(res.data)
      }
      setQuoteLoading(false)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [unit.slug, from, to, guests, nights])

  const goCheckout = useCallback(async () => {
    if (!quote) return
    setSubmitting(true)
    setCheckoutError(null)
    const scope = `${unit.slug}:${from}:${to}:${guests}`
    const idemKey = getOrCreateIdempotencyKey(scope)

    // Guardar info para la pantalla de confirmación
    try {
      sessionStorage.setItem(
        'baw:booking:last-attempt',
        JSON.stringify({
          unit_slug: unit.slug,
          unit_name: unit.name ?? unit.slug,
          from,
          to,
          guests,
          guest: { name, email, phone },
          quote: quote,
          idem_scope: scope,
        })
      )
    } catch {
      /* ignore quota */
    }

    const payload: CheckoutInput = {
      unit_slug: unit.slug,
      from,
      to,
      guests,
      guest: { name, email, phone: phone || undefined },
    }
    const res = await postCheckout(payload, idemKey)
    if (res.error) {
      setCheckoutError(res.error.message)
      setSubmitting(false)
      return
    }
    // Redirect a Stripe checkout
    window.location.href = res.data.checkout_url
  }, [unit, from, to, guests, name, email, phone, quote])

  const canGoStep2 = !tooFew && nights > 0
  const canGoStep3 = name.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)

  return (
    <div style={{ display: 'grid', gap: 32 }}>
      <Stepper step={step} />

      {step === 1 && (
        <Card>
          <MonoLabel as="div" style={{ marginBottom: 8 }}>Paso 1 · Fechas</MonoLabel>
          <h2 style={{ fontSize: 28, marginBottom: 24, letterSpacing: '-0.01em' }}>
            Confirma tus fechas
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
            <Field label="Entrada">
              <input type="date" className="pb-input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Salida">
              <input type="date" className="pb-input" value={to} onChange={(e) => setTo(e.target.value)} min={from} />
            </Field>
            <Field label="Huéspedes">
              <select className="pb-input" value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
                {Array.from({ length: unit.max_guests }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
          </div>
          {tooFew && (
            <p style={{ color: 'var(--warning)', fontSize: 13, marginBottom: 12 }}>
              Esta unidad requiere mínimo {unit.min_nights} noches.
            </p>
          )}
          <div style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 24 }}>
            {nights > 0
              ? `${nights} noches · ${formatGuests(guests)} · del ${formatDate(from)} al ${formatDate(to)}`
              : 'Selecciona fechas válidas para continuar.'}
          </div>
          <Actions>
            <button
              type="button"
              className="pb-btn pb-btn-primary"
              disabled={!canGoStep2}
              onClick={() => setStep(2)}
            >
              Continuar
            </button>
          </Actions>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <MonoLabel as="div" style={{ marginBottom: 8 }}>Paso 2 · Tus datos</MonoLabel>
          <h2 style={{ fontSize: 28, marginBottom: 24, letterSpacing: '-0.01em' }}>
            ¿A nombre de quién va la reserva?
          </h2>
          <div style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
            <Field label="Nombre completo">
              <input type="text" className="pb-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </Field>
            <Field label="Email">
              <input type="email" className="pb-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </Field>
            <Field label="Teléfono (opcional)">
              <input type="tel" className="pb-input" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+52 477 ..." />
            </Field>
          </div>
          <Actions>
            <button type="button" className="pb-btn pb-btn-ghost" onClick={() => setStep(1)}>
              ← Atrás
            </button>
            <button
              type="button"
              className="pb-btn pb-btn-primary"
              disabled={!canGoStep3}
              onClick={() => setStep(3)}
            >
              Revisar reserva
            </button>
          </Actions>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <MonoLabel as="div" style={{ marginBottom: 8 }}>Paso 3 · Revisión</MonoLabel>
          <h2 style={{ fontSize: 28, marginBottom: 24, letterSpacing: '-0.01em' }}>
            Confirma y procede al pago
          </h2>

          <div
            style={{
              padding: 20,
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-3)',
              marginBottom: 24,
            }}
          >
            <Row label="Unidad" value={unit.name ?? unit.slug} />
            <Row label="Estancia" value={`${formatDate(from, 'short')} – ${formatDate(to, 'short')} · ${nights} noches`} />
            <Row label="Huéspedes" value={formatGuests(guests)} />
            <Row label="Reserva a nombre de" value={name} />
            <Row label="Email" value={email} last />
          </div>

          <div style={{ marginBottom: 24 }}>
            <PriceBreakdown quote={quote} loading={quoteLoading} error={quoteError} />
          </div>

          {checkoutError && (
            <div
              role="alert"
              style={{
                padding: 16,
                background: 'rgba(138, 42, 42, 0.05)',
                border: '1px solid rgba(138, 42, 42, 0.2)',
                borderRadius: 'var(--r-3)',
                color: 'var(--danger)',
                fontSize: 14,
                marginBottom: 16,
              }}
            >
              No pudimos iniciar el pago: {checkoutError}
            </div>
          )}

          <Actions>
            <button
              type="button"
              className="pb-btn pb-btn-ghost"
              onClick={() => setStep(2)}
              disabled={submitting}
            >
              ← Atrás
            </button>
            <button
              type="button"
              className="pb-btn pb-btn-primary"
              onClick={goCheckout}
              disabled={!quote || submitting}
            >
              {submitting ? 'Redirigiendo…' : 'Pagar y reservar'}
            </button>
          </Actions>

          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 16, lineHeight: 1.6 }}>
            Al continuar serás redirigido a Stripe para completar el pago de forma segura.
            No almacenamos los datos de tu tarjeta.
          </p>
        </Card>
      )}
    </div>
  )
}

function Stepper({ step }: { step: Step }) {
  const labels = ['Fechas', 'Datos', 'Pago']
  return (
    <ol
      style={{
        display: 'flex',
        gap: 12,
        listStyle: 'none',
        padding: 0,
        margin: 0,
        flexWrap: 'wrap',
      }}
    >
      {labels.map((lbl, i) => {
        const active = step === i + 1
        const done = step > i + 1
        return (
          <li
            key={lbl}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              background: active ? 'var(--accent)' : done ? 'var(--accent-soft)' : 'var(--surface-2)',
              color: active ? 'var(--accent-ink)' : done ? 'var(--accent)' : 'var(--ink-3)',
              borderRadius: 'var(--r-full)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            <span>{i + 1}</span>
            <span>{lbl}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-4)',
        padding: 32,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="pb-label">{label}</span>
      {children}
    </label>
  )
}

function Actions({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      {children}
    </div>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        padding: '10px 0',
        borderBottom: last ? 'none' : '1px solid var(--line)',
        fontSize: 14,
      }}
    >
      <span style={{ color: 'var(--ink-3)' }}>{label}</span>
      <span style={{ color: 'var(--ink)', fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
