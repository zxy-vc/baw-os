import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import UnitDetailClient from './UnitDetailClient'
import { getUnit } from '@/lib/public-booking-client/api-client'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const res = await getUnit(params.slug).catch(() => null)
  const u = res?.data
  const name = u?.name ?? params.slug
  return {
    title: `${name} · Mateos 809`,
    description: u?.description ?? 'Departamento amueblado en Mateos 809, León.',
    alternates: {
      canonical: `/mateos-809/unidades/${params.slug}`,
    },
    openGraph: {
      title: `${name} · Mateos 809`,
      description: u?.description ?? undefined,
      images: u?.hero_url ? [{ url: u.hero_url }] : undefined,
    },
  }
}

export default async function UnitDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams?: { from?: string; to?: string; guests?: string }
}) {
  const res = await getUnit(params.slug)
  if (res.error || !res.data) {
    notFound()
  }

  return (
    <UnitDetailClient
      unit={res.data}
      initialFrom={searchParams?.from}
      initialTo={searchParams?.to}
      initialGuests={searchParams?.guests ? Number(searchParams.guests) : undefined}
    />
  )
}
