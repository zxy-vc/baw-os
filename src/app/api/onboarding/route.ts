// BaW OS — Onboarding Wizard API
import { NextRequest } from 'next/server'
import { createServiceClient, getOrgId, apiOk, apiError } from '@/lib/api-auth'

interface OnboardingBody {
  building: { name: string; address: string; city: string }
  units: Array<{ number: string; type: 'STR' | 'MTR' | 'LTR'; floor: number }>
  tenants: Array<{
    name: string
    phone?: string
    unit_number: string
    monthly_amount: number
    start_date: string
  }>
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as OnboardingBody
    const supabase = createServiceClient()
    const orgId = getOrgId()

    if (!body.units || body.units.length === 0) {
      return apiError('Se requiere al menos una unidad', 400)
    }

    // 1. Crear unidades
    const unitInserts = body.units.map((u) => ({
      org_id: orgId,
      number: u.number,
      type: u.type,
      floor: u.floor,
      status: 'available',
      notes: `Creada via onboarding — ${body.building.name}`,
    }))

    const { data: createdUnits, error: unitsErr } = await supabase
      .from('units')
      .insert(unitInserts)
      .select('id, number')

    if (unitsErr) return apiError(`Error creando unidades: ${unitsErr.message}`, 500)

    // Mapa número → id para enlazar inquilinos
    const unitMap = new Map<string, string>()
    for (const u of createdUnits || []) {
      unitMap.set(u.number, u.id)
    }

    // 2. Crear inquilinos y contratos
    let contractsCreated = 0
    for (const t of body.tenants || []) {
      const unitId = unitMap.get(t.unit_number)
      if (!unitId || !t.name) continue

      // Crear occupant
      const { data: occ, error: occErr } = await supabase
        .from('occupants')
        .insert({
          org_id: orgId,
          name: t.name,
          phone: t.phone || null,
          type: 'tenant',
        })
        .select('id')
        .single()

      if (occErr || !occ) continue

      // Crear contrato activo
      const { error: cErr } = await supabase.from('contracts').insert({
        org_id: orgId,
        unit_id: unitId,
        occupant_id: occ.id,
        monthly_amount: t.monthly_amount,
        payment_day: 1,
        start_date: t.start_date,
        status: 'active',
      })

      if (!cErr) {
        contractsCreated++
        // Marcar unidad como ocupada
        await supabase.from('units').update({ status: 'occupied' }).eq('id', unitId)
      }
    }

    return apiOk({ units_created: createdUnits?.length || 0, contracts_created: contractsCreated })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Error interno', 500)
  }
}
