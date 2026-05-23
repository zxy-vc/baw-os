'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PublicUnit, Quote } from '@/lib/public-booking/schemas'
import {
  getUnitAvailability,
  postQuote,
  type AvailabilityRange,
} from '@/lib/public-booking-client/api-client'
import {
  diffNights,
  formatGuests,
  plusDaysISO,
  todayISO,
  formatDate,
} from '@/lib/public-booking-client/format'
import UnitGallery from '@/components/public-booking/UnitGallery'
import BookingCalendar from '@/components/public-booking/BookingCalendar'
import GuestSelector from '@/components/public-booking/GuestSelector'
import PriceBreakdown from '@/components/public-booking/PriceBreakdown'
import MonoLabel from '@/components/public-booking/MonoLabel'
import AmenityGrid, { UNIT_AMENITIES } from '@/components/public-booking/AmenityGrid'

// Placeholders Unsplash arquitectónicos minimalistas.
// Reemplazar al recibir el shoot real por unidad (WS-4).
const FALLBACK_GALLERY = [
  'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=1600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1600&auto=format&fit=crop&q=80',
]

export default function UnitDetailClient({
  unit,
  initialFrom,
  initialTo,
  initialGuests,
}: {
  unit: PublicUnit
  initialFrom?: string
  initialTo?: string
  initialGuests?: number
}) {
  const router = useRouter()
  const [from, setFrom] = useState(initialFrom ?? plusDaysISO(7))
  const [to, setTo] = useState(initialTo ?? plusDaysISO(9))
  const [guests, setGuests] = useState(initialGuests ?? Math.min(2, unit.max_guests))
  const [blocked, setBlocked] = useState<AvailabilityRange[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  // Gallery
  const heroImages = useMemo(() => {
    if (unit.hero_url) {
      return [unit.hero_url, ...FALLBACK_GALLERY.slice(0, 5)]
    }
    return FALLBACK_GALLERY
  }, [unit.hero_url])

  // Fetch availability (today → +90d)
  useEffect(() => {
    let cancelled = false
    const today = todayISO()
    const end = plusDaysISO(90)
    getUnitAvailability(unit.slug, today, end).then((res) => {
      if (cancelled) return
      if (res.data?.blocked) setBlocked(res.data.blocked)
    })
    return () => {
      cancelled = true
    }
  }, [unit.slug])

  // Quote refresh (debounce 300ms)
  useEffect(() => {
    if (!from || !to) return
    const nights = diffNights(from, to)
    if (nights <= 0) {
      setQuote(null)
      return
    }
    let cancelled = false
    setQuoteLoading(true)
    setQuoteError(null)
    const handle = setTimeout(async () => {
      const res = await postQuote({ unit_slug: unit.slug, from, to, guests })
      if (cancelled) return
      if (res.error) {
        setQuote(null)
        setQuoteError(res.error.message)
      } else {
        setQuote(res.data)
      }
      setQuoteLoading(false)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [unit.slug, from, to, guests])

  const nights = diffNights(from, to)
  const tooFew = nights < unit.min_nights
  const canBook = nights > 0 && !tooFew && quote !== null

  const goReserve = () => {
    const q = new URLSearchParams({ from, to, guests: String(guests) })
    router.push(`/mateos-809/reservar/${unit.slug}?${q.toString()}`)
  }

  return (
    <article style={{ paddingTop: 32, paddingBottom: 96 }}>
      <div className="pb-container">
        <header style={{ marginBottom: 32 }}>
          <MonoLabel as="div" style={{ marginBottom: 8 }}>
            Mateos 809 · Unidad {unit.slug}
          </MonoLabel>
          <h1 style={{ fontSize: 'clamp(36px, 5vw, 64px)', letterSpacing: '-0.025em', lineHeight: 1.05, marginBottom: 12 }}>
            {unit.name ?? `Unidad ${unit.slug}`}
          </h1>
        </header>

        <div className="pb-detail-grid">
          {/* Left column: gallery + content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
            <UnitGallery images={heroImages} alt={unit.name ?? unit.slug} />

            {/* Specs */}
            <section>
              <h2 style={{ fontSize: 24, marginBottom: 16, letterSpacing: '-0.01em' }}>Detalles</h2>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 16,
                  margin: 0,
                }}
              >
                <Spec label="Huéspedes" value={`${unit.max_guests} máx`} />
                <Spec label="Min noches" value={`${unit.min_nights}`} />
                <Spec label="Categoría" value="Amueblada" />
                <Spec label="Limpieza" value="Incluida" />
              </dl>
            </section>

            {/* Description */}
            {unit.description && (
              <section>
                <h2 style={{ fontSize: 24, marginBottom: 16, letterSpacing: '-0.01em' }}>Sobre el espacio</h2>
                <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--ink-2)', maxWidth: 680 }}>
                  {unit.description}
                </p>
              </section>
            )}

            <AmenityGrid eyebrow="Equipamiento" title="Amenidades de la unidad" items={UNIT_AMENITIES} />
          </div>

          {/* Right column: booking widget (sticky) */}
          <aside className="pb-detail-aside">
            <div
              style={{
                padding: 24,
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-4)',
                boxShadow: 'var(--shadow-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
              }}
            >
              <div>
                <MonoLabel as="div" style={{ marginBottom: 6 }}>Disponibilidad</MonoLabel>
                <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                  Días en gris no disponibles.
                </p>
              </div>

              <BookingCalendar
                from={from}
                to={to}
                blocked={blocked}
                onChange={(range) => {
                  if (range.from) setFrom(range.from)
                  if (range.to) setTo(range.to)
                }}
              />

              <GuestSelector value={guests} onChange={setGuests} max={unit.max_guests} />

              {tooFew && (
                <div
                  role="alert"
                  style={{
                    padding: 12,
                    background: 'rgba(156, 115, 33, 0.08)',
                    border: '1px solid rgba(156, 115, 33, 0.2)',
                    borderRadius: 'var(--r-2)',
                    fontSize: 13,
                    color: 'var(--warning)',
                  }}
                >
                  Mínimo {unit.min_nights} noches para esta unidad.
                </div>
              )}

              <PriceBreakdown quote={quote} loading={quoteLoading} error={quoteError} />

              <button
                type="button"
                className="pb-btn pb-btn-primary"
                onClick={goReserve}
                disabled={!canBook}
                style={{ width: '100%', padding: '14px 24px', fontSize: 15 }}
              >
                Reservar {nights > 0 && !tooFew ? `· ${formatDate(from, 'short')} – ${formatDate(to, 'short')}` : ''}
              </button>
            </div>
          </aside>
        </div>

        <style>{`
          .pb-detail-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 40px;
          }
          .pb-detail-aside { position: relative; }
          @media (min-width: 1024px) {
            .pb-detail-grid {
              grid-template-columns: minmax(0, 1.6fr) minmax(360px, 1fr);
              gap: 64px;
              align-items: start;
            }
            .pb-detail-aside {
              position: sticky;
              top: 96px;
            }
          }
        `}</style>
      </div>
    </article>
  )
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '16px 20px',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-3)',
      }}
    >
      <MonoLabel as="dt" size={10}>{label}</MonoLabel>
      <dd
        style={{
          margin: '6px 0 0',
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          letterSpacing: '-0.01em',
          color: 'var(--ink)',
        }}
      >
        {value}
      </dd>
    </div>
  )
}
