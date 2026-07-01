// BaW OS — CRUD de aplicaciones de inquilinos (vista interna Maribel)
import { NextRequest } from 'next/server'
import { createServiceClient, apiError, apiOk } from '@/lib/api-auth'
import { requireMemberCaller } from '@/lib/admin-auth'

export async function GET(request: NextRequest) {
  try {
    // Guard: solo miembros de la org. Antes NO había auth y expedientes (PII de
    // aplicantes: nombre, aval, ingresos) quedaban expuestos a internet.
    const auth = await requireMemberCaller()
    if (!auth.ok) return apiError(auth.message, auth.status)

    const supabase = createServiceClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const unitId = searchParams.get('unit_id')

    let query = supabase
      .from('tenant_applications')
      .select('*, unit:units(id, number, floor, type)')
      .eq('org_id', auth.orgId)

    if (status) query = query.eq('status', status)
    if (unitId) query = query.eq('unit_id', unitId)

    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) return apiError(error.message, 500)
    return apiOk(data)
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Error interno', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMemberCaller()
    if (!auth.ok) return apiError(auth.message, auth.status)

    const supabase = createServiceClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from('tenant_applications')
      .insert({
        org_id: auth.orgId,
        unit_id: body.unit_id || null,
        contract_type: body.contract_type || null,
      })
      .select()
      .single()

    if (error) return apiError(error.message, 500)

    // Generar link público
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://baw-os.vercel.app'
    const link = `${appUrl}/apply/${data.token}`

    return apiOk({ ...data, link })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Error interno', 500)
  }
}
