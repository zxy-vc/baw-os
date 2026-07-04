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
        allow: ['/edificios', '/baw'],
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
          '/edificios/*/reservar/',
          '/edificios/*/confirmacion/',
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  }
}
