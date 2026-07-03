'use client'

import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import { todayISO, plusDaysISO } from '@/lib/public-booking-client/format'
import MonoLabel from './MonoLabel'

/**
 * Barra de búsqueda — fechas + huéspedes. Usa `<input type="date">` para v1.
 * Navega a `/edificios/[buildingSlug]/unidades?from&to&guests`.
 */
export default function SearchBar({
  buildingSlug,
  locationLabel,
  variant = 'card',
  initialFrom,
  initialTo,
  initialGuests,
}: {
  buildingSlug: string
  locationLabel: string
  variant?: 'card' | 'inline'
  initialFrom?: string
  initialTo?: string
  initialGuests?: number
}) {
  const router = useRouter()
  const defaultFrom = useMemo(() => initialFrom ?? plusDaysISO(7), [initialFrom])
  const defaultTo = useMemo(() => initialTo ?? plusDaysISO(9), [initialTo])
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [guests, setGuests] = useState(initialGuests ?? 2)

  const minFrom = todayISO()
  const minTo = useMemo(() => plusDaysISO(1, from), [from])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams({
      from,
      to,
      guests: String(guests),
    })
    router.push(`/edificios/${buildingSlug}/unidades?${params.toString()}`)
  }

  const isCard = variant === 'card'

  return (
    <form
      onSubmit={onSubmit}
      style={{
        background: isCard ? 'var(--surface)' : 'transparent',
        border: isCard ? '1px solid var(--line)' : 'none',
        borderRadius: 'var(--r-3)',
        padding: isCard ? 20 : 0,
        boxShadow: isCard ? 'var(--shadow-md)' : 'none',
        display: 'grid',
        gap: 16,
        gridTemplateColumns: '1fr',
      }}
      className="pb-searchbar"
    >
      <div className="pb-searchbar-grid">
        <div>
          <MonoLabel as="label" htmlFor="sb-location">
            Dirección
          </MonoLabel>
          <input
            id="sb-location"
            className="pb-input"
            value={locationLabel}
            readOnly
            aria-readonly="true"
            style={{ background: 'var(--surface-2)' }}
          />
        </div>
        <div>
          <MonoLabel as="label" htmlFor="sb-from">
            Entrada
          </MonoLabel>
          <input
            id="sb-from"
            type="date"
            className="pb-input"
            value={from}
            min={minFrom}
            onChange={(e) => {
              setFrom(e.target.value)
              if (e.target.value && to <= e.target.value) {
                setTo(plusDaysISO(2, e.target.value))
              }
            }}
            required
          />
        </div>
        <div>
          <MonoLabel as="label" htmlFor="sb-to">
            Salida
          </MonoLabel>
          <input
            id="sb-to"
            type="date"
            className="pb-input"
            value={to}
            min={minTo}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </div>
        <div>
          <MonoLabel as="label" htmlFor="sb-guests">
            Huéspedes
          </MonoLabel>
          <select
            id="sb-guests"
            className="pb-input"
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} huésped{n > 1 ? 'es' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button type="submit" className="pb-btn pb-btn-primary" style={{ padding: '14px 24px', fontSize: 15 }}>
        Buscar disponibilidad
      </button>

      <style>{`
        .pb-searchbar-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        @media (min-width: 640px) {
          .pb-searchbar-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .pb-searchbar-grid {
            grid-template-columns: 2fr 1fr 1fr 1fr;
          }
        }
      `}</style>
    </form>
  )
}
