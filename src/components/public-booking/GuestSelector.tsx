'use client'

import MonoLabel from './MonoLabel'

export default function GuestSelector({
  value,
  onChange,
  max = 6,
  min = 1,
  label = 'Huéspedes',
}: {
  value: number
  onChange: (n: number) => void
  max?: number
  min?: number
  label?: string
}) {
  const dec = () => onChange(Math.max(min, value - 1))
  const inc = () => onChange(Math.min(max, value + 1))

  return (
    <div>
      <MonoLabel as="div" style={{ marginBottom: 8 }}>{label}</MonoLabel>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-2)',
          padding: 8,
        }}
      >
        <button
          type="button"
          onClick={dec}
          aria-label="Quitar huésped"
          disabled={value <= min}
          style={{
            width: 36,
            height: 36,
            background: 'var(--surface-2)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-2)',
            color: 'var(--ink)',
            fontSize: 18,
            cursor: value <= min ? 'not-allowed' : 'pointer',
            opacity: value <= min ? 0.4 : 1,
          }}
        >
          −
        </button>
        <div
          aria-live="polite"
          style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: 24,
            letterSpacing: '-0.01em',
            color: 'var(--ink)',
          }}
        >
          {value}
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--ink-3)',
              marginLeft: 8,
              letterSpacing: 0,
            }}
          >
            de {max} máx
          </span>
        </div>
        <button
          type="button"
          onClick={inc}
          aria-label="Agregar huésped"
          disabled={value >= max}
          style={{
            width: 36,
            height: 36,
            background: 'var(--surface-2)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-2)',
            color: 'var(--ink)',
            fontSize: 18,
            cursor: value >= max ? 'not-allowed' : 'pointer',
            opacity: value >= max ? 0.4 : 1,
          }}
        >
          +
        </button>
      </div>
    </div>
  )
}
