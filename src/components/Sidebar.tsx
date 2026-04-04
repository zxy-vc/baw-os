'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Building2, FileText, CreditCard, LayoutDashboard, LogOut, Menu, X, Sun, Moon,
  DollarSign, Calculator, Wrench, CalendarDays, Users, Receipt, TrendingDown,
  BarChart3, Search, Bell, Code2, MessageCircle, CheckSquare, BookOpen, AlertOctagon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'

interface NavSection {
  label: string
  items: { name: string; href: string; icon: typeof LayoutDashboard }[]
}

const navSections: NavSection[] = [
  {
    label: 'Operación',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Unidades', href: '/units', icon: Building2 },
      { name: 'Contratos', href: '/contracts', icon: FileText },
      { name: 'Contactos', href: '/contacts', icon: Users },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { name: 'Cobros', href: '/cobros', icon: Receipt },
      { name: 'Pagos', href: '/payments', icon: CreditCard },
      { name: 'Gastos', href: '/gastos', icon: TrendingDown },
      { name: 'Facturas', href: '/invoices', icon: FileText },
      { name: 'Bitácora', href: '/ledger', icon: BookOpen },
      { name: 'Reportes', href: '/reportes', icon: BarChart3 },
      { name: 'Reportes CSV', href: '/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Alertas',
    items: [
      { name: 'Notificaciones', href: '/notifications', icon: Bell },
      { name: 'Morosidad', href: '/mora', icon: AlertOctagon },
      { name: 'Tareas', href: '/tasks', icon: CheckSquare },
    ],
  },
  {
    label: 'STR',
    items: [
      { name: 'Reservaciones', href: '/reservations', icon: CalendarDays },
      { name: 'Precios', href: '/pricing', icon: DollarSign },
      { name: 'Cotizador', href: '/quotes', icon: Calculator },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { name: 'Mantenimiento', href: '/maintenance', icon: Wrench },
      { name: 'WhatsApp', href: '/whatsapp', icon: MessageCircle },
      { name: 'API Docs', href: '/api-docs', icon: Code2 },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchUnread = useCallback(async () => {
    try {
      const { count } = await supabase
        .from('webhook_events')
        .select('*', { count: 'exact', head: true })
        .eq('read', false)
      setUnreadCount(count || 0)
    } catch {}
  }, [])

  useEffect(() => {
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [fetchUnread])

  // Close drawer on route change
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-900 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400 dark:hover:text-white md:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform duration-200 ease-in-out',
          'bg-gray-900 border-r border-gray-800 dark:bg-gray-900 dark:border-gray-800',
          '[html.light_&]:bg-gray-100 [html.light_&]:border-gray-200',
          'md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800 dark:border-gray-800 [html.light_&]:border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center font-bold text-sm text-white shadow-lg shadow-indigo-500/20">
              B
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white dark:text-white [html.light_&]:text-gray-900">BaW OS</h1>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-400 [html.light_&]:bg-indigo-100 [html.light_&]:text-indigo-600">
                  v1.0
                </span>
              </div>
              <p className="text-[11px] text-gray-500 [html.light_&]:text-gray-500">ALM809P</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 text-gray-400 hover:text-white [html.light_&]:text-gray-600 [html.light_&]:hover:text-gray-900 md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pt-3">
          <Link
            href="/search"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/50 [html.light_&]:text-gray-600 [html.light_&]:hover:text-gray-900 [html.light_&]:hover:bg-gray-200 transition-colors w-full border border-gray-800 [html.light_&]:border-gray-300"
          >
            <Search className="w-4 h-4" />
            Buscar...
          </Link>
        </div>

        {/* Navigation — grouped sections */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto scrollbar-thin">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="px-3 mb-1.5 text-[11px] uppercase tracking-wider font-semibold text-gray-500 [html.light_&]:text-gray-400">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        active
                          ? 'bg-indigo-600/15 text-indigo-400 [html.light_&]:bg-indigo-50 [html.light_&]:text-indigo-700'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800/50 [html.light_&]:text-gray-600 [html.light_&]:hover:text-gray-900 [html.light_&]:hover:bg-gray-200'
                      )}
                    >
                      <item.icon className={cn(
                        'w-[18px] h-[18px]',
                        active
                          ? 'text-indigo-400 [html.light_&]:text-indigo-600'
                          : 'text-gray-500 [html.light_&]:text-gray-400'
                      )} />
                      {item.name}
                      {item.name === 'Notificaciones' && unreadCount > 0 && (
                        <span className="ml-auto bg-red-500 text-white text-[11px] font-bold rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-gray-800 [html.light_&]:border-gray-200 space-y-1">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/50 [html.light_&]:text-gray-600 [html.light_&]:hover:text-gray-900 [html.light_&]:hover:bg-gray-200 transition-colors w-full"
          >
            {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/50 [html.light_&]:text-gray-600 [html.light_&]:hover:text-gray-900 [html.light_&]:hover:bg-gray-200 transition-colors w-full"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Cerrar sesión
          </button>
          <p className="text-[11px] text-gray-600 [html.light_&]:text-gray-400 px-3">BaW Design Lab · ZXY Ventures</p>
        </div>
      </aside>
    </>
  )
}
