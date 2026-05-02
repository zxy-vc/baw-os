// BaW OS — Sync Channex bookings → Supabase reservations
//
// Sprint 5 / fix #22: el cron debe llamarse con `?org=<slug>` o
// `x-baw-org-id` para indicar a qué tenant sincronizar. Si el caller no
// provee org y solo hay 1 tenant en el sistema, lo usa automáticamente;
// si hay 2+ tenants devuelve 400 (cada tenant Channex tiene su propio
// cron URL con su org).
import { NextRequest, NextResponse } from 'next/server'
import { channexFetch } from '@/lib/channex'
import { createServiceClient } from '@/lib/api-auth'
import { resolveOrgIdForWebhook, listAllOrgIds } from '@/lib/org-context'

export const dynamic = 'force-dynamic'

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

export async function POST(request: NextRequest) {
  try {
    let orgId = await resolveOrgIdForWebhook(request, null)
    if (!orgId) {
      const allOrgs = await listAllOrgIds()
      if (allOrgs.length === 1) {
        orgId = allOrgs[0]
      } else {
        return NextResponse.json(
          {
            success: false,
            error:
              'Missing org context. Pass ?org=<slug> or x-baw-org-id header (multi-tenant safe).',
          },
          { status: 400 },
        )
      }
    }
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
    const ORG_ID = orgId
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
