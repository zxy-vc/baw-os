// BaW OS — Quién opera BaW OS hoy (BAW-26) + presets de scopes de credenciales.
//
// Módulo puro (sin imports de servidor): lo usan las rutas API, el pipeline de
// Discord y la UI de credenciales (client component).
//
// Alicia (`alicia-ops`) fue apagada; su historial (runs, approvals,
// interacciones, conversaciones) se conserva, pero ya no es chateable ni se le
// emiten credenciales. Hugo (`hugo-cos`) es el agente operador del 809.

/** Agente operador: destino por defecto del chat in-app y de Discord. */
export const OPERATOR_AGENT_ID = 'hugo-cos' as const

/**
 * Agentes retirados. El status 'retired' vive en la tabla `agents`
 * (migración 20261016010000), pero mientras esa migración no esté aplicada en
 * prod, esta lista garantiza que Alicia no aparezca como opción.
 */
export const RETIRED_AGENT_IDS: ReadonlySet<string> = new Set(['alicia-ops'])

/** Hugo sin credencial activa en la org: no es chateable. */
export const OPERATOR_NO_CREDENTIAL_MESSAGE =
  'Hugo no tiene una credencial activa en esta organización. Un admin puede emitirla en /agents/hugo-cos/credentials.'

/**
 * Mensaje sin respuesta tras el umbral. No afirmamos "desconectado": solo que
 * no respondió y dónde revisar.
 */
export function noResponseMessage(agentName: string): string {
  return `${agentName} no ha respondido; revisa que su conector en OpenClaw esté encendido.`
}

export function isRetiredAgent(agentId: string, status?: string | null): boolean {
  return status === 'retired' || RETIRED_AGENT_IDS.has(agentId)
}

/**
 * Scopes que se pueden emitir desde /agents/[id]/credentials. Todo lo que no
 * esté aquí se rechaza en el servidor — en particular `approvals:resolve`
 * (las aprobaciones las resuelve solo Fran) y el comodín `*`.
 */
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

/**
 * Preset «operador» (credencial de Hugo). Exactamente:
 * - Lectura amplia: todos los GET de /v1 que existen hoy.
 * - Escrituras v1 existentes, cada una clasificada por el classifier
 *   (los candados duros — `lifecycle.archive`, cobros, CFDI, firma — siguen en
 *   REQUIRE_APPROVAL sin importar el trigger).
 * - `interactions:read/write` para el chat in-app y Discord (long-poll + PATCH).
 *
 * Fuera a propósito:
 * - `approvals:resolve` — nunca; solo Fran aprueba.
 * - `agents:run` — dispara runners internos (cobranza) en banda con
 *   clasificación LOG, o sea sin pasar por aprobación.
 * - `payments:trigger`, `reservations:write`, `messages:read` — ningún endpoint
 *   /v1 los usa hoy; no se otorga un permiso que no tiene uso.
 */
export const OPERATOR_SCOPES = [
  // Lectura
  'units:read',
  'reservations:read',
  'payments:read',
  'contracts:read',
  'occupants:read',
  'incidents:read',
  'tasks:read',
  'runs:read',
  'insights:read',
  'approvals:read',
  'agents:read',
  // Escrituras v1 (siempre pasan por el classifier)
  'units:write',
  'payments:write',
  'contracts:write',
  'occupants:write',
  'incidents:write',
  'tasks:write',
  'messages:send',
  'lifecycle:archive',
  // Chat in-app + Discord
  'interactions:read',
  'interactions:write',
] as const

export type ScopePresetId = 'operador'

export interface ScopePreset {
  id: ScopePresetId
  label: string
  description: string
  scopes: readonly string[]
}

export const SCOPE_PRESETS: Record<ScopePresetId, ScopePreset> = {
  operador: {
    id: 'operador',
    label: 'Operador',
    description:
      'Lectura amplia, escrituras v1 (con el classifier y sus candados) y chat. Nunca resuelve aprobaciones.',
    scopes: OPERATOR_SCOPES,
  },
}

export function getScopePreset(id: unknown): ScopePreset | null {
  return typeof id === 'string' && id in SCOPE_PRESETS
    ? SCOPE_PRESETS[id as ScopePresetId]
    : null
}

/** Scopes que no están en ISSUABLE_SCOPES (p.ej. `approvals:resolve`, `*`). */
export function unknownScopes(scopes: readonly string[]): string[] {
  const allowed = new Set<string>(ISSUABLE_SCOPES)
  return scopes.filter((s) => !allowed.has(s))
}
