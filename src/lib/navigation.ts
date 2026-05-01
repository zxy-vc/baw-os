/**
 * BaW OS — Navigation source of truth
 *
 * Sprint 4 / S4-0 · Acuerdo canónico #1: sidebar consolidado a 6 top-level
 * + footer (Agentes, Configuración). Sub-nav contextual horizontal aparece
 * arriba del contenido cuando una sección tiene >1 vista.
 *
 * Si quieres agregar una página nueva: se incorpora como sub-item de una
 * sección existente, NO como nueva entrada en el sidebar. El sidebar no
 * crece más sin discusión explícita.
 */

export type SectionId =
  | 'home'
  | 'today'
  | 'portfolio'
  | 'tenants'
  | 'finance'
  | 'operations'
  | 'agents'
  | 'settings'

export type SubNavItem = {
  href: string
  label: string
  /** Optional: also active when pathname starts with this prefix */
  matchPrefix?: string
}

export type SidebarSection = {
  id: SectionId
  label: string
  /** Default landing route when user clicks the section */
  href: string
  icon:
    | 'Home'
    | 'Inbox'
    | 'Building2'
    | 'Users'
    | 'Wallet'
    | 'Wrench'
    | 'Bot'
    | 'Settings2'
  placement: 'top' | 'footer'
  /** Routes that belong to this section (for active-state detection) */
  routes: string[]
  /** Horizontal sub-nav shown above content (omit if section has 1 view) */
  subNav?: SubNavItem[]
}

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    id: 'home',
    label: 'Inicio',
    href: '/',
    icon: 'Home',
    placement: 'top',
    routes: ['/'],
  },
  {
    id: 'today',
    label: 'Hoy',
    href: '/tasks',
    icon: 'Inbox',
    placement: 'top',
    routes: ['/tasks', '/notifications', '/audit'],
  },
  {
    id: 'portfolio',
    label: 'Portafolio',
    href: '/buildings',
    icon: 'Building2',
    placement: 'top',
    routes: ['/buildings', '/units', '/owners'],
    subNav: [
      { href: '/buildings', label: 'Edificios' },
      { href: '/units', label: 'Unidades' },
      { href: '/owners', label: 'Propietarios' },
    ],
  },
  {
    id: 'tenants',
    label: 'Inquilinos',
    href: '/tenants',
    icon: 'Users',
    placement: 'top',
    routes: ['/tenants', '/contacts', '/contracts', '/whatsapp', '/applications'],
    subNav: [
      { href: '/tenants', label: 'Inquilinos' },
      { href: '/contracts', label: 'Contratos' },
      { href: '/whatsapp', label: 'WhatsApp' },
    ],
  },
  {
    id: 'finance',
    label: 'Finanzas',
    href: '/payments',
    icon: 'Wallet',
    placement: 'top',
    routes: [
      '/payments',
      '/expenses',
      '/reports',
      '/cobros',
      '/invoices',
      '/gastos',
      '/mora',
      '/ledger',
      '/reportes',
      '/quotes',
      '/pricing',
    ],
    subNav: [
      { href: '/payments', label: 'Pagos' },
      { href: '/expenses', label: 'Gastos' },
      { href: '/reports', label: 'Reportes' },
    ],
  },
  {
    id: 'operations',
    label: 'Operación',
    href: '/maintenance',
    icon: 'Wrench',
    placement: 'top',
    routes: [
      '/maintenance',
      '/inspections',
      '/documents',
      '/housekeeping',
      '/reservations',
      '/search',
    ],
    subNav: [
      { href: '/maintenance', label: 'Mantenimiento' },
      { href: '/inspections', label: 'Inspecciones' },
      { href: '/documents', label: 'Documentos' },
    ],
  },
  // Footer (separate, secondary)
  {
    id: 'agents',
    label: 'Agentes',
    href: '/agents',
    icon: 'Bot',
    placement: 'footer',
    routes: ['/agents'],
  },
  {
    id: 'settings',
    label: 'Configuración',
    href: '/settings',
    icon: 'Settings2',
    placement: 'footer',
    routes: ['/settings', '/team', '/billing', '/onboarding', '/api-docs'],
    subNav: [
      { href: '/settings', label: 'Configuración' },
      { href: '/team', label: 'Equipo' },
      { href: '/billing', label: 'Billing' },
    ],
  },
]

/** Returns the section the given pathname belongs to, or null. */
export function findSection(pathname: string): SidebarSection | null {
  // Special-case root: only home matches "/"
  if (pathname === '/') {
    return SIDEBAR_SECTIONS.find((s) => s.id === 'home') ?? null
  }
  // Longest-prefix match across non-root routes
  let best: { section: SidebarSection; len: number } | null = null
  for (const section of SIDEBAR_SECTIONS) {
    for (const route of section.routes) {
      if (route === '/') continue
      if (pathname === route || pathname.startsWith(route + '/')) {
        if (!best || route.length > best.len) {
          best = { section, len: route.length }
        }
      }
    }
  }
  return best?.section ?? null
}

export function isSectionActive(section: SidebarSection, pathname: string): boolean {
  return findSection(pathname)?.id === section.id
}

export function isSubNavItemActive(item: SubNavItem, pathname: string): boolean {
  if (item.href === '/') return pathname === '/'
  if (pathname === item.href) return true
  if (pathname.startsWith(item.href + '/')) return true
  if (item.matchPrefix && pathname.startsWith(item.matchPrefix)) return true
  return false
}
