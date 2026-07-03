import type { Metadata } from 'next'
import { EB_Garamond, Inter, JetBrains_Mono } from 'next/font/google'
import { notFound } from 'next/navigation'
import './globals.css'
import BrandActivator from '@/components/public-booking/BrandActivator'

// Sprint 5B / WS-2 + Fase 1 Public Listing — Layout aislado del grupo
// `(public-booking)`. Activa `data-brand="809"` en <html> (tema editorial
// compartido por todos los edificios hasta que exista theming por edificio)
// y carga fuentes. Header/Footer viven en `edificios/[buildingSlug]/layout.tsx`
// porque necesitan slug y nombre del edificio. NO usa AppShell (AppShell
// skipea `/edificios` via PUBLIC_PREFIXES). Respeta el feature flag
// NEXT_PUBLIC_PUBLIC_BOOKING_ENABLED.

const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-eb-garamond',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-inter-809',
  display: 'swap',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://baw.mx'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Estancias y rentas',
  description:
    'Departamentos amueblados con reserva en línea, operados con BaW OS.',
  icons: {
    icon: '/themes/809/favicon.svg',
    apple: '/themes/809/favicon.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'es_MX',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function PublicBookingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Feature flag — si está apagado, 404 en todo el grupo.
  if (process.env.NEXT_PUBLIC_PUBLIC_BOOKING_ENABLED !== 'true') {
    notFound()
  }

  return (
    <div
      data-pb-root
      className={`${ebGaramond.variable} ${inter.variable} ${jetBrainsMono.variable}`}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <BrandActivator />
      {children}
    </div>
  )
}
