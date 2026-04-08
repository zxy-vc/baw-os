// BaW OS — Channex webhook receiver for real-time booking events
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const ORG_ID = 'ed4308c7-2bdb-46f2-be69-7c59674838e2'

function mapChannel(source: string | undefined): string {
  if (!source) return 'direct'
  const s = source.toLowerCase()
  if (s.includes('airbnb')) return 'airbnb'
  if (s.includes('booking')) return 'booking'
  return s
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const event = body.event || body.type
    const payload = body.payload || body.data || body

    const bookingId = payload.id || payload.booking_id
    if (!bookingId) {
      return NextResponse.json(
        { success: false, error: 'Missing booking id' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    const a = payload.attributes || payload

    if (event === 'booking.cancelled' || event === 'booking_cancelled') {
      const { error } = await supabase
        .from('reservations')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('external_id', bookingId)

      if (error) throw error
      return NextResponse.json({ success: true, data: { action: 'cancelled' } })
    }

    // booking.created or booking.modified → upsert
    const checkIn = a.arrival_date || a.check_in
    const checkOut = a.departure_date || a.check_out
    const nights =
      checkIn && checkOut
        ? Math.max(
            1,
            Math.ceil(
              (new Date(checkOut).getTime() - new Date(checkIn).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          )
        : 1
    const amount = Number(a.amount) || 0

    const { error } = await supabase.from('reservations').upsert(
      {
        external_id: bookingId,
        organization_id: ORG_ID,
        guest_name: a.guest_name || 'Huésped Channex',
        check_in: checkIn,
        check_out: checkOut,
        channel: mapChannel(a.source),
        status: 'confirmed',
        mode: 'full',
        price_per_night: nights > 0 ? amount / nights : 0,
        total_price: amount,
        payment_status: 'pending',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'external_id' }
    )
    if (error) throw error

    return NextResponse.json({
      success: true,
      data: { action: event === 'booking.modified' ? 'modified' : 'created' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 }
    )
  }
}
