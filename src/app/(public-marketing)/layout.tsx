import type { Metadata } from 'next'
import './marketing.css'

// Fase 1.5 PR B — Landing informativa de BaW OS, servida en baw.mx (mapeo
// por Host en src/middleware.ts) y accesible como /baw en cualquier dominio.
// Renderiza fuera del AppShell (prefijo '/baw' en PUBLIC_PREFIXES). Las
// fuentes vienen del layout raíz (Inter / Plex Mono / Instrument Serif).

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://baw-os.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'BaW OS — El sistema operativo de administración inmobiliaria',
  description:
    'Reservas, contratos, cobranza y mantenimiento en un solo lugar — agentes de IA proponen, un humano aprueba. Nació operando un edificio real.',
  alternates: { canonical: 'https://baw.mx' },
  openGraph: {
    type: 'website',
    locale: 'es_MX',
    siteName: 'BaW OS',
    title: 'BaW OS — El sistema operativo de administración inmobiliaria',
    description:
      'Property management AI-native, en producción. Nació operando un edificio real.',
    url: 'https://baw.mx',
  },
  robots: { index: true, follow: true },
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div data-brand="baw-mkt" style={{ minHeight: '100vh' }}>
      {children}
    </div>
  )
}
