'use client'

import { useState } from 'react'
import { postLead } from '@/lib/public-booking-client/api-client'
import { formatMXN } from '@/lib/public-booking-client/format'
import type { PublicUnit } from '@/lib/public-booking/schemas'
import MonoLabel from './MonoLabel'

/**
 * Fase 1 Public Listing — CTA para unidades MTR/LTR. En lugar del checkout
 * STR, captura el interés (lead → CRM + oportunidad) y entrega el link a la
 * solicitud de renta pre-creada (/apply/[token]) para continuar el intake.
 */
export default function LeadForm({ unit }: { unit: PublicUnit }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [moveIn, setMoveIn] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applyUrl, setApplyUrl] = useState<string | null>(null)

  const rentLabel = unit.rent_type === 'MTR' ? 'Renta media' : 'Renta larga'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    const res = await postLead({
      unit_slug: unit.slug,
      name,
      email,
      phone: phone || undefined,
      message: message || undefined,
      desired_move_in: moveIn || undefined,
    })
    setSubmitting(false)
    if (res.error) {
      setError(res.error.message)
      return
    }
    setApplyUrl(res.data.apply_url)
  }

  if (applyUrl) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <MonoLabel as="div" style={{ marginBottom: 6 }}>Solicitud recibida</MonoLabel>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)' }}>
            Gracias por tu interés. Te contactaremos pronto. Si quieres
            adelantar el proceso, puedes iniciar tu solicitud de renta ahora
            mismo — te toma unos minutos.
          </p>
        </div>
        <a
          href={applyUrl}
          className="pb-btn pb-btn-primary"
          style={{ width: '100%', padding: '14px 24px', fontSize: 15, textAlign: 'center' }}
        >
          Iniciar solicitud de renta
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <MonoLabel as="div" style={{ marginBottom: 6 }}>{rentLabel}</MonoLabel>
        {unit.monthly_rate_mxn ? (
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
            {formatMXN(unit.monthly_rate_mxn)}
            <span style={{ fontSize: 14, color: 'var(--ink-3)', fontFamily: 'var(--font-body)', marginLeft: 4 }}>
              /mes
            </span>
          </div>
        ) : (
          <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
            Precio a consultar.
          </p>
        )}
      </div>

      <div>
        <MonoLabel as="label" htmlFor="lead-name" style={{ marginBottom: 6 }}>Nombre</MonoLabel>
        <input
          id="lead-name"
          className="pb-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          autoComplete="name"
        />
      </div>

      <div>
        <MonoLabel as="label" htmlFor="lead-email" style={{ marginBottom: 6 }}>Email</MonoLabel>
        <input
          id="lead-email"
          className="pb-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>

      <div>
        <MonoLabel as="label" htmlFor="lead-phone" style={{ marginBottom: 6 }}>Teléfono (opcional)</MonoLabel>
        <input
          id="lead-phone"
          className="pb-input"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
        />
      </div>

      <div>
        <MonoLabel as="label" htmlFor="lead-movein" style={{ marginBottom: 6 }}>¿Cuándo te mudarías? (opcional)</MonoLabel>
        <input
          id="lead-movein"
          className="pb-input"
          type="date"
          value={moveIn}
          onChange={(e) => setMoveIn(e.target.value)}
        />
      </div>

      <div>
        <MonoLabel as="label" htmlFor="lead-message" style={{ marginBottom: 6 }}>Mensaje (opcional)</MonoLabel>
        <textarea
          id="lead-message"
          className="pb-input"
          rows={3}
          maxLength={1000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{ resize: 'vertical' }}
        />
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: 12,
            background: 'rgba(138, 42, 42, 0.05)',
            border: '1px solid rgba(138, 42, 42, 0.2)',
            borderRadius: 'var(--r-2)',
            fontSize: 13,
            color: 'var(--danger)',
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        className="pb-btn pb-btn-primary"
        disabled={submitting}
        style={{ width: '100%', padding: '14px 24px', fontSize: 15 }}
      >
        {submitting ? 'Enviando…' : 'Me interesa esta unidad'}
      </button>

      <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5, margin: 0 }}>
        Al enviar aceptas que te contactemos sobre esta unidad. Sin costo ni
        compromiso.
      </p>
    </form>
  )
}
