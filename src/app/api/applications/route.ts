// BaW OS — CRUD de aplicaciones de inquilinos (vista interna Maribel)
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient()
    const orgId = getOrgId()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const unitId = searchParams.get('unit_id')

    let query = supabase
      .from('tenant_applications')
      .select('*, unit:units(id, number, floor, type)')
      .eq('org_id', orgId)

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
    const supabase = createServiceClient()
    const orgId = getOrgId()
    const body = await request.json()

    const { data, error } = await supabase
      .from('tenant_applications')
      .insert({
        org_id: orgId,
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
