import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://baw.mx'

export default function robots(): MetadataRoute.Robots {
  const enabled = process.env.NEXT_PUBLIC_PUBLIC_BOOKING_ENABLED === 'true'

  if (!enabled) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/mateos-809', '/mateos-809/unidades'],
        disallow: [
          '/api/',
          '/admin/',
          '/portal/',
          '/tenant/',
          '/owner/',
          '/conserje/',
          '/apply/',
          '/login',
          '/onboarding/',
          '/me',
          '/mateos-809/reservar/',
          '/mateos-809/confirmacion/',
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  }
}
