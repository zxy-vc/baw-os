/**
 * Fase 1.5 PR B — Dominios propios por edificio (ADR-017 §2: cada edificio
 * tiene identidad propia; su dominio es parte de esa identidad).
 *
 * El mapa vive en código por ahora (un edificio). Cuando el contenido público
 * sea editable por edificio (PR C), migra a `buildings.custom_domain` en DB.
 *
 * Cómo funciona:
 * - `DOMAIN_BUILDINGS`: host → slug. El middleware usa esto para servir la
 *   landing del edificio en la RAÍZ del dominio (809.mx/unidades en vez de
 *   baw-os.vercel.app/edificios/mateos-809/unidades).
 * - `buildingBaseUrl(slug)`: URL pública canónica del edificio. Con dominio
 *   propio → https://809.mx; sin dominio → NEXT_PUBLIC_SITE_URL/edificios/slug.
 *   La usan canonicals SEO, sitemap y las URLs de retorno de Stripe.
 */

export const DOMAIN_BUILDINGS: Record<string, string> = {
  '809.mx': 'mateos-809',
  'www.809.mx': 'mateos-809',
}

export const BUILDING_DOMAINS: Record<string, string> = {
  'mateos-809': '809.mx',
}

export function buildingBaseUrl(slug: string): string {
  const domain = BUILDING_DOMAINS[slug]
  if (domain) return `https://${domain}`
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://baw-os.vercel.app'
  return `${site}/edificios/${slug}`
}

/** Normaliza el header Host (sin puerto, minúsculas). */
export function normalizeHost(host: string | null): string {
  return (host ?? '').toLowerCase().replace(/:\d+$/, '')
}
