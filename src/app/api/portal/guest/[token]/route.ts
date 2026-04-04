import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zlcgxmllaeweypyodvzk.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsY2d4bWxsYWV3ZXlweW9kdnprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODE3OTYsImV4cCI6MjA5MDE1Nzc5Nn0.2i0sxb5JCCFiWxhDt9ElC5-EZE64JEg_uw_tHi4BGmI'

function createPortalClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params
  const supabase = createPortalClient()

  // Fetch reservation by guest_token
  const { data: reservation, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('guest_token', token)
    .single()

  if (error || !reservation) {
    return NextResponse.json(
      { error: 'Token inválido o expirado' },
      { status: 404 }
    )
  }

  // Fetch unit data
  const { data: unit } = reservation.unit_id
    ? await supabase
        .from('units')
        .select('number, floor, type')
        .eq('id', reservation.unit_id)
        .single()
    : { data: null }

  return NextResponse.json({
    reservation: {
      id: reservation.id,
      guest_name: reservation.guest_name,
      guest_email: reservation.guest_email,
      guest_phone: reservation.guest_phone,
      check_in: reservation.check_in,
      check_out: reservation.check_out,
      guests_count: reservation.guests_count,
      total_price: reservation.total_price,
      platform: reservation.platform,
      status: reservation.status,
      check_in_code: reservation.check_in_code,
      wifi_name: reservation.wifi_name,
      wifi_password: reservation.wifi_password,
      house_rules: reservation.house_rules,
      check_in_instructions: reservation.check_in_instructions,
      notes: reservation.notes,
    },
    unit: unit
      ? { unit_number: unit.number, floor: unit.floor, type: unit.type }
      : null,
  })
}
