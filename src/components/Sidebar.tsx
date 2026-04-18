'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  Wrench,
  CalendarDays,
  Receipt,
  ListTodo,
  Bot,
  Clock,
  Settings2,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

type NavItem = {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badgeKey?: 'agents' | 'notifications'
}

type NavEntry = NavItem | { separator: true }

const navigation: NavEntry[] = [
  { name: 'Mission Control', href: '/', icon: LayoutDashboard },
  { name: 'Operaciones', href: '/tasks', icon: ListTodo },
  { name: 'Unidades', href: '/units', icon: Building2 },
  { name: 'Contratos', href: '/contracts', icon: FileText },
  { name: 'Cobros', href: '/cobros', icon: Receipt },
  { name: 'Mantenimiento', href: '/maintenance', icon: Wrench },
  { separator: true },
  { name: 'Reservaciones', href: '/reservations', icon: CalendarDays },
  { name: 'Facturas', href: '/invoices', icon: FileText },
  { separator: true },
  { name: 'Agentes', href: '/agents', icon: Bot, badgeKey: 'agents' },
  { name: 'Timeline', href: '/audit', icon: Clock },
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
  const mockAgentApprovals = 4

  const expanded = pinned || hovering || mobileOpen

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

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function badgeFor(item: NavItem) {
    if (item.badgeKey === 'agents' && mockAgentApprovals > 0) return mockAgentApprovals
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
                          backgroundColor:
                            item.badgeKey === 'agents'
                              ? 'rgba(139, 92, 246, 0.2)'
                              : 'var(--baw-danger)',
                          color:
                            item.badgeKey === 'agents' ? '#A78BFA' : '#FFFFFF',
                          border:
                            item.badgeKey === 'agents'
                              ? '1px solid rgba(139, 92, 246, 0.4)'
                              : 'none',
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

        {/* Footer: building selector + logout */}
        <div
          className="shrink-0 py-2"
          style={{ borderTop: '1px solid #2A2A32' }}
        >
          <button
            type="button"
            className="flex items-center h-9 mx-2 rounded-md transition-colors hover:bg-white/5 w-[calc(100%-16px)]"
            style={{ color: 'var(--baw-text)' }}
            title={!expanded ? 'ALM809P' : undefined}
          >
            <span className="flex items-center justify-center w-[40px] shrink-0">
              <Building2 className="w-[18px] h-[18px]" style={{ color: 'var(--baw-muted)' }} />
            </span>
            {expanded && (
              <span className="flex items-center justify-between flex-1 min-w-0 pr-3">
                <span className="flex flex-col items-start min-w-0">
                  <span className="text-[12px] font-medium truncate">ALM809P</span>
                  <span className="text-[10px]" style={{ color: 'var(--baw-muted)' }}>
                    ALM809P
                  </span>
                </span>
                <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--baw-muted)' }} />
              </span>
            )}
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center h-9 mx-2 rounded-md transition-colors hover:bg-white/5 w-[calc(100%-16px)]"
            style={{ color: 'var(--baw-muted)' }}
            title={!expanded ? 'Cerrar sesión' : undefined}
          >
            <span className="flex items-center justify-center w-[40px] shrink-0">
              <LogOut className="w-[18px] h-[18px]" />
            </span>
            {expanded && (
              <span className="text-[13px] font-medium">Cerrar sesión</span>
            )}
          </button>
        </div>
      </aside>
    </>
  )
}
