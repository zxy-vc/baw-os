import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { notFound } from 'next/navigation'
import BuildingHero from '@/components/public-booking/BuildingHero'
import SearchBar from '@/components/public-booking/SearchBar'
import BuildingGallery from '@/components/public-booking/BuildingGallery'
import AmenityGrid, { COMMON_AMENITIES } from '@/components/public-booking/AmenityGrid'
import FAQAccordion, { type FAQItem } from '@/components/public-booking/FAQAccordion'
import MonoLabel from '@/components/public-booking/MonoLabel'
import {
  getPublicBuilding,
  listPublicUnits,
} from '@/lib/public-booking/server-data'
import { buildingBaseUrl } from '@/lib/public-booking/domains'

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

// Copy editorial por edificio (diseño Claude Design · julio 2026). El
// fallback genérico usa los campos públicos de la DB; este override existe
// hasta que estos textos vivan como campos editables (PR C, Fase 1.5).
interface BuildingCopy {
  kicker: string
  title: string
  titleAccent: string
  intro: string
  locationLine: string
  /** Trayectos a puntos de interés (estáticos hasta integrar rutas de Maps) */
  pois: { label: string; time: string }[]
}

const BUILDING_COPY: Record<string, BuildingCopy> = {
  'mateos-809': {
    kicker: 'Residencial boutique · León, GTO',
    title: 'Dieciséis estancias.',
    titleAccent: 'Una dirección.',
    intro:
      'Departamentos amueblados sobre Adolfo López Mateos 809, pensados para estancias de unos días o unas semanas. Equipados, tranquilos, listos para llegar y vivir.',
    locationLine:
      'Adolfo López Mateos 809 Pte. Restaurantes, café y panaderías a caminar.',
    pois: [
      { label: 'Centro histórico', time: '8 min' },
      { label: 'Poliforum', time: '12 min' },
      { label: 'Aeropuerto BJX', time: '25 min' },
    ],
  },
}

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: { buildingSlug: string }
}): Promise<Metadata> {
  const building = await getPublicBuilding(params.buildingSlug)
  const name = building?.name ?? params.buildingSlug
  const base = buildingBaseUrl(params.buildingSlug)
  return {
    title: name,
    description: building?.description ?? undefined,
    alternates: { canonical: base },
    openGraph: {
      title: name,
      description: building?.description ?? undefined,
      type: 'website',
      url: base,
    },
  }
}

export default async function LandingPage({
  params,
}: {
  params: { buildingSlug: string }
}) {
  const slug = params.buildingSlug
  const [building, units] = await Promise.all([
    getPublicBuilding(slug),
    listPublicUnits(slug),
  ])
  if (!building) notFound()

  const buildingName = building.name ?? slug
  const copy = BUILDING_COPY[slug]

  const lat = building.location_lat ?? 21.125
  const lng = building.location_lng ?? -101.6863

  const nightlyRates = units
    .filter((u) => u.rent_type === 'STR' && u.base_rate_mxn)
    .map((u) => u.base_rate_mxn as number)
  const minNightly = nightlyRates.length ? Math.min(...nightlyRates) : null

  const locationLabel = [building.city, building.state, building.country ?? 'México']
    .filter(Boolean)
    .join(' · ')

  const gallery = Array.isArray(building.gallery)
    ? (building.gallery as string[]).filter((g) => typeof g === 'string')
    : []

  const faq = Array.isArray(building.faq)
    ? (building.faq as FAQItem[]).filter((f) => f && typeof f.q === 'string')
    : []

  return (
    <>
      <BuildingHero
        heroUrl={building.hero_url ?? undefined}
        unitsCount={units.length}
        basePriceMxn={minNightly}
        buildingName={buildingName}
        locationLabel={copy?.kicker ?? locationLabel ?? null}
        title={copy?.title ?? buildingName}
        titleAccent={copy?.titleAccent ?? null}
        intro={copy?.intro ?? building.description}
      />

      {/* Search bar + endorsement BaW (convivencia de marcas, brand book) */}
      <section style={{ marginTop: -32, marginBottom: 64 }}>
        <div className="pb-container">
          <div style={{ maxWidth: 1080, margin: '0 auto' }}>
            <SearchBar
              variant="card"
              buildingSlug={slug}
              locationLabel={[buildingName, building.city].filter(Boolean).join(', ')}
            />
            <p
              style={{
                marginTop: 12,
                textAlign: 'right',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
              }}
            >
              Reserva operada por <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>BaW</strong>
            </p>
          </div>
        </div>
      </section>

      <BuildingGallery
        buildingName={buildingName}
        images={gallery.length ? gallery : undefined}
        {...(copy
          ? {}
          : {
              title: buildingName,
              body: building.description,
            })}
      />

      <AmenityGrid
        eyebrow="Lo que encuentras"
        title="Amenidades del edificio"
        items={COMMON_AMENITIES}
      />

      {/* Ubicación + trayectos */}
      <section id="ubicacion" style={{ paddingTop: 64, paddingBottom: 64 }}>
        <div className="pb-container">
          <div style={{ display: 'grid', gap: 32, gridTemplateColumns: '1fr' }}>
            <div style={{ maxWidth: 720 }}>
              <MonoLabel as="div" style={{ marginBottom: 12 }}>Ubicación</MonoLabel>
              <h2 style={{ fontSize: 'clamp(32px, 4vw, 48px)', marginBottom: 16 }}>
                {building.city ? `En el corazón de ${building.city}` : 'Ubicación'}
                <span className="t-dot" aria-hidden="true">.</span>
              </h2>
              {copy?.locationLine && (
                <p style={{ fontSize: 17, lineHeight: 1.65, color: 'var(--ink-2)', maxWidth: 560, marginBottom: 24 }}>
                  {copy.locationLine}
                </p>
              )}
              {copy?.pois && copy.pois.length > 0 && (
                <dl
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '16px 40px',
                    margin: '0 0 24px',
                    paddingTop: 20,
                    borderTop: '1px solid var(--line)',
                    maxWidth: 560,
                  }}
                >
                  {copy.pois.map((poi) => (
                    <div key={poi.label}>
                      <dt style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 2 }}>
                        {poi.label}
                      </dt>
                      <dd
                        style={{
                          margin: 0,
                          fontFamily: 'var(--font-display)',
                          fontWeight: 800,
                          fontSize: 22,
                          letterSpacing: '-0.04em',
                          color: 'var(--ink)',
                        }}
                      >
                        {poi.time}
                        <span className="t-dot" aria-hidden="true">.</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <address style={{ fontStyle: 'normal', fontSize: 13, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                {[buildingName, building.city, building.state]
                  .filter(Boolean)
                  .join(' · ')}
              </address>
            </div>
            <LocationMap lat={lat} lng={lng} label={buildingName} />
          </div>
        </div>
      </section>

      <FAQAccordion items={faq.length ? faq : undefined} />
    </>
  )
}
