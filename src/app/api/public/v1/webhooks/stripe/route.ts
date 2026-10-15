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

  // ── Idempotency: skip events whose side effect completed previously ──────
  // Do not write this marker before promotion: a marker created before a failed
  // INSERT makes Stripe retries no-ops and is the paid-without-reservation bug.
  const { data: previouslyProcessed, error: processedLookupErr } = await svc
    .from('stripe_processed_events')
    .select('event_id')
    .eq('event_id', eventId)
    .maybeSingle()

  if (processedLookupErr) {
    console.log(
      `action=stripe_webhook event_id=${eventId} error=processed_event_lookup msg=${processedLookupErr.message}`,
    )
    return NextResponse.json({ error: 'Could not verify webhook idempotency' }, { status: 500 })
  }

  if (previouslyProcessed) {
    console.log(`action=stripe_webhook event_id=${eventId} status=already_processed`)
    return ack('already processed')
  }

  // ── Route events ──────────────────────────────────────────────────────────
  try {
    switch (eventType) {
      case 'checkout.session.completed': {
        await handleSessionCompleted(
          JSON.parse(JSON.stringify(event.data.object)) as Record<string, unknown>,
          event.created,
          svc,
        )
        break
      }
      case 'checkout.session.expired': {
        await handleSessionExpired(
          JSON.parse(JSON.stringify(event.data.object)) as Record<string, unknown>,
          svc,
        )
        break
      }
      default: {
        console.log(`action=stripe_webhook event_id=${eventId} event_type=${eventType} status=ignored`)
      }
    }

    // Record only after the side effect succeeded. Concurrent delivery is safe:
    // fn_promote_paid_reservation is idempotent by Stripe Checkout session id.
    const { error: insertErr } = await svc.from('stripe_processed_events').insert({
      event_id: eventId,
      event_type: eventType,
      payload: JSON.parse(JSON.stringify(event)) as Record<string, unknown>,
    })
    if (insertErr && insertErr.code !== '23505') {
      throw new Error(`Could not record processed webhook event: ${insertErr.message}`)
    }

    return ack()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown webhook processing error'
    await recordPromotionFailure(eventId, eventType, event.data.object, msg, svc)
    // A non-2xx response makes Stripe retry. The hold remains intact because
    // the promotion RPC inserts the reservation and deletes the hold atomically.
    console.log(`action=stripe_webhook event_id=${eventId} event_type=${eventType} error=processing_failed msg=${msg}`)
    return NextResponse.json({ error: 'Webhook processing failed; Stripe will retry' }, { status: 500 })
  }
}

// ── checkout.session.completed → promote hold to confirmed reservation ────────
async function handleSessionCompleted(
  session: Record<string, unknown>,
  eventCreated: number,
  svc: ReturnType<typeof createServiceClient>,
) {
  const sessionId = session.id as string
  const paymentStatus = session.payment_status
  const amountTotal = typeof session.amount_total === 'number' ? session.amount_total : null

  console.log(`action=session_completed session_id=${sessionId} payment_status=${paymentStatus}`)

  if (!sessionId || amountTotal === null) {
    throw new Error('Stripe Checkout session is missing id or amount_total')
  }
  if (paymentStatus !== 'paid') {
    throw new Error(`Checkout session completed with payment_status=${String(paymentStatus)}`)
  }
  if (session.currency !== 'mxn') {
    throw new Error(`Checkout session currency=${String(session.currency)} is not mxn`)
  }

  const totalMxn = amountTotal / 100 // Stripe stores MXN in centavos
  const { data, error } = await svc.rpc('fn_promote_paid_reservation', {
    p_stripe_session_id: sessionId,
    p_amount_paid: totalMxn,
    // Signed event timestamp = when the session completed. The RPC refuses a
    // hold that had already expired when the guest paid.
    p_paid_at: new Date(eventCreated * 1000).toISOString(),
  })

  if (error) throw new Error(`Reservation promotion failed: ${error.message}`)

  const promotion = Array.isArray(data) ? data[0] : data
  console.log(`action=session_completed session_id=${sessionId} reservation_id=${promotion?.reservation_id ?? 'unknown'} status=${promotion?.already_promoted ? 'already_promoted' : 'promoted'}`)
}

// Persist a reconciliation item as well as returning 500 to Stripe. A failed
// webhook must remain visible after Stripe's retry window ends; operations can
// alert from this table without treating a failed promotion as processed.
async function recordPromotionFailure(
  eventId: string,
  eventType: string,
  object: unknown,
  errorMessage: string,
  svc: ReturnType<typeof createServiceClient>,
) {
  if (eventType !== 'checkout.session.completed') return

  const sessionId =
    object && typeof object === 'object' && typeof (object as Record<string, unknown>).id === 'string'
      ? (object as Record<string, unknown>).id as string
      : null
  if (!sessionId) return

  const { error } = await svc.from('public_booking_payment_failures').upsert(
    {
      stripe_session_id: sessionId,
      stripe_event_id: eventId,
      last_error: errorMessage,
      last_failed_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_session_id' },
  )

  if (error) {
    // Migration drift must not turn a Stripe retryable 500 into an uncaught
    // webhook error. The original failure is still logged and retried.
    console.log(`action=stripe_webhook event_id=${eventId} error=reconciliation_write msg=${error.message}`)
  }
}

// ── checkout.session.expired → release hold ───────────────────────────────────
async function handleSessionExpired(
  session: Record<string, unknown>,
  svc: ReturnType<typeof createServiceClient>,
) {
  const sessionId = session.id as string

  console.log(`action=session_expired session_id=${sessionId}`)

  if (!sessionId) {
    console.log('action=session_expired error=missing_session_id')
    return
  }

  // Match on the session the hold was linked to, so this event can only ever
  // release the hold of that unpaid session.
  const { error } = await svc.from('reservation_holds').delete().eq('stripe_session_id', sessionId)
  if (error) throw new Error(`Could not release hold for expired session: ${error.message}`)

  console.log(`action=session_expired session_id=${sessionId} status=hold_deleted`)
}
