'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, Bell } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import SectionTopNav from '@/components/SectionTopNav'
import AuthGuard from '@/components/AuthGuard'
import ProfileMenu from '@/components/ProfileMenu'
import ThemeProvider from '@/components/ThemeProvider'
import { ToastProvider } from '@/components/Toast'
import ChatDock from '@/components/ChatDock'
import ContractAlertsBanner from '@/components/ContractAlertsBanner'
import BawGrid from '@/components/BawGrid'
import { findSection } from '@/lib/navigation'

// Sprint 4 / S4-0 + S4-1.5: estos prefijos son rutas públicas con su propio
// layout (sin sidebar, sin header). El match debe ser estricto —
// `pathname === prefix` o `pathname.startsWith(prefix + '/')` — para que
// `/owners` (plural, interno) NO matchee con `/owner` (singular, público).
// `/admin` (S4-1.5) tiene su propio chrome en `admin/layout.tsx` y debe
// renderizarse fuera del AppShell de tenant.
// `/conserje` (legacy redirect) y rutas multi-tenant `/<orgSlug>/conserje` viven
// fuera del AppShell. La detección de `/<orgSlug>/conserje` se hace por sufijo
// `/conserje` en el segundo segmento, abajo en el match de isPublic.
// Sprint 5B / WS-2 + Fase 1 Public Listing: `/edificios/<slug>` es la cara
// pública de booking/listing (grupo `(public-booking)`) y debe renderizar
// fuera del AppShell del tenant. `/mateos-809` redirige ahí (next.config).
const PUBLIC_PREFIXES = ['/portal', '/tenant', '/owner', '/conserje', '/apply', '/admin', '/edificios']

function isMultiTenantConserje(pathname: string): boolean {
  // Match `/baw-operations/conserje` y subrutas, sin colisionar con rutas internas.
  const parts = pathname.split('/').filter(Boolean)
  return parts.length >= 2 && parts[1] === 'conserje'
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Mission Control',
  '/units': 'Unidades',
  '/contracts': 'Contratos',
  '/cobros': 'Cobros',
  '/invoices': 'Facturas',
  '/liquidaciones': 'Liquidaciones',
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
  const router = useRouter()

  // ⌘K / Ctrl+K abren el buscador global (página /search).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        router.push('/search')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [router])

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
    // pl-16: la hamburguesa fija (left-3 + 44px) termina en 56px; con pl-14
    // el título quedaba pegado a ella — 64px deja 8px de aire.
    <header
      className="sticky top-0 z-30 pl-16 pr-4 md:pl-4 md:pr-6 safe-area-top"
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
              border: '1px solid var(--baw-success-border)',
              fontFamily: 'var(--font-mono)',
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
            onClick={() => router.push('/search')}
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors hover:bg-white/5 text-[12px]"
            style={{
              backgroundColor: 'var(--baw-surface)',
              color: 'var(--baw-muted)',
              border: '1px solid var(--baw-border)',
            }}
            title="Buscar (⌘K)"
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
  const isPublic =
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    isMultiTenantConserje(pathname)

  if (isPublic) {
    return <>{children}</>
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthGuard>
          {/*
            Sprint 6 followup: retícula BaW homologada a TODA la plataforma.
            Antes solo se veía en /login. Va `fixed` al viewport detrás de
            todo (z=0, pointer-events-none) y opacity theme-aware via CSS
            var --baw-grid-opacity (0.045 dark / 0.07 light).
          */}
          <BawGrid position="fixed" />
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
          {/*
            Sprint 6 followup: `relative` + bg transparente en `<main>` para
            que la BawGrid (fixed inset-0 z-0) sea visible a través del
            contenido. Cards, header sticky y banners conservan sus bg
            opacos en sus propias capas; solo el wrapper del shell deja
            pasar la retícula del body.
          */}
          <main
            className="relative min-h-screen transition-[padding] duration-200 sm:[padding-right:var(--chat-dock-width,0px)] md:[padding-left:var(--sidebar-effective-width,0px)]"
          >
            <GlobalHeader pathname={pathname} />
            <SectionTopNav />
            <div className="p-4 md:p-6 space-y-4">
              {pathname !== '/' && <ContractAlertsBanner />}
              {children}
            </div>
          </main>
          <ChatDock />
        </AuthGuard>
      </ToastProvider>
    </ThemeProvider>
  )
}
