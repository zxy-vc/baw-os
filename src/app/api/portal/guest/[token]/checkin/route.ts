import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function createPortalClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params
  const supabase = createPortalClient()

  let body: {
    nameConfirmed: boolean
    rulesAccepted: boolean
    vehiclePlate: string
    vehicleModel: string
    emergencyName: string
    emergencyPhone: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  // Look up reservation by guest_token
  const { data: reservation, error } = await supabase
    .from('reservations')
    .select('id, notes')
    .eq('guest_token', token)
    .single()

  if (error || !reservation) {
    return NextResponse.json(
      { error: 'Token invalido o expirado' },
      { status: 404 }
    )
  }

  // Build check-in note
  const parts: string[] = ['Digital check-in completado.']
  if (body.vehiclePlate || body.vehicleModel) {
    parts.push(`Vehiculo: ${body.vehiclePlate || ''} ${body.vehicleModel || ''}`.trim())
  }
  if (body.emergencyName || body.emergencyPhone) {
    parts.push(`Emergencia: ${body.emergencyName || ''} ${body.emergencyPhone || ''}`.trim())
  }
  const checkInNote = parts.join(' ')

  // Append to existing notes
  const existingNotes = reservation.notes || ''
  const updatedNotes = existingNotes
    ? `${existingNotes}\n${checkInNote}`
    : checkInNote

  // Update reservation
  const { error: updateError } = await supabase
    .from('reservations')
    .update({
      status: 'checked_in',
      notes: updatedNotes,
    })
    .eq('id', reservation.id)

  if (updateError) {
    return NextResponse.json(
      { error: 'Error al actualizar la reservacion' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
