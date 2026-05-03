// BaW OS — Agent Authentication (Fase 1 del Agent Platform Roadmap)
// Una identidad por agente, por org. Reemplaza el patrón BAWOS_API_KEY global.
// Contrato: ver docs/AGENT_INTEGRATION.md
//
// Nota de seguridad: usamos SHA-256 (Web Crypto, sin deps nuevas) con timing-safe
// compare. Suficiente para API keys de agente (no son passwords humanos, y se
// almacenan + transmiten siempre por canales TLS). Para Fase 2 evaluaremos bcrypt
// si las claves se filtran por logs accidentalmente.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import type { AgentId } from './types'

const KEY_PREFIX_LIVE = 'sk_live_'
const KEY_PREFIX_TEST = 'sk_test_'
const PREFIX_LOOKUP_LEN = 12

export interface AgentAuthResult {
  ok: true
  credentialId: string
  orgId: string
  agentId: AgentId
  scopes: string[]
  rateLimitTier: 'standard' | 'elevated' | 'unlimited'
}

export interface AgentAuthFailure {
  ok: false
  status: number
  code: string
  message: string
}

/**
 * Hashea una API key para almacenamiento. Determinístico (sin salt) porque
 * necesitamos lookup-by-hash para validación. La protección viene de:
 *  1. La key plana solo se devuelve una vez al crear.
 *  2. SHA-256 sin colisiones prácticas.
 *  3. RLS: solo admins ven el hash.
 */
export async function hashApiKey(plainKey: string): Promise<string> {
  const enc = new TextEncoder().encode(plainKey)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Genera una nueva API key con prefix visible.
 * Formato: sk_live_<32 hex chars random>
 */
export function generateApiKey(env: 'live' | 'test' = 'live'): {
  plainKey: string
  prefix: string
} {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const random = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const fullPrefix = env === 'live' ? KEY_PREFIX_LIVE : KEY_PREFIX_TEST
  const plainKey = `${fullPrefix}${random}`
  return { plainKey, prefix: plainKey.slice(0, PREFIX_LOOKUP_LEN) }
}

/**
 * Timing-safe string compare para hashes. Evita ataques por tiempo.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Extrae la API key del request. Acepta:
 *  - Authorization: Bearer sk_live_...
 *  - x-api-key: sk_live_...
 */
function extractApiKey(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim()
  }
  const xApi = req.headers.get('x-api-key')
  if (xApi) return xApi.trim()
  return null
}

/**
 * Valida un request contra la tabla agent_credentials.
 * Devuelve identidad del agente o failure con status code apropiado.
 *
 * Uso:
 *   const auth = await authenticateAgentRequest(req, ['units:read'])
 *   if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status })
 */
export async function authenticateAgentRequest(
  req: NextRequest,
  requiredScopes: string[] = []
): Promise<AgentAuthResult | AgentAuthFailure> {
  const plainKey = extractApiKey(req)
  if (!plainKey) {
    return {
      ok: false,
      status: 401,
      code: 'missing_credentials',
      message: 'Missing Authorization or x-api-key header',
    }
  }

  if (!plainKey.startsWith(KEY_PREFIX_LIVE) && !plainKey.startsWith(KEY_PREFIX_TEST)) {
    return {
      ok: false,
      status: 401,
      code: 'invalid_credential_format',
      message: 'API key must start with sk_live_ or sk_test_',
    }
  }

  const prefix = plainKey.slice(0, PREFIX_LOOKUP_LEN)
  const hash = await hashApiKey(plainKey)

  const supabase = createServiceClient()

  // Lookup por prefix activo, luego validar hash en memoria con timing-safe.
  const { data: rows, error } = await supabase
    .from('agent_credentials')
    .select('id, org_id, agent_id, api_key_hash, scopes, status, expires_at, rate_limit_tier')
    .eq('api_key_prefix', prefix)
    .eq('status', 'active')

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'auth_lookup_failed',
      message: error.message,
    }
  }

  const candidates = rows || []
  const matched = candidates.find((row) =>
    timingSafeEqual(row.api_key_hash as string, hash)
  )

  if (!matched) {
    return {
      ok: false,
      status: 401,
      code: 'invalid_credential',
      message: 'API key not recognized or revoked',
    }
  }

  // Expiry check
  if (matched.expires_at) {
    const expiresAt = new Date(matched.expires_at as string).getTime()
    if (Date.now() > expiresAt) {
      // Soft-mark expired (best-effort; no bloqueante)
      void supabase
        .from('agent_credentials')
        .update({ status: 'expired' })
        .eq('id', matched.id as string)
      return {
        ok: false,
        status: 401,
        code: 'credential_expired',
        message: 'API key expired',
      }
    }
  }

  // Scope check
  const grantedScopes = (matched.scopes as string[]) || []
  const missing = requiredScopes.filter(
    (s) => !grantedScopes.includes(s) && !grantedScopes.includes('*')
  )
  if (missing.length > 0) {
    return {
      ok: false,
      status: 403,
      code: 'forbidden_scope',
      message: `Missing required scopes: ${missing.join(', ')}`,
    }
  }

  // Touch last_used_at (fire-and-forget)
  void supabase.rpc('touch_agent_credential', { p_credential_id: matched.id as string })

  return {
    ok: true,
    credentialId: matched.id as string,
    orgId: matched.org_id as string,
    agentId: matched.agent_id as AgentId,
    scopes: grantedScopes,
    rateLimitTier: (matched.rate_limit_tier as 'standard' | 'elevated' | 'unlimited') ||
      'standard',
  }
}

/**
 * Helper para responder con error de auth en formato consistente.
 */
export function agentAuthErrorResponse(failure: AgentAuthFailure): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { code: failure.code, message: failure.message },
    },
    { status: failure.status }
  )
}

/**
 * BACKWARDS-COMPAT (Fase 1 transition): valida con BAWOS_API_KEY global como
 * fallback si no hay header de agente. Se elimina en Fase 2 cuando todos los
 * callers migraron.
 */
export function validateLegacyApiKey(req: NextRequest): boolean {
  const apiKey = req.headers.get('x-api-key')
  const expected = process.env.BAWOS_API_KEY
  if (!expected) return false
  return apiKey === expected
}
