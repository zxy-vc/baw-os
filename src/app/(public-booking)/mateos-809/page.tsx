import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import BuildingHero from '@/components/public-booking/BuildingHero'
import SearchBar from '@/components/public-booking/SearchBar'
import BuildingGallery from '@/components/public-booking/BuildingGallery'
import AmenityGrid, { COMMON_AMENITIES } from '@/components/public-booking/AmenityGrid'
import FAQAccordion from '@/components/public-booking/FAQAccordion'
import MonoLabel from '@/components/public-booking/MonoLabel'
import { getBuilding } from '@/lib/public-booking-client/api-client'

// Mapa cargado client-side para no incluir Leaflet en el bundle inicial.
const LocationMap = dynamic(() => import('@/components/public-booking/LocationMap'), {
  ssr: false,
  loading: () => (
    <div
      className="pb-skeleton"
      style={{ width: '100%', height: 420, borderRadius: 'var(--r-3)' }}
    />
  ),
})

export const metadata: Metadata = {
  title: 'Mateos 809 — Doce estancias. Una dirección.',
  description:
    'Doce departamentos amueblados de estancia corta en León, Guanajuato. Reserva en línea sin intermediarios.',
  openGraph: {
    title: 'Mateos 809 — Doce estancias. Una dirección.',
    description:
      'Departamentos amueblados de estancia corta en León, Guanajuato.',
    type: 'website',
    url: 'https://baw.mx/mateos-809',
  },
  alternates: {
    canonical: '/mateos-809',
  },
}

export const revalidate = 300

export default async function LandingPage() {
  // Llamada server-side. Si falla, seguimos con valores por defecto.
  const buildingRes = await getBuilding('mateos-809').catch(() => ({
    data: null,
    error: { status: 0, message: 'unavailable' },
  }))
  const building = buildingRes.data

  const lat = building?.location_lat ?? 21.125
  const lng = building?.location_lng ?? -101.6863

  return (
    <>
      <BuildingHero
        heroUrl={building?.hero_url ?? undefined}
        unitsCount={12}
        basePriceMxn={1800}
      />

      {/* Search bar */}
      <section style={{ marginTop: -32, marginBottom: 64 }}>
        <div className="pb-container">
          <div style={{ maxWidth: 1080, margin: '0 auto' }}>
            <SearchBar variant="card" />
          </div>
        </div>
      </section>

      <BuildingGallery />

      <AmenityGrid
        eyebrow="Lo que encuentras"
        title="Amenidades comunes del edificio"
        items={COMMON_AMENITIES}
      />

      {/* Ubicación */}
      <section id="ubicacion" style={{ paddingTop: 64, paddingBottom: 64 }}>
        <div className="pb-container">
          <div style={{ display: 'grid', gap: 32, gridTemplateColumns: '1fr' }}>
            <div style={{ maxWidth: 720 }}>
              <MonoLabel as="div" style={{ marginBottom: 12 }}>Ubicación</MonoLabel>
              <h2 style={{ fontSize: 'clamp(32px, 4vw, 48px)', letterSpacing: '-0.02em', marginBottom: 16 }}>
                En el corazón de León.
              </h2>
              <p style={{ fontSize: 17, lineHeight: 1.65, color: 'var(--ink-2)', maxWidth: 560, marginBottom: 24 }}>
                A 8 minutos del centro histórico, 12 minutos del Poliforum
                y 25 minutos del aeropuerto. Restaurantes, café y panaderías
                a caminar.
              </p>
              <address style={{ fontStyle: 'normal', fontSize: 14, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
                MATEOS 809 · COLONIA CENTRO · LEÓN, GTO
              </address>
            </div>
            <LocationMap lat={lat} lng={lng} label="Mateos 809" />
          </div>
        </div>
      </section>

      <FAQAccordion />
    </>
  )
}
