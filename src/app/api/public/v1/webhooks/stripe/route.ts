import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/public-booking/supabase-public'
import { getStripePublic } from '@/lib/public-booking/stripe-public'

export const runtime = 'nodejs'

// Disable Next.js body parser — Stripe requires the raw body for signature verification
export const dynamic = 'force-dynamic'

// ACK shape
const ack = (message = 'ok') => NextResponse.json({ received: true, message })

export async function POST(request: NextRequest) {
  // Raw body is mandatory for Stripe signature verification
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    console.log('action=stripe_webhook error=missing_signature')
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_PUBLIC
  if (!webhookSecret) {
    console.log('action=stripe_webhook error=missing_webhook_secret')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  let event
  try {
    const stripe = getStripePublic()
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Signature verification failed'
    console.log(`action=stripe_webhook error=invalid_signature msg=${msg}`)
    return NextResponse.json({ error: `Webhook signature invalid: ${msg}` }, { status: 400 })
  }

  const svc = createServiceClient()
  const eventId = event.id
  const eventType = event.type

  console.log(`action=stripe_webhook event_id=${eventId} event_type=${eventType}`)

  // ── Idempotency: skip if already processed ──────────────────────────────
  const { error: insertErr } = await svc.from('stripe_processed_events').insert(
    {
      event_id: eventId,
      event_type: eventType,
      payload: JSON.parse(JSON.stringify(event)) as Record<string, unknown>,
    },
  ).select()

  // Primary key conflict = already processed
  if (insertErr && insertErr.code === '23505') {
    console.log(`action=stripe_webhook event_id=${eventId} status=already_processed`)
    return ack('already processed')
  }
  if (insertErr) {
    console.log(`action=stripe_webhook event_id=${eventId} error=insert_fail msg=${insertErr.message}`)
    // Non-idempotency error — still try to process but log
  }

  // ── Route events ──────────────────────────────────────────────────────────
  switch (eventType) {
    case 'checkout.session.completed': {
      await handleSessionCompleted(JSON.parse(JSON.stringify(event.data.object)) as Record<string, unknown>, svc)
      break
    }
    case 'checkout.session.expired': {
      await handleSessionExpired(JSON.parse(JSON.stringify(event.data.object)) as Record<string, unknown>, svc)
      break
    }
    default: {
      console.log(`action=stripe_webhook event_id=${eventId} event_type=${eventType} status=ignored`)
    }
  }

  return ack()
}

// ── checkout.session.completed → promote hold to confirmed reservation ────────
async function handleSessionCompleted(
  session: Record<string, unknown>,
  svc: ReturnType<typeof createServiceClient>,
) {
  const sessionId = session.id as string
  const metadata = (session.metadata ?? {}) as Record<string, string>
  const holdId = metadata.hold_id
  const unitId = metadata.unit_id
  const from = metadata.from
  const to = metadata.to
  const guestName = metadata.guest_name ?? ''
  const guestEmail = metadata.guest_email ?? ''
  const guestPhone = metadata.guest_phone ?? ''
  const amountTotal = typeof session.amount_total === 'number' ? session.amount_total : 0

  console.log(
    `action=session_completed session_id=${sessionId} hold_id=${holdId} unit_id=${unitId}`,
  )

  if (!holdId || !unitId || !from || !to) {
    console.log(`action=session_completed session_id=${sessionId} error=missing_metadata`)
    return
  }

  // Fetch hold to get guests_count
  const { data: hold } = await svc
    .from('reservation_holds')
    .select('guests_count')
    .eq('id', holdId)
    .single()

  const guestsCount = hold?.guests_count ?? 1
  const totalMxn = amountTotal / 100 // Stripe stores in centavos

  // Insert reservation (confirmed)
  const { error: resErr } = await svc.from('reservations').insert({
    unit_id: unitId,
    check_in: from,
    check_out: to,
    guest_name: guestName,
    guest_email: guestEmail,
    guest_phone: guestPhone,
    mode: 'direct',
    total_price: totalMxn,
    amount_paid: totalMxn,
    status: 'confirmed',
    payment_status: 'paid',
    notes: `Stripe session: ${sessionId} | Hold: ${holdId} | Guests: ${guestsCount}`,
  })

  if (resErr) {
    // Could be GIST conflict (double-booking attempt) — log and alert
    console.log(
      `action=session_completed session_id=${sessionId} hold_id=${holdId} error=reservation_insert err=${resErr.code} msg=${resErr.message}`,
    )
    // Do NOT delete hold — leave for manual reconciliation
    return
  }

  // Delete hold
  await svc.from('reservation_holds').delete().eq('id', holdId)

  console.log(
    `action=session_completed session_id=${sessionId} hold_id=${holdId} unit_id=${unitId} status=promoted`,
  )
}

// ── checkout.session.expired → delete hold ────────────────────────────────────
async function handleSessionExpired(
  session: Record<string, unknown>,
  svc: ReturnType<typeof createServiceClient>,
) {
  const sessionId = session.id as string
  const metadata = (session.metadata ?? {}) as Record<string, string>
  const holdId = metadata.hold_id

  console.log(`action=session_expired session_id=${sessionId} hold_id=${holdId}`)

  if (!holdId) {
    console.log(`action=session_expired session_id=${sessionId} error=no_hold_id_in_metadata`)
    return
  }

  const { error } = await svc.from('reservation_holds').delete().eq('id', holdId)
  if (error) {
    console.log(`action=session_expired hold_id=${holdId} error=${error.message}`)
  } else {
    console.log(`action=session_expired hold_id=${holdId} status=hold_deleted`)
  }
}
