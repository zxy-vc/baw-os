import * as React from 'react'
import MonoLabel from './MonoLabel'

interface Amenity {
  key: string
  label: string
  icon: React.ReactNode
}

function I({ d }: { d: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export const COMMON_AMENITIES: Amenity[] = [
  { key: 'wifi', label: 'Wi-Fi fibra', icon: <I d="M14 21h.01M5.6 12.4a12 12 0 0 1 16.8 0M9 16a7 7 0 0 1 10 0M2 8.8a18 18 0 0 1 24 0" /> },
  { key: 'cocina', label: 'Cocina equipada', icon: <I d="M5 4h18v6H5zM7 10v14M21 10v14M5 14h18M9 18h2M15 18h2" /> },
  { key: 'parking', label: 'Estacionamiento', icon: <I d="M5 6h14a3 3 0 0 1 3 3v10H2V9a3 3 0 0 1 3-3zM7 19v2M21 19v2M6 13h16M9 9h6" /> },
  { key: 'laundry', label: 'Lavandería', icon: <I d="M5 3h18v22H5zM5 8h18M14 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM9 5.5h.01M12 5.5h.01" /> },
  { key: 'aire', label: 'Aire acondicionado', icon: <I d="M3 12h22M3 8h22M3 16h22M8 4l-2 4M16 4l-2 4M14 4l2 4M22 4l-2 4M6 24l2-4M14 24l2-4M16 24l-2-4M20 24l2-4" /> },
  { key: 'workspace', label: 'Espacio de trabajo', icon: <I d="M3 6h22v14H3zM7 20v4M21 20v4M3 14h22M11 6V4h6v2" /> },
  { key: 'tv', label: 'Smart TV', icon: <I d="M3 5h22v14H3zM10 23h8M14 19v4" /> },
  { key: 'seguridad', label: 'Acceso 24/7', icon: <I d="M14 4l9 4v8c0 5-4 9-9 9s-9-4-9-9V8z M10 14l3 3 6-6" /> },
]

export const UNIT_AMENITIES: Amenity[] = [
  ...COMMON_AMENITIES,
  { key: 'cafetera', label: 'Cafetera', icon: <I d="M5 4h18v8a6 6 0 0 1-6 6h-6a6 6 0 0 1-6-6zM23 8h2a3 3 0 0 1 0 6h-2M9 22h10" /> },
  { key: 'agua', label: 'Agua caliente', icon: <I d="M14 3s-7 9-7 14a7 7 0 0 0 14 0c0-5-7-14-7-14z" /> },
  { key: 'ropa', label: 'Blancos premium', icon: <I d="M4 7l5-4h10l5 4-3 3v14H7V10z M9 3v4M19 3v4" /> },
  { key: 'silencio', label: 'Tranquilo', icon: <I d="M14 4v20M22 9v10M6 9v10M2 12v4M26 12v4" /> },
]

export default function AmenityGrid({
  items = COMMON_AMENITIES,
  title = 'Amenidades comunes',
  eyebrow,
}: {
  items?: Amenity[]
  title?: string
  eyebrow?: string
}) {
  return (
    <section style={{ paddingTop: 64, paddingBottom: 64 }}>
      <div className="pb-container">
        {eyebrow && <MonoLabel as="div" style={{ marginBottom: 12 }}>{eyebrow}</MonoLabel>}
        <h2 style={{ fontSize: 'clamp(32px, 4vw, 48px)', marginBottom: 40, letterSpacing: '-0.02em' }}>
          {title}
        </h2>
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 24,
          }}
        >
          {items.map((a) => (
            <li
              key={a.key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                padding: '24px 20px',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-3)',
                minHeight: 120,
              }}
            >
              <span style={{ color: 'var(--accent)' }}>{a.icon}</span>
              <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>{a.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
