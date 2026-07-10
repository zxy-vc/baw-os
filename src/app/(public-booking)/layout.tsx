import type { Metadata } from 'next'
import { IBM_Plex_Mono, Outfit } from 'next/font/google'
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

// Brand Book 809 §03 — "Dos voces, roles fijos": Outfit (display/UI/cuerpo)
// e IBM Plex Mono (voz técnica: direcciones, etiquetas, datos operativos).
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-outfit-809',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono-809',
  display: 'swap',
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://baw.mx'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Estancias y rentas',
  description:
    'Departamentos amueblados con reserva en línea, operados con BaW OS.',
  icons: {
    icon: '/themes/809/favicon-809-512.png',
    apple: '/themes/809/favicon-809-512.png',
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
      className={`${outfit.variable} ${plexMono.variable}`}
      style={{
        minHeight: '100dvh',
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
