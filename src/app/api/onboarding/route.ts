// BaW OS — Onboarding Wizard v2 API (Sprint 3 / S3)
// Crea PM Company → org_member (pm_owner) → Building → Units → Property Owner → ownership_stake
// en un único request. Usa service-role para bypass de RLS y se hace best-effort de rollback.

import { NextRequest } from 'next/server'
import { createServiceClient, apiOk, apiError } from '@/lib/api-auth'

interface UnitInput {
  number: string
  type: 'STR' | 'MTR' | 'LTR'
  floor: number
}

interface OwnerInput {
  full_name: string
  email: string | null
  phone: string | null
  rfc: string | null
  percentage: number
  user_id: string | null
}

interface OnboardingV2Body {
  user_id: string
  pm: { name: string; slug: string }
  building: {
    name: string
    address: string | null
    city: string
    state: string | null
    country: string
    postal_code: string | null
  }
  units: UnitInput[]
  owner_mode: 'self' | 'client' | 'skip'
  owner: OwnerInput | null
}

export async function POST(request: NextRequest) {
  let createdOrgId: string | null = null
  try {
    const body = (await request.json()) as OnboardingV2Body

    // Validaciones mínimas
    if (!body.user_id) return apiError('user_id es obligatorio', 400)
    if (!body.pm?.name || !body.pm?.slug)
      return apiError('PM Company name y slug son obligatorios', 400)
    if (!body.building?.name || !body.building?.city)
      return apiError('Edificio: name y city son obligatorios', 400)
    if (!body.units || body.units.length === 0)
      return apiError('Se requiere al menos una unidad', 400)

    const supabase = createServiceClient()

    // 1) PM Company (organizations)
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .insert({
        name: body.pm.name,
        slug: body.pm.slug,
        settings: { onboarded_at: new Date().toISOString() },
      })
      .select('id')
      .single()

    if (orgErr || !org) {
      // 23505 = unique violation
      const msg =
        orgErr?.code === '23505'
          ? `El slug "${body.pm.slug}" ya existe. Cambia el nombre o slug.`
          : `Error creando PM Company: ${orgErr?.message ?? 'desconocido'}`
      return apiError(msg, 400)
    }
    createdOrgId = org.id

    // 2) org_member del usuario actual como pm_owner
    const { error: memberErr } = await supabase.from('org_members').insert({
      org_id: org.id,
      user_id: body.user_id,
      role: 'pm_owner',
    })
    if (memberErr) {
      await rollback(supabase, createdOrgId!)
      return apiError(`Error creando membresía: ${memberErr.message}`, 500)
    }

    // 3) Building
    const { data: bld, error: bldErr } = await supabase
      .from('buildings')
      .insert({
        org_id: org.id,
        name: body.building.name,
        address: body.building.address,
        city: body.building.city,
        state: body.building.state,
        country: body.building.country || 'MX',
        postal_code: body.building.postal_code,
      })
      .select('id')
      .single()
    if (bldErr || !bld) {
      await rollback(supabase, createdOrgId!)
      return apiError(`Error creando edificio: ${bldErr?.message}`, 500)
    }

    // 4) Units (bulk insert)
    const unitInserts = body.units.map((u) => ({
      org_id: org.id,
      building_id: bld.id,
      number: u.number,
      type: u.type,
      floor: u.floor,
      status: 'available',
    }))
    const { data: createdUnits, error: unitsErr } = await supabase
      .from('units')
      .insert(unitInserts)
      .select('id')
    if (unitsErr) {
      await rollback(supabase, createdOrgId!)
      return apiError(`Error creando unidades: ${unitsErr.message}`, 500)
    }

    // 5) Property Owner + ownership_stake (si aplica)
    let ownerId: string | null = null
    if (body.owner_mode !== 'skip' && body.owner) {
      const ownerData = {
        org_id: org.id,
        user_id: body.owner.user_id, // null en modo client, user actual en modo self
        full_name: body.owner.full_name,
        email: body.owner.email,
        phone: body.owner.phone,
        rfc: body.owner.rfc,
      }
      const { data: po, error: poErr } = await supabase
        .from('property_owners')
        .insert(ownerData)
        .select('id')
        .single()
      if (poErr || !po) {
        await rollback(supabase, createdOrgId!)
        return apiError(
          `Error creando Property Owner: ${poErr?.message}`,
          500,
        )
      }
      ownerId = po.id

      const pct = clampPercentage(body.owner.percentage, body.owner_mode)
      const { error: stakeErr } = await supabase.from('ownership_stakes').insert({
        org_id: org.id,
        building_id: bld.id,
        property_owner_id: po.id,
        percentage: pct,
        starts_on: new Date().toISOString().slice(0, 10),
      })
      if (stakeErr) {
        await rollback(supabase, createdOrgId!)
        return apiError(
          `Error creando ownership stake: ${stakeErr.message}`,
          500,
        )
      }
    }

    return apiOk({
      org_id: org.id,
      building_id: bld.id,
      units_created: createdUnits?.length ?? 0,
      property_owner_id: ownerId,
    })
  } catch (err) {
    if (createdOrgId) {
      try {
        const supabase = createServiceClient()
        await rollback(supabase, createdOrgId!)
      } catch {
        // best-effort
      }
    }
    return apiError(
      err instanceof Error ? err.message : 'Error interno',
      500,
    )
  }
}

// Rollback best-effort cuando algún paso falla. Confía en CASCADE de FK.
async function rollback(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
) {
  // Buildings, units, property_owners, ownership_stakes, org_members tienen
  // ON DELETE CASCADE desde organizations.
  await supabase.from('organizations').delete().eq('id', orgId)
}

function clampPercentage(v: number, mode: 'self' | 'client' | 'skip'): number {
  if (mode === 'self') return 100
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return 100
  if (n > 100) return 100
  return Math.round(n * 100) / 100
}
