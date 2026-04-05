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

  // Enrich with reservation count — indexed lookup O(n+m) instead of O(n×m)
  const names = (contacts || []).map((c) => c.name).filter(Boolean)
  const emails = (contacts || []).map((c) => c.email).filter(Boolean)

  if (!contacts?.length) return apiOk([])

  const { data: resCounts } = await supabase
    .from('reservations')
    .select('guest_name, guest_email, check_in')
    .eq('organization_id', orgId)
    .or(`guest_name.in.(${names.map((n: string) => `"${n}"`).join(',')}),guest_email.in.(${emails.map((e: string) => `"${e}"`).join(',')})`)
    .order('check_in', { ascending: false })

  // Build lookup maps for O(1) access
  const countByName = new Map<string, { count: number; last: string | null }>()
  const countByEmail = new Map<string, { count: number; last: string | null }>()

  for (const r of resCounts || []) {
    if (r.guest_name) {
      const entry = countByName.get(r.guest_name)
      if (entry) { entry.count++ }
      else { countByName.set(r.guest_name, { count: 1, last: r.check_in }) }
    }
    if (r.guest_email) {
      const entry = countByEmail.get(r.guest_email)
      if (entry) { entry.count++ }
      else { countByEmail.set(r.guest_email, { count: 1, last: r.check_in }) }
    }
  }

  const enriched = contacts.map((c) => {
    const byName = countByName.get(c.name)
    const byEmail = c.email ? countByEmail.get(c.email) : undefined
    const reservation_count = Math.max(byName?.count || 0, byEmail?.count || 0)
    const last_reservation = byName?.last || byEmail?.last || null
    return { ...c, reservation_count, last_reservation }
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
