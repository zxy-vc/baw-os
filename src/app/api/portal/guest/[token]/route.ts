// BaW OS — Guest Portal API: datos de reservación para huéspedes STR
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
  const supabase = createPortalClient()

  // Buscar reservación por guest_token
  const { data: reservation, error } = await supabase
    .from('reservations')
    .select('id, guest_name, check_in, check_out, guests_count, status, unit_id, wifi_name, wifi_password, access_code, arrival_instructions, checkin_time, checkout_time')
    .eq('guest_token', params.token)
    .single()

  if (error || !reservation) {
    return NextResponse.json({ error: 'Reservación no encontrada' }, { status: 404 })
  }

  // Solo reservaciones confirmadas o checked_in
  if (reservation.status !== 'confirmed' && reservation.status !== 'checked_in') {
    return NextResponse.json({ error: 'Reservación no disponible' }, { status: 404 })
  }

  // Buscar datos de la unidad
  const { data: unit } = await supabase
    .from('units')
    .select('number, floor, type')
    .eq('id', reservation.unit_id)
    .single()

  return NextResponse.json({
    reservation: {
      id: reservation.id,
      guest_name: reservation.guest_name,
      check_in: reservation.check_in,
      check_out: reservation.check_out,
      guests_count: reservation.guests_count,
      status: reservation.status,
    },
    unit: unit ? { number: unit.number, floor: unit.floor, type: unit.type } : null,
    portal_info: {
      wifi_name: reservation.wifi_name,
      wifi_password: reservation.wifi_password,
      access_code: reservation.access_code,
      arrival_instructions: reservation.arrival_instructions,
      checkin_time: reservation.checkin_time || '15:00',
      checkout_time: reservation.checkout_time || '12:00',
    },
  })
}
