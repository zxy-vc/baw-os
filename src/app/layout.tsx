import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import AuthGuard from '@/components/AuthGuard'

const inter = Inter({ subsets: ['latin'] })

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
    <html lang="es" className="dark">
      <body className={inter.className}>
        <AuthGuard>
          <Sidebar />
          <main className="min-h-screen md:pl-64">
            <div className="p-4 pt-16 md:p-8 md:pt-8">{children}</div>
          </main>
        </AuthGuard>
      </body>
    </html>
  )
}
