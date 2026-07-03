import type { Metadata } from 'next'
import { Suspense } from 'react'
import UnitsClient from './UnitsClient'
import { getPublicBuilding } from '@/lib/public-booking/server-data'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { buildingSlug: string }
}): Promise<Metadata> {
  const building = await getPublicBuilding(params.buildingSlug)
  const name = building?.name ?? params.buildingSlug
  return {
    title: `Unidades disponibles · ${name}`,
    description:
      building?.description ??
      `Departamentos amueblados en ${name}. Filtra por fechas y huéspedes.`,
    alternates: { canonical: `/edificios/${params.buildingSlug}/unidades` },
  }
}

export default function UnidadesPage({
  params,
  searchParams,
}: {
  params: { buildingSlug: string }
  searchParams?: { from?: string; to?: string; guests?: string }
}) {
  const from = searchParams?.from
  const to = searchParams?.to
  const guests = searchParams?.guests ? Number(searchParams.guests) : undefined

  return (
    <section style={{ paddingTop: 48, paddingBottom: 96 }}>
      <div className="pb-container">
        <header style={{ marginBottom: 32 }}>
          <h1
            style={{
              fontSize: 'clamp(36px, 5vw, 56px)',
              letterSpacing: '-0.025em',
              marginBottom: 12,
            }}
          >
            Unidades
          </h1>
          <p style={{ fontSize: 17, color: 'var(--ink-2)', maxWidth: 640 }}>
            Departamentos amueblados con tarifas claras, sin cargos ocultos.
          </p>
        </header>

        <Suspense fallback={<UnitsSkeleton />}>
          <UnitsClient
            buildingSlug={params.buildingSlug}
            initialFrom={from}
            initialTo={to}
            initialGuests={guests}
          />
        </Suspense>
      </div>
    </section>
  )
}

function UnitsSkeleton() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 24,
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="pb-card"
          style={{ overflow: 'hidden' }}
        >
          <div className="pb-skeleton" style={{ aspectRatio: '4 / 3', borderRadius: 0 }} />
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="pb-skeleton" style={{ height: 22, width: '70%' }} />
            <div className="pb-skeleton" style={{ height: 14, width: '90%' }} />
            <div className="pb-skeleton" style={{ height: 14, width: '50%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
