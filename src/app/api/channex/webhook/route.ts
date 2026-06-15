// BaW OS — Channex webhook receiver for real-time booking events
//
// Sprint 5 / fix #22: ahora resuelve el org desde header `x-baw-org-id`,
// `x-baw-org-slug`, query `?org=<slug>` o body `{org_id, org_slug}` en lugar
// de "primera org por created_at". Configurar Channex para incluir el org
// del tenant en la URL del webhook (e.g. `/api/channex/webhook?org=baw-operations`).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/api-auth'
import { resolveOrgIdForWebhook } from '@/lib/org-context'

export const dynamic = 'force-dynamic'

function mapChannel(source: string | undefined): string {
  if (!source) return 'direct'
  const s = source.toLowerCase()
  if (s.includes('airbnb')) return 'airbnb'
  if (s.includes('booking')) return 'booking'
  return s
}

export async function POST(request: NextRequest) {
  try {
    // Audit 2026-06-12: el webhook era público — cualquiera podía inyectar o
    // cancelar reservas con ?org=<slug>. Channex no firma webhooks, así que
    // exigimos un token compartido en la URL: configurar en Channex la URL
    // `/api/channex/webhook?org=<slug>&token=<CHANNEX_WEBHOOK_SECRET>`.
    const secret = process.env.CHANNEX_WEBHOOK_SECRET
    if (!secret) {
      return NextResponse.json(
        { success: false, error: 'CHANNEX_WEBHOOK_SECRET not configured' },
        { status: 503 },
      )
    }
    const token =
      request.nextUrl.searchParams.get('token') ??
      request.headers.get('x-channex-token')
    if (token !== secret) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

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
    const orgId = await resolveOrgIdForWebhook(request, body)
    if (!orgId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Missing org context. Configure Channex webhook URL with ?org=<slug> or send x-baw-org-id header.',
        },
        { status: 400 },
      )
    }

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
        organization_id: orgId,
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
