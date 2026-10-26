// BaW OS — Scopes que se pueden emitir a credenciales de agentes (BAW-26).
//
// Módulo puro (sin imports de servidor): lo usan la ruta de emisión
// (/api/admin/agents/[id]/credentials) y la UI de credenciales, para que ambas
// partan de la misma lista. Todo lo que no esté aquí se rechaza en el servidor
// — en particular `approvals:resolve` (las aprobaciones las resuelve solo Fran)
// y el comodín `*`. Es la misma lista que la UI ya ofrecía; antes la API
// aceptaba cualquier string.

export const ISSUABLE_SCOPES = [
  'units:read',
  'units:write',
  'reservations:read',
  'reservations:write',
  'payments:read',
  'payments:write',
  'payments:trigger',
  'contracts:read',
  'contracts:write',
  'occupants:read',
  'occupants:write',
  'incidents:read',
  'incidents:write',
  'tasks:read',
  'tasks:write',
  'agents:run',
  'runs:read',
  'insights:read',
  'messages:send',
  'messages:read',
  'approvals:read',
  'agents:read',
  'interactions:read',
  'interactions:write',
  'lifecycle:archive',
] as const

/** Scopes que no están en ISSUABLE_SCOPES (p.ej. `approvals:resolve`, `*`). */
export function unknownScopes(scopes: readonly string[]): string[] {
  const allowed = new Set<string>(ISSUABLE_SCOPES)
  return scopes.filter((s) => !allowed.has(s))
}

