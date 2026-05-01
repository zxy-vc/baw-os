import type { Metadata } from 'next'
import './globals.css'
import AppShell from '@/components/AppShell'

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
    <html lang="es" suppressHydrationWarning>
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
      <body className="tabular-nums">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
