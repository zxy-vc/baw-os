import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Header from '@/components/public-booking/Header'
import Footer from '@/components/public-booking/Footer'
import { getPublicBuilding } from '@/lib/public-booking/server-data'

// Fase 1 Public Listing — layout por edificio. Resuelve el edificio desde
// v_public_buildings (solo is_public_listed=true); slug desconocido → 404.
// Header/Footer reciben slug + nombre para que todos los links queden bajo
// /edificios/[buildingSlug].

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: { buildingSlug: string }
}): Promise<Metadata> {
  const building = await getPublicBuilding(params.buildingSlug)
  const name = building?.name ?? params.buildingSlug
  return {
    title: {
      default: name,
      template: `%s · ${name}`,
    },
    description: building?.description ?? undefined,
    openGraph: {
      siteName: name,
    },
  }
}

export default async function BuildingLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { buildingSlug: string }
}) {
  const building = await getPublicBuilding(params.buildingSlug)
  if (!building) notFound()

  const buildingName = building.name ?? params.buildingSlug
  const addressLines = [
    buildingName,
    [building.city, building.state].filter(Boolean).join(', '),
    building.country ?? 'México',
  ].filter((l) => l && l.length > 0) as string[]

  return (
    <>
      <Header buildingSlug={params.buildingSlug} buildingName={buildingName} />
      <main style={{ flex: 1 }}>{children}</main>
      <Footer
        buildingSlug={params.buildingSlug}
        buildingName={buildingName}
        description={building.description}
        addressLines={addressLines}
      />
    </>
  )
}
