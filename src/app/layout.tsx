import type { Metadata } from 'next'
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
    icon: '/favicon.svg',
  },
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
