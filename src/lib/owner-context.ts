// BaW OS — Owner Portal v2 Context (Sprint 4 / S4-2)
//
// Resuelve "¿quién es este property_owner logueado?" leyendo:
//   1. Sesión de auth.users
//   2. property_owners.user_id que matchea
//   3. ownership_stakes para sus edificios visibles
//
// A diferencia de resolveOrgId() (que resuelve PM Company), aquí resolvemos
// el SUBJECT desde el lado del owner: qué edificios y unidades puede ver.

import { createSupabaseServer } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/api-auth'

export type OwnerContext = {
  userId: string
  email: string
  properties: Array<{
    property_owner_id: string
    full_name: string
    org_id: string
    org_name: string
    org_slug: string
    buildings: Array<{
      building_id: string
      building_name: string
      percentage: number
      starts_on: string | null
      ends_on: string | null
    }>
  }>
}

export class OwnerContextError extends Error {
  constructor(
    message: string,
    public code: 'NO_SESSION' | 'NOT_OWNER' = 'NO_SESSION',
  ) {
    super(message)
    this.name = 'OwnerContextError'
  }
}

/**
 * Resuelve el OwnerContext del usuario logueado.
 *
 * Un mismo usuario puede ser owner en múltiples PM Companies (multi-tenant
 * desde el lado del owner) y en múltiples edificios dentro de una org.
 */
export async function resolveOwnerContext(): Promise<OwnerContext> {
  const supabase = createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !user.email) {
    throw new OwnerContextError('No authenticated user', 'NO_SESSION')
  }

  const service = createServiceClient()

  // 1. property_owners del user. Match primario por user_id (enlace explícito y
  //    seguro). Fallback por email SOLO si el email está confirmado — antes se
  //    matcheaba por email no verificado e interpolado crudo en .or(), lo que
  //    permitía que otra org registrara tu email y te diera acceso a sus
  //    finanzas. La query por email va parametrizada (.ilike), no interpolada.
  const sel = 'id, full_name, org_id, organizations(name, slug)'
  const { data: byUser } = await service.from('property_owners').select(sel).eq('user_id', user.id)
  const owners = [...(byUser || [])]

  const emailConfirmed = !!((user as { email_confirmed_at?: string }).email_confirmed_at || user.confirmed_at)
  if (emailConfirmed && user.email) {
    const { data: byEmail } = await service.from('property_owners').select(sel).ilike('email', user.email)
    const seen = new Set(owners.map((o) => o.id))
    for (const o of byEmail || []) {
      if (!seen.has(o.id)) owners.push(o)
    }
  }

  if (!owners || owners.length === 0) {
    throw new OwnerContextError(
      'User is not registered as a property owner',
      'NOT_OWNER',
    )
  }

  // 2. Para cada property_owner, obtener sus stakes con building names
  const properties = await Promise.all(
    owners.map(async (po) => {
      const org = Array.isArray(po.organizations) ? po.organizations[0] : po.organizations
      const { data: stakes } = await service
        .from('ownership_stakes')
        .select('building_id, percentage, starts_on, ends_on, buildings(name)')
        .eq('property_owner_id', po.id)
        .eq('org_id', po.org_id)
        .or('ends_on.is.null,ends_on.gte.' + new Date().toISOString().slice(0, 10))

      return {
        property_owner_id: po.id,
        full_name: po.full_name,
        org_id: po.org_id,
        org_name: org?.name ?? '—',
        org_slug: org?.slug ?? '',
        buildings: (stakes ?? []).map((s) => {
          const b = Array.isArray(s.buildings) ? s.buildings[0] : s.buildings
          return {
            building_id: s.building_id,
            building_name: b?.name ?? '—',
            percentage: Number(s.percentage),
            starts_on: s.starts_on,
            ends_on: s.ends_on,
          }
        }),
      }
    }),
  )

  return {
    userId: user.id,
    email: user.email,
    properties,
  }
}

export async function tryResolveOwnerContext(): Promise<OwnerContext | null> {
  try {
    return await resolveOwnerContext()
  } catch {
    return null
  }
}

/**
 * Devuelve el set de building_ids que el owner puede ver (across all orgs).
 */
export function ownerBuildingIds(ctx: OwnerContext): string[] {
  const ids = new Set<string>()
  for (const p of ctx.properties) {
    for (const b of p.buildings) ids.add(b.building_id)
  }
  return Array.from(ids)
}
