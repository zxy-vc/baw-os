// BaW OS — Mapa de capacidades financieras por rol de org (ADR-022 §4.2)
//
// Fuente única de "quién puede hacer qué" dentro de Finanzas. Espejo del
// patrón de navigation.ts (visibleToRoles): la UI lo usa para esconder
// acciones y los endpoints server-side para autorizar escrituras. Los roles
// legacy (owner/admin/operator/viewer, issue #23) se mapean a su equivalente
// pm_* para no romper membresías viejas.
//
// Nota de alcance (v1): los endpoints nuevos de liquidaciones ya lo aplican.
// Las páginas legacy de Finanzas que escriben directo a Supabase quedan
// gobernadas por RLS genérica de org; migrarlas a este mapa es follow-up.

export type FinanceCapability =
  | 'finance.view'                 // ver cobros, reportes, bitácora
  | 'finance.record_receipt'       // registrar abonos / pago rápido / histórico
  | 'finance.edit_charge'          // editar cargos (montos, vencimientos, condonar)
  | 'finance.configure_pricing'    // precios, temporadas, servicios, cargos adicionales
  | 'finance.configure_agreements' // comisiones de administración (management_agreements)
  | 'finance.emit_statements'      // emitir/anular estados de cuenta de propietarios
  | 'finance.record_payout'        // registrar pagos a propietarios
  | 'finance.emit_cfdi'            // emitir/cancelar CFDI
  | 'finance.irreversible_money'   // refunds / cargos a tarjeta (siempre con confirmación)
  | 'finance.manage_expenses'      // capturar gastos y proveedores

type CanonicalRole = 'pm_owner' | 'pm_admin' | 'pm_operator' | 'pm_viewer'

const LEGACY_ROLE_MAP: Record<string, CanonicalRole> = {
  owner: 'pm_owner',
  admin: 'pm_admin',
  operator: 'pm_operator',
  viewer: 'pm_viewer',
}

const OPERATOR_CAPS: FinanceCapability[] = [
  'finance.view',
  'finance.record_receipt',
  'finance.manage_expenses',
]

const ADMIN_CAPS: FinanceCapability[] = [
  ...OPERATOR_CAPS,
  'finance.edit_charge',
  'finance.configure_pricing',
  'finance.configure_agreements',
  'finance.emit_statements',
  'finance.record_payout',
  'finance.emit_cfdi',
  'finance.irreversible_money',
]

const CAPABILITIES: Record<CanonicalRole, Set<FinanceCapability>> = {
  pm_owner: new Set(ADMIN_CAPS),
  pm_admin: new Set(ADMIN_CAPS),
  pm_operator: new Set(OPERATOR_CAPS),
  pm_viewer: new Set<FinanceCapability>(['finance.view']),
}

export function normalizeRole(role: string | null | undefined): CanonicalRole | null {
  if (!role) return null
  if (role in CAPABILITIES) return role as CanonicalRole
  return LEGACY_ROLE_MAP[role] ?? null
}

/**
 * ¿El rol tiene esta capacidad financiera? Los platform admins (L0) pasan por
 * su propio guard (isPlatformAdmin) — este mapa es solo para roles de org.
 * Rol desconocido/agent/client → sin capacidades.
 */
export function canFinance(
  role: string | null | undefined,
  cap: FinanceCapability,
): boolean {
  const canonical = normalizeRole(role)
  if (!canonical) return false
  return CAPABILITIES[canonical].has(cap)
}
