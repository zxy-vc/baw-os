import type { MetadataRoute } from 'next'

/**
 * Sprint 5B / WS-2 — Sitemap.
 *
 * Por ahora, hardcodeamos las 12 unidades públicas del edificio Mateos 809.
 * WS-4 puede reemplazar esto con un fetch a `/api/public/v1/buildings/mateos-809/units`
 * en build time o ISR cuando estabilice el catálogo.
 *
 * Solo se incluyen rutas públicas si el feature flag está activo.
 */

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://baw.mx'

const UNIT_SLUGS = Array.from({ length: 12 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0')
  return `mateos-809-${n}`
})

export default function sitemap(): MetadataRoute.Sitemap {
  if (process.env.NEXT_PUBLIC_PUBLIC_BOOKING_ENABLED !== 'true') {
    return []
  }

  const now = new Date()

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${BASE}/mateos-809`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE}/mateos-809/unidades`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...UNIT_SLUGS.map((slug) => ({
      url: `${BASE}/mateos-809/unidades/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ]

  return entries
}
