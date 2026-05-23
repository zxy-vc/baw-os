'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { clearIdempotencyKey, clearAllIdempotencyKeys } from '@/lib/public-booking-client/idempotency'
import { formatDate, formatGuests, formatMXN, diffNights, formatNights } from '@/lib/public-booking-client/format'
import MonoLabel from '@/components/public-booking/MonoLabel'

interface SessionPayload {
  unit_slug: string
  unit_name: string
  from: string
  to: string
  guests: number
  guest: { name: string; email: string; phone?: string }
  quote: { total_mxn: number; currency: string; nights: number }
  idem_scope: string
}

/**
 * Pantalla de confirmación post-Stripe. Lee del sessionStorage los datos
 * guardados antes del redirect. NO crea endpoints nuevos (ver WS-4 para
 * un endpoint canónico de "GET booking by hold_id").
 *
 * Limpia el Idempotency-Key al llegar — un nuevo intento será una nueva reserva.
 */
export default function ConfirmacionClient({
  holdId,
  sessionId,
}: {
  holdId: string
  sessionId?: string
}) {
  const [data, setData] = useState<SessionPayload | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('baw:booking:last-attempt')
      if (raw) {
        const parsed = JSON.parse(raw) as SessionPayload
        setData(parsed)
        if (parsed.idem_scope) clearIdempotencyKey(parsed.idem_scope)
      }
    } catch {
      /* ignore */
    }
    // Por seguridad, limpiar todos los idempotency keys obsoletos
    clearAllIdempotencyKeys()
    setHydrated(true)
  }, [])

  const nights = data ? diffNights(data.from, data.to) : 0

  return (
    <section style={{ paddingTop: 64, paddingBottom: 96 }}>
      <div className="pb-container">
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          {/* Confirmation icon */}
          <div
            style={{
              width: 72,
              height: 72,
              margin: '0 auto 32px',
              borderRadius: '50%',
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-hidden="true"
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M8 16l5 5 11-11"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <MonoLabel as="div" style={{ marginBottom: 12 }}>
            Reserva confirmada
          </MonoLabel>

          <h1
            style={{
              fontSize: 'clamp(36px, 5vw, 56px)',
              letterSpacing: '-0.025em',
              lineHeight: 1.05,
              marginBottom: 16,
            }}
          >
            Gracias{data?.guest?.name ? `, ${data.guest.name.split(' ')[0]}` : ''}.
          </h1>

          <p style={{ fontSize: 18, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 40, maxWidth: 520, margin: '0 auto 40px' }}>
            Tu reserva está confirmada. Te enviamos un correo
            {data?.guest?.email ? ` a ${data.guest.email}` : ''} con los detalles
            de check-in. Si no lo ves, revisa la carpeta de promociones.
          </p>
        </div>

        <div
          style={{
            maxWidth: 640,
            margin: '0 auto',
            padding: 32,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-4)',
            boxShadow: 'var(--shadow-sm)',
            textAlign: 'left',
          }}
        >
          <MonoLabel as="div" style={{ marginBottom: 16 }}>
            Detalles de la reserva
          </MonoLabel>

          {hydrated && data ? (
            <dl style={{ margin: 0 }}>
              <Row label="Número de reserva" value={holdId.slice(0, 8).toUpperCase()} mono />
              <Row label="Unidad" value={data.unit_name} />
              <Row label="Dirección" value="Mateos 809, Colonia Centro, León, GTO" />
              <Row label="Check-in" value={formatDate(data.from, 'weekday')} />
              <Row label="Check-out" value={formatDate(data.to, 'weekday')} />
              <Row label="Estancia" value={`${formatNights(nights)} · ${formatGuests(data.guests)}`} />
              {data.quote && (
                <Row
                  label="Total pagado"
                  value={`${formatMXN(data.quote.total_mxn)} ${data.quote.currency}`}
                  last
                />
              )}
            </dl>
          ) : (
            <dl style={{ margin: 0 }}>
              <Row label="Número de reserva" value={holdId.slice(0, 8).toUpperCase()} mono />
              <Row label="Estatus" value="Confirmada — revisa tu correo" last />
            </dl>
          )}

          <hr className="pb-rule" style={{ marginTop: 24, marginBottom: 24 }} />

          <h3 style={{ fontSize: 18, marginBottom: 12, letterSpacing: '-0.01em' }}>
            ¿Qué sigue?
          </h3>
          <ol style={{ paddingLeft: 18, color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.7, margin: 0 }}>
            <li>Recibirás el correo de confirmación en minutos.</li>
            <li>24 horas antes del check-in te enviaremos el código de acceso por correo y WhatsApp.</li>
            <li>Llegas, abres y te instalas — sin recepción de por medio.</li>
          </ol>
        </div>

        <div style={{ textAlign: 'center', marginTop: 40, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/mateos-809" className="pb-btn pb-btn-ghost">
            Volver al inicio
          </Link>
          <a href="mailto:hola@baw.mx" className="pb-btn pb-btn-primary">
            Contactar al anfitrión
          </a>
        </div>

        {sessionId && (
          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
            session: {sessionId.slice(0, 20)}…
          </p>
        )}
      </div>
    </section>
  )
}

function Row({ label, value, last, mono }: { label: string; value: string; last?: boolean; mono?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        padding: '12px 0',
        borderBottom: last ? 'none' : '1px solid var(--line)',
        fontSize: 14,
        flexWrap: 'wrap',
      }}
    >
      <dt style={{ color: 'var(--ink-3)' }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          color: 'var(--ink)',
          fontWeight: 500,
          textAlign: 'right',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          letterSpacing: mono ? '0.05em' : undefined,
        }}
      >
        {value}
      </dd>
    </div>
  )
}
