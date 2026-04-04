'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import AuthGuard from '@/components/AuthGuard'
import ThemeProvider from '@/components/ThemeProvider'
import { ToastProvider } from '@/components/Toast'

const PUBLIC_PREFIXES = ['/portal', '/tenant', '/owner', '/conserje', '/onboarding']

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/units': 'Unidades',
  '/contracts': 'Contratos',
  '/cobros': 'Cobros',
  '/payments': 'Pagos',
  '/invoices': 'Facturas',
  '/mora': 'Morosidad',
  '/ledger': 'Bitácora',
  '/gastos': 'Gastos',
  '/reportes': 'Reportes',
  '/reports': 'Reportes CSV',
  '/maintenance': 'Mantenimiento',
  '/pricing': 'Precios',
  '/quotes': 'Cotizador',
  '/reservations': 'Reservaciones',
  '/contacts': 'Contactos',
  '/tasks': 'Tareas',
  '/whatsapp': 'WhatsApp',
  '/audit': 'Audit Log',
  '/notifications': 'Notificaciones',
  '/search': 'Buscar',
  '/api-docs': 'API Docs',
}

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  // Match prefix for nested routes like /contracts/[id]
  const prefix = Object.keys(PAGE_TITLES).find(
    (key) => key !== '/' && pathname.startsWith(key)
  )
  return prefix ? PAGE_TITLES[prefix] : ''
}

function todayFormatted(): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date())
}

function GlobalHeader({ pathname }: { pathname: string }) {
  const title = getPageTitle(pathname)

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 md:px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-xs font-medium">
            ALM809P
          </span>
          {title && (
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400">
            v1.0.0
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
            {todayFormatted()}
          </span>
        </div>
      </div>
    </header>
  )
}

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
            <GlobalHeader pathname={pathname} />
            <div className="p-4 pt-6 md:p-8 md:pt-6">{children}</div>
          </main>
        </AuthGuard>
      </ToastProvider>
    </ThemeProvider>
  )
}
