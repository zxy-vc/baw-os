import Link from 'next/link'
import Image from 'next/image'
import type { PublicUnit } from '@/lib/public-booking/schemas'
import { formatMXN } from '@/lib/public-booking-client/format'
import MonoLabel from './MonoLabel'

// Placeholder pool (Unsplash arquitectónico). Reemplazar al recibir
// fotos del shoot real por unidad (WS-4).
const FALLBACK_IMGS = [
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&auto=format&fit=crop&q=80',
]

export default function UnitCard({
  unit,
  searchQuery = '',
  index = 0,
}: {
  unit: PublicUnit
  searchQuery?: string
  index?: number
}) {
  const href = `/mateos-809/unidades/${unit.slug}${searchQuery ? `?${searchQuery}` : ''}`
  const img = unit.hero_url || FALLBACK_IMGS[index % FALLBACK_IMGS.length]

  return (
    <Link
      href={href}
      className="pb-card pb-card-hover"
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--bg-2)', overflow: 'hidden' }}>
        <Image
          src={img}
          alt={unit.name ?? unit.slug}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 400px"
          style={{ objectFit: 'cover' }}
          loading="lazy"
          unoptimized
        />
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: '-0.02em', lineHeight: 1.15, margin: 0 }}>
            {unit.name ?? `Unidad ${unit.slug}`}
          </h3>
          <MonoLabel as="span" style={{ flexShrink: 0 }}>
            #{unit.slug.replace(/^.*-/, '')}
          </MonoLabel>
        </div>

        {unit.description && (
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--ink-2)',
              margin: 0,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {unit.description}
          </p>
        )}

        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
          <span>{unit.max_guests} huésped{unit.max_guests > 1 ? 'es' : ''}</span>
          <span aria-hidden="true">·</span>
          <span>Min {unit.min_nights} noche{unit.min_nights > 1 ? 's' : ''}</span>
        </div>

        <hr className="pb-rule" style={{ marginTop: 4 }} />

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <MonoLabel as="div" size={10}>Desde</MonoLabel>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
              {unit.base_rate_mxn ? formatMXN(unit.base_rate_mxn) : '—'}
              <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-body)', marginLeft: 4, letterSpacing: 0 }}>
                /noche
              </span>
            </div>
          </div>
          <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>
            Ver detalle →
          </span>
        </div>
      </div>
    </Link>
  )
}
