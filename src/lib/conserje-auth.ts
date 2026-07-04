// BaW OS — Auth server-side del portal de conserje (ADR-022 D5)
//
// Antes: el PIN vivía hardcodeado en el client component y el conserje
// escribía `payments` directo a Supabase con la anon key. Ahora el PIN se
// valida en el server y el browser solo recibe un token HMAC de corta vida
// que autoriza los endpoints /api/conserje/* (lectura de cobros pendientes y
// marcado de pago en efectivo). El conserje NUNCA vuelve a tocar la DB
// directo desde el browser.
//
// PIN por org: organizations.settings.conserje_pin (jsonb) > env CONSERJE_PIN
// > '1234' (default legacy para no romper prod — Fran debe configurarlo).

import { createHmac, timingSafeEqual } from 'crypto'

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000 // 12h: un turno de recepción

const LEGACY_DEFAULT_PIN = '1234'

function hmacSecret(): string {
  // INTERNAL_WEBHOOK_SECRET ya existe para dispatch interno (AGENTS.md §9).
  // Fallback a la service key: siempre presente server-side, nunca en browser.
  return (
    process.env.INTERNAL_WEBHOOK_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  )
}

export function resolveConserjePin(orgSettings: unknown): string {
  const fromSettings =
    orgSettings && typeof orgSettings === 'object'
      ? (orgSettings as Record<string, unknown>).conserje_pin
      : undefined
  if (typeof fromSettings === 'string' && fromSettings.length >= 4) {
    return fromSettings
  }
  return process.env.CONSERJE_PIN || LEGACY_DEFAULT_PIN
}

function sign(payload: string): string {
  return createHmac('sha256', hmacSecret()).update(payload).digest('base64url')
}

/** Emite un token `orgId.exp.firma` válido por 12h. */
export function signConserjeToken(orgId: string): {
  token: string
  expiresAt: number
} {
  const exp = Date.now() + TOKEN_TTL_MS
  const payload = `${orgId}.${exp}`
  return { token: `${payload}.${sign(payload)}`, expiresAt: exp }
}

/** Devuelve el org_id si el token es válido y no expiró; null si no. */
export function verifyConserjeToken(token: string | null): string | null {
  if (!token || !hmacSecret()) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [orgId, expStr, signature] = parts
  const exp = Number(expStr)
  if (!orgId || !Number.isFinite(exp) || Date.now() > exp) return null
  const expected = sign(`${orgId}.${exp}`)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return orgId
}
