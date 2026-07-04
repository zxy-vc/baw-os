'use client'

import { useState } from 'react'

/**
 * Piezas interactivas de la landing baw.mx: cintillo dismissible hacia
 * 809.mx y formulario de lista de interés (POST /api/public/v1/interest;
 * si el endpoint no está configurado, cae a mailto:admin@baw.mx).
 */

export function Cintillo() {
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <div
      role="region"
      aria-label="Aviso de reservas"
      style={{
        background: 'var(--mkt-accent-tint)',
        borderBottom: '1px solid var(--mkt-line)',
        padding: '10px 0',
      }}
    >
      <div
        className="mkt-wrap"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          fontSize: 13,
          color: 'var(--mkt-text-2)',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--mkt-text)' }}>
          ¿Buscas reservar o rentar un departamento?
        </span>
        <span>Este es el sitio del software. Las reservas viven en 809.mx</span>
        <a
          href="https://809.mx"
          style={{
            marginLeft: 'auto',
            fontWeight: 600,
            color: 'var(--mkt-accent-soft)',
            whiteSpace: 'nowrap',
          }}
        >
          Ir a 809.mx →
        </a>
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={() => setOpen(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--mkt-text-3)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}

export function InterestForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (state === 'sending') return
    setState('sending')
    try {
      const res = await fetch('/api/public/v1/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setState(res.ok ? 'done' : 'error')
    } catch {
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <p style={{ fontSize: 15, color: 'var(--mkt-ok-soft)', fontWeight: 500 }}>
        Listo. Te avisamos en cuanto abramos acceso.
      </p>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: 'flex', gap: 10, flexWrap: 'wrap', maxWidth: 460 }}
    >
      <input
        className="mkt-input"
        type="email"
        required
        placeholder="tu@correo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        style={{ flex: '1 1 220px' }}
      />
      <button
        type="submit"
        className="mkt-btn mkt-btn-primary"
        disabled={state === 'sending'}
      >
        {state === 'sending' ? 'Enviando…' : 'Unirme a la lista'}
      </button>
      {state === 'error' && (
        <p style={{ width: '100%', fontSize: 13, color: 'var(--mkt-text-3)' }}>
          No pudimos registrarte en este momento — escríbenos a{' '}
          <a href="mailto:admin@baw.mx" style={{ color: 'var(--mkt-accent-soft)' }}>
            admin@baw.mx
          </a>
          .
        </p>
      )}
    </form>
  )
}
