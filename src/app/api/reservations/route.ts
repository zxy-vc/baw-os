// BaW OS — Reservations API (Booking Engine)
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const { searchParams } = new URL(request.url)

  let query = supabase
    .from('reservations')
    .select('*, unit:units(*)')
    .eq('organization_id', orgId)
    .order('check_in')

  const unitId = searchParams.get('unit_id')
  if (unitId) query = query.eq('unit_id', unitId)

  const status = searchParams.get('status')
  if (status) query = query.eq('status', status)

  const from = searchParams.get('from')
  if (from) query = query.gte('check_in', from)

  const to = searchParams.get('to')
  if (to) query = query.lte('check_out', to)

  const { data, error } = await query

  if (error) return apiError(error.message, 500)
  return apiOk(data)
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  const { unit_id, guest_name, check_in, check_out, mode, price_per_night, total_price } = body
  if (!unit_id || !guest_name || !check_in || !check_out || !mode || !price_per_night || !total_price) {
    return apiError('unit_id, guest_name, check_in, check_out, mode, price_per_night, and total_price are required')
  }

  const { data, error } = await supabase
    .from('reservations')
    .insert({
      organization_id: orgId,
      unit_id,
      guest_name,
      guest_phone: body.guest_phone || null,
      guest_email: body.guest_email || null,
      check_in,
      check_out,
      mode,
      rooms_count: body.rooms_count || 1,
      beds_count: body.beds_count || 1,
      guests_count: body.guests_count || 1,
      price_per_night,
      total_price,
      status: body.status || 'confirmed',
      payment_status: body.payment_status || 'pending',
      amount_paid: body.amount_paid || 0,
      notes: body.notes || null,
    })
    .select('*, unit:units(*)')
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

  // Prevent overriding org
  delete updates.organization_id

  const { data, error } = await supabase
    .from('reservations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*, unit:units(*)')
    .single()

  if (error) return apiError(error.message, 500)
  return apiOk(data)
}
