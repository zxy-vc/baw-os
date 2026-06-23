// BaW OS — Helper compartido de auth para rutas /api/admin/*
// Verifica que el caller sea owner/admin de la org activa o platform_admin.
// Reusa supabase-server (cookies) — los humanos NO usan API key de agente.

import { createServiceClient } from '@/lib/supabase'
import { createSupabaseServer } from '@/lib/supabase-server'
import { resolveOrgId, OrgContextError } from '@/lib/org-context'

export interface AdminCallerOk {
  ok: true
  userId: string
  orgId: string
  isPlatformAdmin: boolean
}

export interface AdminCallerErr {
  ok: false
  status: number
  message: string
}

// Roles con permisos de admin de tenant (L1). Los valores canónicos son pm_*;
// owner/admin son legacy tolerados durante la migración del enum (issue #23).
export const ORG_ADMIN_ROLES = ['pm_owner', 'pm_admin', 'owner', 'admin']

export async function requireAdminCaller(): Promise<AdminCallerOk | AdminCallerErr> {
  const supabase = createSupabaseServer()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    return { ok: false, status: 401, message: 'No authenticated user' }
  }

  const service = createServiceClient()
  const { data: pa } = await service
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const isPlatformAdmin = !!pa

  let orgId: string
  try {
    orgId = await resolveOrgId()
  } catch (e) {
    if (e instanceof OrgContextError) {
      return { ok: false, status: 401, message: e.message }
    }
    throw e
  }

  if (!isPlatformAdmin) {
    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (
      !membership ||
      !ORG_ADMIN_ROLES.includes(membership.role as string)
    ) {
      return { ok: false, status: 403, message: 'Owner or admin role required' }
    }
  }

  return { ok: true, userId: user.id, orgId, isPlatformAdmin }
}

/**
 * Igual que requireAdminCaller pero solo exige ser MIEMBRO activo de la org
 * (cualquier rol). Para features que cualquier usuario del tenant puede usar,
 * como el chat con agentes.
 */
export async function requireMemberCaller(): Promise<AdminCallerOk | AdminCallerErr> {
  const supabase = createSupabaseServer()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    return { ok: false, status: 401, message: 'No authenticated user' }
  }

  let orgId: string
  try {
    orgId = await resolveOrgId()
  } catch (e) {
    if (e instanceof OrgContextError) {
      return { ok: false, status: 401, message: e.message }
    }
    throw e
  }

  const service = createServiceClient()
  const { data: pa } = await service
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const isPlatformAdmin = !!pa

  if (!isPlatformAdmin) {
    const { data: membership } = await service
      .from('org_members')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!membership) {
      return { ok: false, status: 403, message: 'Not a member of this organization' }
    }
  }

  return { ok: true, userId: user.id, orgId, isPlatformAdmin }
}
