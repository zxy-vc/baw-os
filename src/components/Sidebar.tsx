'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Building2,
  FileText,
  LayoutDashboard,
  Menu,
  X,
  Wrench,
  CalendarDays,
  Receipt,
  ListTodo,
  Clock,
  Settings2,
  ChevronRight,
  BarChart3,
  Wallet,
  MessageCircle,
  TrendingUp,
  Users,
  Sparkles,
  ClipboardList,
  BookOpen,
  Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher'
import AgentsList from '@/components/AgentsList'

type NavItem = {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badgeKey?: 'notifications'
}

type NavEntry = NavItem | { separator: true }

const navigation: NavEntry[] = [
  // Operación diaria
  { name: 'Mission Control', href: '/', icon: LayoutDashboard },
  { name: 'Operaciones', href: '/tasks', icon: ListTodo },
  { name: 'WhatsApp', href: '/whatsapp', icon: MessageCircle },
  { name: 'Notificaciones', href: '/notifications', icon: Bell, badgeKey: 'notifications' },
  { separator: true },
  // Activos y residentes
  { name: 'Unidades', href: '/units', icon: Building2 },
  { name: 'Contactos', href: '/contacts', icon: Users },
  { name: 'Contratos', href: '/contracts', icon: FileText },
  { name: 'Expedientes', href: '/applications', icon: ClipboardList },
  { separator: true },
  // Finanzas
  { name: 'Cobros', href: '/cobros', icon: Receipt },
  { name: 'Facturas', href: '/invoices', icon: FileText },
  { name: 'Gastos', href: '/gastos', icon: Wallet },
  { name: 'Bitácora', href: '/ledger', icon: BookOpen },
  { name: 'Reportes', href: '/reportes', icon: BarChart3 },
  { separator: true },
  // Operación de propiedad
  { name: 'Mantenimiento', href: '/maintenance', icon: Wrench },
  { name: 'Housekeeping', href: '/housekeeping', icon: Sparkles },
  { name: 'Reservaciones', href: '/reservations', icon: CalendarDays },
  { name: 'Precios', href: '/pricing', icon: TrendingUp },
  { separator: true },
  // Sistema
  { name: 'Timeline', href: '/audit', icon: Clock },
  { name: 'Onboarding', href: '/onboarding', icon: ListTodo },
  { name: 'Configuración', href: '/settings', icon: Settings2 },
]

const COLLAPSED_WIDTH = 56
const EXPANDED_WIDTH = 240

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const expanded = pinned || hovering || mobileOpen

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count')
      if (!res.ok) return
      const data = await res.json()
      setUnreadCount(typeof data?.count === 'number' ? data.count : 0)
    } catch {}
  }, [])

  useEffect(() => {
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [fetchUnread])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('baw-sidebar-pinned')
      if (raw === '1') setPinned(true)
    } catch {}
  }, [])

  function togglePinned() {
    const next = !pinned
    setPinned(next)
    try {
      window.localStorage.setItem('baw-sidebar-pinned', next ? '1' : '0')
    } catch {}
  }

  function badgeFor(item: NavItem) {
    if (item.badgeKey === 'notifications' && unreadCount > 0) return unreadCount
    return null
  }

  const width = expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 p-2 rounded-md md:hidden"
        style={{
          backgroundColor: 'var(--baw-surface)',
          border: '1px solid var(--baw-border)',
          color: 'var(--baw-text)',
        }}
        aria-label="Abrir menú"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        data-sidebar
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-200 ease-in-out',
          'md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
        style={{
          width: mobileOpen ? EXPANDED_WIDTH : width,
          backgroundColor: '#0F0F12',
          borderRight: '1px solid #2A2A32',
        }}
      >
        {/* Brand */}
        <div
          className="flex items-center gap-3 px-3 h-14 shrink-0"
          style={{ borderBottom: '1px solid #2A2A32' }}
        >
          <div
            className="flex items-center justify-center rounded-md shrink-0"
            style={{
              width: 32,
              height: 32,
              backgroundColor: 'var(--baw-primary)',
              color: '#FFFFFF',
            }}
          >
            <span className="font-bold text-[14px] leading-none">B</span>
          </div>
          {expanded && (
            <div className="flex items-center justify-between flex-1 min-w-0">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-white truncate">BaW OS</div>
                <div className="text-[11px] truncate" style={{ color: 'var(--baw-muted)' }}>
                  Centro de control
                </div>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1 md:hidden"
                style={{ color: 'var(--baw-muted)' }}
                aria-label="Cerrar menú"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={togglePinned}
                className="hidden md:inline-flex p-1 rounded transition-colors"
                style={{ color: pinned ? 'var(--baw-primary)' : 'var(--baw-muted)' }}
                aria-label={pinned ? 'Desfijar barra lateral' : 'Fijar barra lateral'}
                title={pinned ? 'Desfijar barra lateral' : 'Fijar barra lateral'}
              >
                <ChevronRight
                  className={cn('w-4 h-4 transition-transform', pinned && 'rotate-180')}
                />
              </button>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {navigation.map((entry, idx) => {
            if ('separator' in entry) {
              return (
                <div
                  key={`sep-${idx}`}
                  className="my-2 mx-3"
                  style={{ borderTop: '1px solid #2A2A32' }}
                />
              )
            }
            const item = entry
            const Icon = item.icon
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)
            const badge = badgeFor(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex items-center h-9 mx-2 rounded-md transition-colors group',
                  'hover:bg-white/5'
                )}
                style={{
                  backgroundColor: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  color: isActive ? 'var(--baw-text)' : 'var(--baw-muted)',
                }}
                title={!expanded ? item.name : undefined}
              >
                {isActive && (
                  <span
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r"
                    style={{ backgroundColor: 'var(--baw-primary)' }}
                  />
                )}
                <span className="flex items-center justify-center w-[40px] shrink-0">
                  <Icon className="w-[18px] h-[18px]" />
                </span>
                {expanded && (
                  <span className="flex items-center justify-between flex-1 min-w-0 pr-3">
                    <span className="text-[13px] font-medium truncate">{item.name}</span>
                    {badge !== null && (
                      <span
                        className="ml-2 text-[10px] font-semibold rounded-full px-1.5 py-0.5 leading-none tabular-nums min-w-[18px] text-center"
                        style={{
                          backgroundColor: 'var(--baw-danger)',
                          color: '#FFFFFF',
                        }}
                      >
                        {typeof badge === 'number' && badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                )}

                {/* Tooltip when collapsed */}
                {!expanded && (
                  <span
                    className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50"
                    style={{
                      backgroundColor: 'var(--baw-elevated)',
                      color: 'var(--baw-text)',
                      border: '1px solid var(--baw-border)',
                    }}
                  >
                    {item.name}
                    {badge !== null && (
                      <span className="ml-1 opacity-70">({badge})</span>
                    )}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Agentes (sprint S4) */}
        <div
          className="shrink-0 pt-2"
          style={{ borderTop: '1px solid #2A2A32' }}
        >
          <AgentsList expanded={expanded} />
        </div>

        {/* Footer: workspace switcher real (sprint S4). Logout movido a ProfileMenu. */}
        <div
          className="shrink-0 py-2"
          style={{ borderTop: '1px solid #2A2A32' }}
        >
          <WorkspaceSwitcher expanded={expanded} />
        </div>
      </aside>
    </>
  )
}
