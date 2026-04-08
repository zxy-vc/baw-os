// BaW OS — Sync Channex bookings → Supabase reservations
import { NextResponse } from 'next/server'
import { channexFetch } from '@/lib/channex'
import { createServiceClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const ORG_ID = 'ed4308c7-2bdb-46f2-be69-7c59674838e2'

interface ChannexBooking {
  id: string
  attributes: {
    property_id?: string
    room_type_id?: string
    guest_name?: string
    arrival_date?: string
    departure_date?: string
    source?: string
    status?: string
    amount?: number | string
  }
}

function mapChannel(source: string | undefined): string {
  if (!source) return 'direct'
  const s = source.toLowerCase()
  if (s.includes('airbnb')) return 'airbnb'
  if (s.includes('booking')) return 'booking'
  return s
}

function mapStatus(status: string | undefined): string {
  switch (status) {
    case 'confirmed':
    case 'new':
      return 'confirmed'
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    case 'modified':
      return 'confirmed'
    default:
      return 'confirmed'
  }
}

export async function POST() {
  try {
    const now = new Date()
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const params = new URLSearchParams({
      filter: JSON.stringify({
        date_from: from.toISOString().slice(0, 10),
        date_to: now.toISOString().slice(0, 10),
      }),
    })

    const response = await channexFetch<{ data: ChannexBooking[] }>(
      `/bookings?${params}`
    )
    const bookings = response.data || []

    const supabase = createServiceClient()
    let synced = 0
    let errors = 0

    for (const booking of bookings) {
      try {
        const a = booking.attributes
        const checkIn = a.arrival_date || now.toISOString().slice(0, 10)
        const checkOut = a.departure_date || now.toISOString().slice(0, 10)
        const nights = Math.max(
          1,
          Math.ceil(
            (new Date(checkOut).getTime() - new Date(checkIn).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
        const amount = Number(a.amount) || 0

        const { error } = await supabase.from('reservations').upsert(
          {
            external_id: booking.id,
            organization_id: ORG_ID,
            guest_name: a.guest_name || 'Huésped Channex',
            check_in: checkIn,
            check_out: checkOut,
            channel: mapChannel(a.source),
            status: mapStatus(a.status),
            mode: 'full',
            price_per_night: nights > 0 ? amount / nights : 0,
            total_price: amount,
            payment_status: 'pending',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'external_id' }
        )
        if (error) throw error
        synced++
      } catch {
        errors++
      }
    }

    return NextResponse.json({ success: true, data: { synced, errors } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 502 }
    )
  }
}
