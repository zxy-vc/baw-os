import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import UnitDetailClient from './UnitDetailClient'
import {
  getPublicBuilding,
  getPublicUnit,
} from '@/lib/public-booking/server-data'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { buildingSlug: string; slug: string }
}): Promise<Metadata> {
  const [unit, building] = await Promise.all([
    getPublicUnit(params.slug),
    getPublicBuilding(params.buildingSlug),
  ])
  const name = unit?.name ?? params.slug
  const buildingName = building?.name ?? params.buildingSlug
  return {
    title: `${name} · ${buildingName}`,
    description: unit?.description ?? `Departamento amueblado en ${buildingName}.`,
    alternates: {
      canonical: `/edificios/${params.buildingSlug}/unidades/${params.slug}`,
    },
    openGraph: {
      title: `${name} · ${buildingName}`,
      description: unit?.description ?? undefined,
      images: unit?.hero_url ? [{ url: unit.hero_url }] : undefined,
    },
  }
}

export default async function UnitDetailPage({
  params,
  searchParams,
}: {
  params: { buildingSlug: string; slug: string }
  searchParams?: { from?: string; to?: string; guests?: string }
}) {
  const [unit, building] = await Promise.all([
    getPublicUnit(params.slug),
    getPublicBuilding(params.buildingSlug),
  ])
  // La unidad debe existir y pertenecer al edificio de la URL.
  if (!unit || !building || unit.building_slug !== params.buildingSlug) {
    notFound()
  }

  return (
    <UnitDetailClient
      unit={unit}
      buildingSlug={params.buildingSlug}
      buildingName={building.name ?? params.buildingSlug}
      initialFrom={searchParams?.from}
      initialTo={searchParams?.to}
      initialGuests={searchParams?.guests ? Number(searchParams.guests) : undefined}
    />
  )
}
