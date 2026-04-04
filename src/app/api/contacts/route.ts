// BaW OS — Contacts CRM API
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const { searchParams } = new URL(request.url)

  let query = supabase
    .from('occupants')
    .select('*')
    .eq('org_id', orgId)
    .order('name')

  const search = searchParams.get('search')
  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const type = searchParams.get('type')
  if (type && ['ltr', 'str', 'both'].includes(type)) {
    query = query.eq('type', type)
  }

  const { data: contacts, error } = await query

  if (error) return apiError(error.message, 500)

  // Enrich with reservation count
  const { data: resCounts } = await supabase
    .from('reservations')
    .select('guest_name, guest_email, check_in')
    .eq('organization_id', orgId)
    .order('check_in', { ascending: false })

  const enriched = (contacts || []).map((c) => {
    const matching = (resCounts || []).filter(
      (r) => r.guest_name === c.name || (c.email && r.guest_email === c.email)
    )
    return {
      ...c,
      reservation_count: matching.length,
      last_reservation: matching[0]?.check_in || null,
    }
  })

  return apiOk(enriched)
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  const { name } = body
  if (!name) return apiError('name is required')

  const { data, error } = await supabase
    .from('occupants')
    .insert({
      org_id: orgId,
      name,
      phone: body.phone || null,
      email: body.email || null,
      type: body.type || 'both',
      notes: body.notes || null,
    })
    .select()
    .single()

  if (error) return apiError(error.message, 500)
  return apiOk(data)
}

export async function PATCH(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  const { id, ...updates } = body
  if (!id) return apiError('id is required')

  delete updates.org_id

  const { data, error } = await supabase
    .from('occupants')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return apiError(error.message, 500)
  return apiOk(data)
}

export async function DELETE(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)

  const id = searchParams.get('id')
  if (!id) return apiError('id query param is required')

  const { error } = await supabase
    .from('occupants')
    .delete()
    .eq('id', id)

  if (error) return apiError(error.message, 500)
  return apiOk({ deleted: id })
}
