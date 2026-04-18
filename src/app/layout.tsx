import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import AppShell from '@/components/AppShell'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'BaW OS',
  description: 'Property Management System — BaW Design Lab · ZXY Ventures',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={`dark ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var t = localStorage.getItem('baw-theme');
                if (t === 'light') document.documentElement.classList.remove('dark');
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
