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
  badge?: 'notifications'
  /** Routes that belong to this section (for active-state detection) */
  routes: string[]
  /** Horizontal sub-nav shown above content (omit if section has 1 view) */
  subNav?: SubNavItem[]
  /**
   * Roles de org con permiso para VER esta sección en el menú. Si se omite, la
   * sección es visible para cualquier miembro de la org. Gating de UX (esconder
   * lo inaccesible); la autorización real vive en cada page/endpoint.
   */
  visibleToRoles?: string[]
}

// Roles con permisos de admin de tenant (L1). pm_* canónicos + owner/admin
// legacy (issue #23). Duplicado aquí a propósito: navigation.ts lo importa el
// Sidebar (client component) y no puede depender de admin-auth (server-only).
export const ORG_ADMIN_ROLES = ['pm_owner', 'pm_admin', 'owner', 'admin']

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
    href: '/audit',
    icon: 'Inbox',
    placement: 'top',
    badge: 'notifications',
    routes: ['/tasks', '/notifications', '/whatsapp', '/audit'],
    subNav: [
      { href: '/audit', label: 'Timeline' },
      { href: '/tasks', label: 'Tareas' },
      { href: '/whatsapp', label: 'Mensajes' },
      { href: '/notifications', label: 'Notificaciones' },
    ],
  },
  {
    id: 'portfolio',
    label: 'Portafolio',
    href: '/units',
    icon: 'Building2',
    placement: 'top',
    routes: ['/buildings', '/units', '/owners', '/calendario'],
    subNav: [
      { href: '/units', label: 'Unidades' },
      // Calendario de unidades (2026-07-03, acuerdo con Fran en chat):
      // timeline multi-unidad + mensual por unidad con temporadas de precio.
      { href: '/calendario', label: 'Calendario' },
      { href: '/buildings', label: 'Edificios' },
      { href: '/owners', label: 'Propietarios' },
    ],
  },
  {
    id: 'tenants',
    label: 'Inquilinos',
    href: '/contacts',
    icon: 'Users',
    placement: 'top',
    routes: ['/contacts', '/estancias', '/contracts', '/applications', '/clientes'],
    subNav: [
      // Grupo "gente" (uso diario): directorio → ocupación → relación comercial.
      { href: '/contacts', label: 'Contactos' },
      { href: '/estancias', label: 'Estancias' },
      { href: '/clientes', label: 'CRM', matchPrefix: '/clientes' },
      // Grupo "papeleo": acuerdos firmados → filtro de aprobación.
      { href: '/contracts', label: 'Contratos' },
      { href: '/applications', label: 'Expedientes' },
    ],
  },
  {
    id: 'finance',
    label: 'Finanzas',
    href: '/cobros',
    icon: 'Wallet',
    placement: 'top',
    routes: [
      '/cobros',
      '/invoices',
      '/gastos',
      '/liquidaciones',
      '/mora',
      '/ledger',
      '/reportes',
      '/quotes',
      '/pricing',
      '/servicios',
      '/ancillary-charges',
    ],
    subNav: [
      { href: '/cobros', label: 'Cobros' },
      { href: '/invoices', label: 'Facturas' },
      { href: '/gastos', label: 'Gastos' },
      // ADR-022 Fase 1 (aprobado por Fran 2026-07-04): flujo B, estados de
      // cuenta y pagos netos a propietarios.
      { href: '/liquidaciones', label: 'Liquidaciones' },
      { href: '/mora', label: 'Morosidad' },
      { href: '/ledger', label: 'Bitácora' },
      { href: '/reportes', label: 'Reportes' },
      { href: '/pricing', label: 'Precios' },
      { href: '/servicios', label: 'Servicios' },
      { href: '/quotes', label: 'Cotizador' },
      { href: '/ancillary-charges', label: 'Cargos adicionales' },
    ],
  },
  {
    id: 'operations',
    label: 'Operación',
    href: '/maintenance',
    icon: 'Wrench',
    placement: 'top',
    routes: ['/maintenance', '/housekeeping', '/reservations', '/search'],
    subNav: [
      { href: '/maintenance', label: 'Mantenimiento' },
      { href: '/housekeeping', label: 'Housekeeping' },
      { href: '/reservations', label: 'Reservaciones' },
    ],
  },
  // Footer (separate, secondary)
  {
    id: 'agents',
    label: 'Agentes',
    href: '/agents',
    icon: 'Bot',
    placement: 'footer',
    routes: ['/agents', '/chat'],
    subNav: [
      { href: '/agents', label: 'Catálogo' },
      { href: '/chat', label: 'Chat' },
    ],
    // Conectar/configurar agentes y sus credenciales = admin de la cuenta.
    visibleToRoles: ORG_ADMIN_ROLES,
  },
  {
    id: 'settings',
    label: 'Configuración',
    href: '/settings',
    icon: 'Settings2',
    placement: 'footer',
    routes: ['/settings', '/onboarding', '/api-docs'],
    // Config de la organización y miembros = admin. El perfil personal de cada
    // usuario vive en /me (accesible desde el menú de perfil), no aquí.
    visibleToRoles: ORG_ADMIN_ROLES,
    subNav: [
      { href: '/settings', label: 'General' },
      { href: '/onboarding', label: 'Configurar cuenta' },
      { href: '/api-docs', label: 'API Docs' },
    ],
  },
]

/**
 * Filtra las secciones visibles según el rol de org del usuario.
 * Si `role` es null/undefined (sesión aún cargando) devuelve todas para evitar
 * parpadeo; el caller debe esperar a que el rol resuelva antes de confiar en
 * el filtro para roles bajos.
 */
export function filterSectionsByRole(
  sections: SidebarSection[],
  role: string | null | undefined,
): SidebarSection[] {
  if (!role) return sections
  return sections.filter(
    (s) => !s.visibleToRoles || s.visibleToRoles.includes(role),
  )
}

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
