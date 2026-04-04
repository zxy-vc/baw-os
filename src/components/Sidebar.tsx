'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Building2, FileText, CreditCard, LayoutDashboard, LogOut, Menu, X, Sun, Moon, DollarSign, Calculator, Wrench, CalendarDays, Users, Receipt, TrendingDown, BarChart3, Search, Bell, Code2, MessageSquare, MessageCircle, ClipboardList, CheckSquare, BookOpen, AlertOctagon, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Notificaciones', href: '/notifications', icon: Bell },
  { name: 'Unidades', href: '/units', icon: Building2 },
  { name: 'Contratos', href: '/contracts', icon: FileText },
  { name: 'Cobros', href: '/cobros', icon: Receipt },
  { name: 'Facturas', href: '/invoices', icon: FileText },
  { name: 'Morosidad', href: '/mora', icon: AlertOctagon },
  { name: 'Bitácora', href: '/ledger', icon: BookOpen },
  { name: 'Gastos', href: '/gastos', icon: TrendingDown },
  { name: 'Reportes', href: '/reportes', icon: BarChart3 },
  { name: 'Pagos', href: '/payments', icon: CreditCard },
  { name: 'Reportes CSV', href: '/reports', icon: BarChart3 },
  { name: 'Mantenimiento', href: '/maintenance', icon: Wrench },
  { name: 'Precios', href: '/pricing', icon: DollarSign },
  { name: 'Cotizador', href: '/quotes', icon: Calculator },
  { name: 'Reservaciones', href: '/reservations', icon: CalendarDays },
  { name: 'API Docs', href: '/api-docs', icon: Code2 },
  { name: 'Contactos', href: '/contacts', icon: Users },
  { name: 'Tareas', href: '/tasks', icon: CheckSquare },
  { name: 'WhatsApp', href: '/whatsapp', icon: MessageCircle },
  { name: 'Audit Log', href: '/audit', icon: ClipboardList },
  { name: 'Configuración', href: '/onboarding', icon: Settings2 },
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

      {/* Sidebar — always dark for contrast */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform duration-200 ease-in-out',
          'bg-gray-900 border-r border-gray-800 dark:bg-gray-900 dark:border-gray-800',
          'light:bg-gray-100 light:border-gray-200',
          '[html.light_&]:bg-gray-100 [html.light_&]:border-gray-200',
          'md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800 dark:border-gray-800 [html.light_&]:border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center font-bold text-sm text-black">
              B
            </div>
            <div>
              <h1 className="text-base font-semibold text-white dark:text-white [html.light_&]:text-gray-900">BaW OS</h1>
              <p className="text-[11px] text-gray-500 [html.light_&]:text-gray-500">v1.0.0 · ALM809P</p>
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

        <div className="px-3 pt-3">
          <Link
            href="/search"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/50 [html.light_&]:text-gray-600 [html.light_&]:hover:text-gray-900 [html.light_&]:hover:bg-gray-200 transition-colors w-full border border-gray-800 [html.light_&]:border-gray-300"
          >
            <Search className="w-4 h-4" />
            Buscar...
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-gray-800 text-white [html.light_&]:bg-gray-100 [html.light_&]:text-gray-700'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50 [html.light_&]:text-gray-600 [html.light_&]:hover:text-gray-900 [html.light_&]:hover:bg-gray-200'
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.name}
                {item.name === 'Notificaciones' && unreadCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[11px] font-bold rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 py-3 border-t border-gray-800 [html.light_&]:border-gray-200 space-y-2">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/50 [html.light_&]:text-gray-600 [html.light_&]:hover:text-gray-900 [html.light_&]:hover:bg-gray-200 transition-colors w-full"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/50 [html.light_&]:text-gray-600 [html.light_&]:hover:text-gray-900 [html.light_&]:hover:bg-gray-200 transition-colors w-full"
          >
            <LogOut className="w-5 h-5" />
            Cerrar sesión
          </button>
          <p className="text-[11px] text-gray-600 [html.light_&]:text-gray-400 px-3">BaW Design Lab · ZXY Ventures</p>
        </div>
      </aside>
    </>
  )
}
