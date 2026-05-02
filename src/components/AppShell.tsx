'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, Bell } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import SectionTopNav from '@/components/SectionTopNav'
import AuthGuard from '@/components/AuthGuard'
import ProfileMenu from '@/components/ProfileMenu'
import ThemeProvider from '@/components/ThemeProvider'
import { ToastProvider } from '@/components/Toast'
import ContractAlertsBanner from '@/components/ContractAlertsBanner'
import { findSection } from '@/lib/navigation'

// Sprint 4 / S4-0 + S4-1.5: estos prefijos son rutas públicas con su propio
// layout (sin sidebar, sin header). El match debe ser estricto —
// `pathname === prefix` o `pathname.startsWith(prefix + '/')` — para que
// `/owners` (plural, interno) NO matchee con `/owner` (singular, público).
// `/admin` (S4-1.5) tiene su propio chrome en `admin/layout.tsx` y debe
// renderizarse fuera del AppShell de tenant.
const PUBLIC_PREFIXES = ['/portal', '/tenant', '/owner', '/conserje', '/apply', '/admin']

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
  '/buildings': 'Edificios',
  '/owners': 'Propietarios',
  '/agents': 'Agentes',
  '/onboarding': 'Configurar cuenta',
  '/onboarding/bulk': 'Importar unidades',
  '/settings': 'Configuración',
}

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  const prefix = Object.keys(PAGE_TITLES).find(
    (key) => key !== '/' && pathname.startsWith(key)
  )
  if (prefix) return PAGE_TITLES[prefix]
  // Fallback to section label for routes not in PAGE_TITLES
  const section = findSection(pathname)
  return section?.label ?? ''
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
      className="sticky top-0 z-30 pl-14 pr-4 md:pl-4 md:pr-6"
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
              backgroundColor: 'var(--baw-success-bg-soft)',
              color: 'var(--baw-success-fg)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse-soft"
              style={{ backgroundColor: 'var(--baw-success)' }}
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
                  color: 'var(--baw-on-primary)',
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
  const isPublic = PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )

  if (isPublic) {
    return <>{children}</>
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthGuard>
          <Sidebar />
          {/*
            Sprint 3 / S7: el `paddingLeft` del main lee el CSS var
            `--sidebar-effective-width` que el Sidebar mantiene actualizado.
            Cuando está pinned el contenido se empuja a 240px y queda visible.
            Cuando solo es hover, el sidebar se expande sobre el contenido
            sin reflowear (overlay) para no causar layout shift cada vez que
            el cursor lo toca.
          */}
          {/*
            Sprint 4 / S4-0 fix: en mobile NO aplicamos paddingLeft del
            sidebar — el sidebar va off-canvas con el botón hamburguesa,
            así que el contenido debe ocupar 100% del ancho. La var
            `--sidebar-effective-width` se aplica solo desde `md`.
          */}
          <main
            className="min-h-screen md:transition-[padding] md:duration-200 md:[padding-left:var(--sidebar-effective-width,0px)]"
          >
            <GlobalHeader pathname={pathname} />
            <SectionTopNav />
            <div className="p-4 md:p-6 space-y-4">
              {pathname !== '/' && <ContractAlertsBanner />}
              {children}
            </div>
          </main>
        </AuthGuard>
      </ToastProvider>
    </ThemeProvider>
  )
}
