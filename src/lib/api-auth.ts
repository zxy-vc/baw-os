// BaW OS — API Key Authentication for Agent Interface
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Sprint 3 / S6: getOrgId() legacy ya NO debe retornar la UUID Mateos hardcoded
// porque esa organization fue eliminada en el wipe operativo de S1.
//
// Solución temporal: cache con TTL que resuelve dinámicamente la primera
// organization disponible (best-effort) usando service-role.  Esto destraba
// las ~73 APIs legacy tras el onboarding sin migrarlas todas a async/JWT.
//
// Pendiente decisión humana (Fran): refactor real para leer `org_id` del JWT
// del usuario (server-side via cookies()) o de un header inyectado por
// middleware.  Ver `BUG_BASH_S6.md`.
// ────────────────────────────────────────────────────────────────────────────

const FALLBACK_ORG_ID = process.env.BAW_FALLBACK_ORG_ID || ''
let cachedOrgId: string | null = null
let cachedAt = 0
const CACHE_TTL_MS = 60_000

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json(
    { success: false, data: null, error: message },
    { status: 401 }
  )
}

export function apiError(message: string, status = 400) {
  return NextResponse.json(
    { success: false, data: null, error: message },
    { status }
  )
}

export function apiOk<T>(data: T) {
  return NextResponse.json({ success: true, data })
}

export function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key')
  const expected = process.env.BAWOS_API_KEY
  if (!expected) return false
  return apiKey === expected
}

/**
 * Sync getter usado por las APIs legacy.  Devuelve el último org_id
 * resuelto en cache, o el fallback de env si está vacío.  La primera vez
 * que el proceso arranca regresa el fallback hasta que getOrgIdAsync()
 * caliente el cache.
 */
export function getOrgId(): string {
  if (cachedOrgId && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedOrgId
  }
  return FALLBACK_ORG_ID
}

/**
 * Async getter que resuelve dinámicamente la primera organization
 * disponible usando service-role.  Las nuevas APIs deben usar esta versión.
 * Las APIs legacy pueden llamarla puntualmente para calentar el cache.
 */
export async function getOrgIdAsync(): Promise<string> {
  if (cachedOrgId && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedOrgId
  }
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error || !data?.id) return FALLBACK_ORG_ID
    cachedOrgId = data.id
    cachedAt = Date.now()
    return data.id
  } catch {
    return FALLBACK_ORG_ID
  }
}

/**
 * Permite que el flow de onboarding inyecte el org_id recién creado al
 * cache para que las APIs legacy lo recojan inmediatamente.
 */
export function setActiveOrgId(orgId: string) {
  cachedOrgId = orgId
  cachedAt = Date.now()
}
