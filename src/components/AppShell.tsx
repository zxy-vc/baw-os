'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import AuthGuard from '@/components/AuthGuard'
import ThemeProvider from '@/components/ThemeProvider'
import { ToastProvider } from '@/components/Toast'

const PUBLIC_PREFIXES = ['/portal', '/tenant', '/owner']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublic = PUBLIC_PREFIXES.some(p => pathname.startsWith(p))

  if (isPublic) {
    return <>{children}</>
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthGuard>
          <Sidebar />
          <main className="min-h-screen md:pl-64">
            <div className="p-4 pt-16 md:p-8 md:pt-8">{children}</div>
          </main>
        </AuthGuard>
      </ToastProvider>
    </ThemeProvider>
  )
}
