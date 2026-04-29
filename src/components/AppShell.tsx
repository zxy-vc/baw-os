'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, Bell } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import AuthGuard from '@/components/AuthGuard'
import ProfileMenu from '@/components/ProfileMenu'
import ThemeProvider from '@/components/ThemeProvider'
import { ToastProvider } from '@/components/Toast'
import ContractAlertsBanner from '@/components/ContractAlertsBanner'

const PUBLIC_PREFIXES = ['/portal', '/tenant', '/owner', '/conserje', '/onboarding', '/apply']

const PAGE_TITLES: Record<string, string> = {
  '/': 'Mission Control',
  '/units': 'Unidades',
  '/contracts': 'Contratos',
  '/cobros': 'Cobros',
  '/payments/new': 'Registrar pago',
  '/invoices': 'Facturas',
  '/mora': 'Morosidad',
  '/ledger': 'Bitácora',
  '/gastos': 'Gastos',
  '/reportes': 'Reportes',
  '/maintenance': 'Mantenimiento',
  '/housekeeping': 'Housekeeping',
  '/pricing': 'Precios',
  '/quotes': 'Cotizador',
  '/reservations': 'Reservaciones',
  '/contacts': 'Contactos',
  '/tasks': 'Operaciones',
  '/whatsapp': 'WhatsApp',
  '/audit': 'Timeline',
  '/notifications': 'Notificaciones',
  '/search': 'Buscar',
  '/api-docs': 'API Docs',
  '/applications': 'Expedientes',
  '/settings': 'Configuración',
}

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  const prefix = Object.keys(PAGE_TITLES).find(
    (key) => key !== '/' && pathname.startsWith(key)
  )
  return prefix ? PAGE_TITLES[prefix] : ''
}

function GlobalHeader({ pathname }: { pathname: string }) {
  const title = getPageTitle(pathname)
  const [unread, setUnread] = useState(0)

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count')
      if (!res.ok) return
      const data = await res.json()
      setUnread(typeof data?.count === 'number' ? data.count : 0)
    } catch {}
  }, [])

  useEffect(() => {
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [fetchUnread])

  return (
    <header
      className="sticky top-0 z-30 pl-16 pr-4 md:pl-6 md:pr-6"
      style={{
        backgroundColor: 'var(--baw-bg)',
        borderBottom: '1px solid var(--baw-border)',
      }}
    >
      <div className="flex items-center justify-between h-14">
        <div className="flex items-center gap-3 min-w-0">
          {title && (
            <h1
              className="text-[15px] font-semibold truncate"
              style={{ color: 'var(--baw-text)' }}
            >
              {title}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Live indicator */}
          <span
            className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium"
            style={{
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              color: '#4ADE80',
              border: '1px solid rgba(34, 197, 94, 0.25)',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse-soft"
              style={{ backgroundColor: '#22C55E' }}
            />
            Live
          </span>

          {/* Search ⌘K */}
          <button
            type="button"
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] transition-colors"
            style={{
              backgroundColor: 'var(--baw-surface)',
              color: 'var(--baw-muted)',
              border: '1px solid var(--baw-border)',
            }}
            title="Buscar"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Buscar</span>
            <kbd
              className="hidden sm:inline-flex items-center px-1 py-0 rounded text-[10px] font-mono"
              style={{
                backgroundColor: 'var(--baw-elevated)',
                color: 'var(--baw-muted)',
                border: '1px solid var(--baw-border)',
              }}
            >
              ⌘K
            </kbd>
          </button>

          {/* Notification bell */}
          <Link
            href="/notifications"
            className="relative inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors hover:bg-white/5"
            style={{ color: 'var(--baw-muted)' }}
            title="Notificaciones"
          >
            <Bell className="w-4 h-4" />
            {unread > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full px-1 text-[10px] font-semibold leading-none flex items-center justify-center tabular-nums"
                style={{
                  backgroundColor: 'var(--baw-danger)',
                  color: '#FFFFFF',
                }}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>

          {/* User avatar / profile menu (sprint S4) */}
          <ProfileMenu />
        </div>
      </div>
    </header>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))

  if (isPublic) {
    return <>{children}</>
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthGuard>
          <Sidebar />
          <main
            className="min-h-screen transition-[padding] duration-200"
            style={{ paddingLeft: 0 }}
          >
            <div className="md:pl-14">
              <GlobalHeader pathname={pathname} />
              <div className="p-4 md:p-6 space-y-4">
                {pathname !== '/' && <ContractAlertsBanner />}
                {children}
              </div>
            </div>
          </main>
        </AuthGuard>
      </ToastProvider>
    </ThemeProvider>
  )
}
