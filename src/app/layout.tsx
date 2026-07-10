import type { Metadata, Viewport } from 'next'
import { Inter, IBM_Plex_Mono, Instrument_Serif } from 'next/font/google'
import './globals.css'
import AppShell from '@/components/AppShell'

// BaW Design typography stack — source of truth: design/baw-design/tokens/typography.css
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'BaW OS',
  description: 'Property Management System — Built by ZXY Ventures',
  icons: {
    // iOS ignora favicons SVG al crear el acceso directo de pantalla de
    // inicio: sin apple-touch-icon PNG pinta una letra genérica. Los PNG
    // salen de public/baw-mark.svg (blanco sobre #0a0a0a).
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    title: 'BaW OS',
  },
}

// Explícito para poder auditar la responsividad móvil (Next lo inyecta por
// default, pero así queda declarado y controlado).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 'cover' expone env(safe-area-inset-*) en iPhone (sin esto valen 0 y
  // todas las utilidades safe-area-* son no-op). Los elementos fijos del
  // chrome (header, hamburguesa, bottom bars, dock) ya compensan sus insets.
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${ibmPlexMono.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('baw:theme');
                  if (t !== 'light' && t !== 'dark' && t !== 'system') t = 'dark';
                  var effective = t;
                  if (t === 'system') {
                    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  var root = document.documentElement;
                  root.classList.toggle('dark', effective === 'dark');
                  root.classList.toggle('light', effective === 'light');
                  root.dataset.theme = effective;
                } catch (e) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.dataset.theme = 'dark';
                }
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} tabular-nums`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
