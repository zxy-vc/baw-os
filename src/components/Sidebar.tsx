'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Inbox,
  Building2,
  Users,
  Wallet,
  Wrench,
  Bot,
  Settings2,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher'
import BawMark from '@/components/BawMark'
import { useOrgContext } from '@/hooks/useOrgContext'
import {
  SIDEBAR_SECTIONS,
  isSectionActive,
  filterSectionsByRole,
} from '@/lib/navigation'

const COLLAPSED_WIDTH = 56
const EXPANDED_WIDTH = 240

const ICON_MAP = {
  Home,
  Inbox,
  Building2,
  Users,
  Wallet,
  Wrench,
  Bot,
  Settings2,
} as const

export default function Sidebar() {
  const pathname = usePathname()
  const { role } = useOrgContext()
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

  const width = expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH

  // Sprint 4 / S4-0: sidebar consolidado a 6 top-level + footer.
  // Acuerdo canónico: Inicio · Hoy · Portafolio · Inquilinos · Finanzas · Operación
  // Footer: Agentes · Configuración. Sub-nav contextual vive en SectionTopNav.
  useEffect(() => {
    const root = document.documentElement
    const layoutWidth = pinned ? EXPANDED_WIDTH : COLLAPSED_WIDTH
    root.style.setProperty('--sidebar-effective-width', `${layoutWidth}px`)
    root.style.setProperty('--sidebar-rendered-width', `${width}px`)
  }, [pinned, width])

  const visibleSections = useMemo(
    () => filterSectionsByRole(SIDEBAR_SECTIONS, role),
    [role],
  )
  const sections = useMemo(
    () => visibleSections.filter((s) => s.placement === 'top'),
    [visibleSections],
  )
  const footerSections = useMemo(
    () => visibleSections.filter((s) => s.placement === 'footer'),
    [visibleSections],
  )

  function renderEntry(section: (typeof SIDEBAR_SECTIONS)[number]) {
    const Icon = ICON_MAP[section.icon as keyof typeof ICON_MAP]
    const active = isSectionActive(section, pathname)
    const showBadge = section.badge === 'notifications' && unreadCount > 0

    return (
      <Link
        key={section.id}
        href={section.href}
        className={cn(
          'relative flex items-center h-9 mx-2 rounded-md transition-colors group',
          'hover:bg-white/5'
        )}
        style={{
          backgroundColor: active ? 'var(--baw-info-bg-soft)' : 'transparent',
          color: active ? 'var(--baw-text)' : 'var(--baw-muted)',
        }}
        title={!expanded ? section.label : undefined}
      >
        {active && (
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
            <span className="text-[13px] font-medium truncate">{section.label}</span>
            {showBadge && (
              <span
                className="ml-2 text-[10px] font-semibold rounded-full px-1.5 py-0.5 leading-none tabular-nums min-w-[18px] text-center"
                style={{ backgroundColor: 'var(--baw-danger)', color: 'var(--baw-on-primary)' }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </span>
        )}
        {!expanded && (
          <span
            className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50"
            style={{
              backgroundColor: 'var(--baw-elevated)',
              color: 'var(--baw-text)',
              border: '1px solid var(--baw-border)',
            }}
          >
            {section.label}
            {showBadge && <span className="ml-1 opacity-70">({unreadCount})</span>}
          </span>
        )}
      </Link>
    )
  }

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 z-50 flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md md:hidden"
        style={{
          // 44px de alto centrado en el header de 56px, empujado bajo el notch
          // (viewportFit: 'cover' en layout.tsx hace que env() sea > 0 en iPhone).
          top: 'calc(0.375rem + env(safe-area-inset-top))',
          backgroundColor: 'var(--baw-surface)',
          border: '1px solid var(--baw-border)',
          color: 'var(--baw-text)',
        }}
        aria-label="Abrir menú"
      >
        <Menu className="w-5 h-5" />
      </button>

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
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          backgroundColor: 'var(--baw-sidebar-bg)',
          borderRight: '1px solid var(--baw-sidebar-border)',
        }}
      >
        {/* Brand — Mark B + IBM Plex Mono wordmark */}
        <div
          className="flex items-center gap-3 px-3 h-14 shrink-0"
          style={{ borderBottom: '1px solid var(--baw-sidebar-border)' }}
        >
          <div
            className="shrink-0"
            style={{ color: 'var(--baw-text)' }}
          >
            <BawMark size={28} />
          </div>
          {expanded && (
            <div className="flex items-center justify-between flex-1 min-w-0">
              <div className="min-w-0">
                <div
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--baw-text)' }}
                  className="text-[14px] font-medium tracking-tight leading-none truncate"
                >
                  BaW
                  <span
                    className="ml-1.5 text-[11px] font-normal opacity-55"
                    style={{ color: 'var(--baw-muted)' }}
                  >
                    / OS
                  </span>
                </div>
                <div
                  className="text-[10px] mt-1 truncate uppercase tracking-wider"
                  style={{ color: 'var(--baw-muted)', fontFamily: 'var(--font-mono)' }}
                >
                  Building Always Working
                </div>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] md:hidden"
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

        {/* Top sections (6) */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {sections.map((s) => renderEntry(s))}
        </nav>

        {/* Footer sections (Agentes · Configuración) */}
        <div className="shrink-0 py-2" style={{ borderTop: '1px solid var(--baw-sidebar-border)' }}>
          {footerSections.map((s) => renderEntry(s))}
        </div>

        {/* El toggle Human/Agent vive solo en la pantalla de Agentes (donde sí
            cambia la vista). Antes estaba aquí pero confundía: en otras secciones
            no hacía nada. */}

        {/* Workspace switcher */}
        <div className="shrink-0 py-2" style={{ borderTop: '1px solid var(--baw-sidebar-border)' }}>
          <WorkspaceSwitcher expanded={expanded} />
        </div>
      </aside>
    </>
  )
}
