import type { MetadataRoute } from 'next'
import {
  listPublicBuildings,
  listPublicUnits,
} from '@/lib/public-booking/server-data'

/**
 * Fase 1 Public Listing — Sitemap dinámico.
 *
 * Lee edificios y unidades públicas de las vistas `v_public_*` (fuente de
 * verdad: flags is_public_listed / is_publicly_bookable). Solo emite rutas
 * públicas si el feature flag está activo. Si la DB no responde, devuelve
 * las rutas raíz de edificios que sí conocemos (vacío en el peor caso).
 */

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://baw.mx'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (process.env.NEXT_PUBLIC_PUBLIC_BOOKING_ENABLED !== 'true') {
    return []
  }

  const now = new Date()
  const buildings = await listPublicBuildings()

  const entries: MetadataRoute.Sitemap = []

  for (const building of buildings) {
    if (!building.slug) continue
    entries.push(
      {
        url: `${BASE}/edificios/${building.slug}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 1,
      },
      {
        url: `${BASE}/edificios/${building.slug}/unidades`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.9,
      },
    )

    const units = await listPublicUnits(building.slug)
    for (const unit of units) {
      if (!unit.slug) continue
      entries.push({
        url: `${BASE}/edificios/${building.slug}/unidades/${unit.slug}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    }
  }

  return entries
}
