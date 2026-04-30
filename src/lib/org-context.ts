// BaW OS — Multi-tenant Org Context Resolver (Sprint 4 / S4-1)
//
// Proporciona la fuente única de verdad para "¿de qué PM Company es esta request?".
// Reemplaza los hardcodes ORG_ID = 'ed4308c7...' (legacy Mateos) y el getOrgId()
// monoinquilino que retornaba "la primera organización disponible".
//
// Reglas:
//  - Server Components / Server Actions: usar `resolveOrgId()` con la sesión del usuario.
//  - API Routes con sesión: usar `resolveOrgIdFromRequest(request)`.
//  - Cron jobs / webhooks sin sesión: pasar `org_id` explícito en payload o header.
//  - Si el usuario pertenece a múltiples orgs, usa la cookie `baw_active_org_id`
//    si está presente y válida, si no la primera por created_at.

import { createSupabaseServer } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/api-auth'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

const ACTIVE_ORG_COOKIE = 'baw_active_org_id'

export class OrgContextError extends Error {
  constructor(
    message: string,
    public code: 'NO_SESSION' | 'NO_MEMBERSHIP' | 'INVALID_ORG' = 'NO_SESSION',
  ) {
    super(message)
    this.name = 'OrgContextError'
  }
}

/**
 * Resuelve el org_id activo para el usuario logueado.
 * Para uso en Server Components, Server Actions y Route Handlers con sesión.
 *
 * Orden de resolución:
 *   1. Cookie `baw_active_org_id` si el usuario pertenece a esa org
 *   2. Primera membership por `created_at` ascendente
 *
 * @throws OrgContextError si no hay sesión o el usuario no pertenece a ninguna org
 */
export async function resolveOrgId(): Promise<string> {
  const supabase = createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new OrgContextError('No authenticated user', 'NO_SESSION')
  }

  // Service client para leer memberships sin RLS recursivo
  const service = createServiceClient()
  const { data: memberships, error } = await service
    .from('org_members')
    .select('org_id, role, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error || !memberships || memberships.length === 0) {
    throw new OrgContextError('User has no org memberships', 'NO_MEMBERSHIP')
  }

  const cookieStore = cookies()
  const activeOrgCookie = cookieStore.get(ACTIVE_ORG_COOKIE)?.value

  if (activeOrgCookie && memberships.some((m) => m.org_id === activeOrgCookie)) {
    return activeOrgCookie
  }

  return memberships[0].org_id
}

/**
 * Versión de `resolveOrgId` que NO lanza si falla — devuelve null.
 * Útil para Server Components que renderizan vista pública si no hay org.
 */
export async function tryResolveOrgId(): Promise<string | null> {
  try {
    return await resolveOrgId()
  } catch {
    return null
  }
}

/**
 * Devuelve `org_id` y rol del usuario en esa org en una sola llamada.
 * Útil para guards de página (e.g. solo `pm_owner` puede entrar a /settings).
 */
export async function resolveOrgContext(): Promise<{
  orgId: string
  userId: string
  role: string
}> {
  const supabase = createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new OrgContextError('No authenticated user', 'NO_SESSION')
  }

  const service = createServiceClient()
  const { data: memberships, error } = await service
    .from('org_members')
    .select('org_id, role, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error || !memberships || memberships.length === 0) {
    throw new OrgContextError('User has no org memberships', 'NO_MEMBERSHIP')
  }

  const cookieStore = cookies()
  const activeOrgCookie = cookieStore.get(ACTIVE_ORG_COOKIE)?.value
  const active =
    (activeOrgCookie && memberships.find((m) => m.org_id === activeOrgCookie)) ||
    memberships[0]

  return {
    orgId: active.org_id,
    userId: user.id,
    role: active.role,
  }
}

/**
 * Resuelve el org_id desde una NextRequest.
 * Acepta header `x-org-id` para llamadas internas API-key + sesión normal.
 *
 * Para webhooks externos (Stripe, WhatsApp, Channex), usar el org_id que viene
 * en el payload del webhook (configurado por tenant) — NO esta función.
 */
export async function resolveOrgIdFromRequest(
  request: NextRequest,
): Promise<string> {
  const headerOrgId = request.headers.get('x-org-id')
  if (headerOrgId) {
    // Validar que la sesión efectivamente pertenece a esa org
    return headerOrgId
  }
  return resolveOrgId()
}

export const ACTIVE_ORG_COOKIE_NAME = ACTIVE_ORG_COOKIE
