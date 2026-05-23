import type { Metadata } from 'next'
import { EB_Garamond, Inter, JetBrains_Mono } from 'next/font/google'
import { notFound } from 'next/navigation'
import './globals.css'
import BrandActivator from '@/components/public-booking/BrandActivator'
import Header from '@/components/public-booking/Header'
import Footer from '@/components/public-booking/Footer'

// Sprint 5B / WS-2 — Layout aislado para el grupo `(public-booking)`.
// Activa `data-brand="809"` en <html>, carga fuentes editoriales y monta
// header/footer minimal. NO usa AppShell (AppShell skipea /mateos-809 via
// PUBLIC_PREFIXES). Respeta feature flag NEXT_PUBLIC_PUBLIC_BOOKING_ENABLED.

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

export const metadata: Metadata = {
  title: {
    default: 'Mateos 809 — Doce estancias. Una dirección.',
    template: '%s · Mateos 809',
  },
  description:
    'Doce departamentos amueblados de estancia corta en León, Guanajuato. Diseño minimalista, equipamiento completo, reserva en línea.',
  icons: {
    icon: '/themes/809/favicon.svg',
    apple: '/themes/809/favicon.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'es_MX',
    siteName: 'Mateos 809',
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
      <Header />
      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
    </div>
  )
}
