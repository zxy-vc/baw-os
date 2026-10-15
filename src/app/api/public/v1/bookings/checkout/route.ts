import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient, createServiceClient } from '@/lib/public-booking/supabase-public'
import { createCheckoutSession, getStripePublic } from '@/lib/public-booking/stripe-public'
import {
  featureDisabled,
  handlePreflight,
  withCors,
  rateLimitExceeded,
  errorResponse,
} from '@/lib/public-booking/cors'
import { rateLimitByIp } from '@/lib/public-booking/rate-limit'
import { CheckoutRequest, CheckoutResponse } from '@/lib/public-booking/schemas'
import { computeQuote } from '@/lib/public-booking/pricing'

export const runtime = 'nodejs'

// The Checkout session must close before the hold does, so a guest can never
// pay for nights that were already released. Stripe's minimum session lifetime
// is 30 min (31 leaves headroom for clock drift); the 29 extra hold minutes
// cover webhook delivery. checkout.session.expired releases the hold earlier.
const CHECKOUT_SESSION_TTL_MS = 31 * 60_000
const HOLD_TTL_MS = 60 * 60_000

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request.headers.get('origin'))
}

export async function POST(request: NextRequest) {
  if (process.env.PUBLIC_BOOKING_ENABLED !== 'true') return featureDisabled()

  const origin = request.headers.get('origin')
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  const rl = rateLimitByIp('bookings-checkout', ip, 10)
  if (!rl.allowed) return withCors(rateLimitExceeded(), origin)

  // Idempotency key is mandatory
  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim()
  if (!idempotencyKey) {
    return withCors(
      errorResponse('MISSING_IDEMPOTENCY_KEY', 'Header "Idempotency-Key" is required'),
      origin,
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return withCors(errorResponse('INVALID_JSON', 'Request body must be JSON'), origin)
  }

  const parsed = CheckoutRequest.safeParse(body)
  if (!parsed.success) {
    return withCors(
      errorResponse('INVALID_PARAMS', parsed.error.errors[0]?.message ?? 'Invalid params'),
      origin,
    )
  }

  const { unit_slug, from, to, guests, guest } = parsed.data
  const svc = createServiceClient()

  console.log(
    `action=checkout_start unit=${unit_slug} from=${from} to=${to} guests=${guests} idem=${idempotencyKey} ip=${ip}`,
  )

  // ── Capa 1: check idempotency cache ──────────────────────────────────────
  const { data: cached } = await svc
    .from('checkout_idempotency')
    .select('response, expires_at')
    .eq('key', idempotencyKey)
    .single()

  if (cached && new Date(cached.expires_at) > new Date()) {
    // The cache row lives 24 h but its Checkout session only 31 min. Never
    // hand back a dead payment URL: the client must start over with a new key
    // (reusing this one would hit the hold's and Stripe's idempotency keys).
    const cachedResponse = cached.response as Partial<CheckoutResponse> | null
    if (cachedResponse?.expires_at && new Date(cachedResponse.expires_at) <= new Date()) {
      console.log(`action=checkout_start idem=${idempotencyKey} status=cache_hit_session_expired`)
      const released = cachedResponse.session_id
        ? await releaseExpiredCheckout(cachedResponse.session_id, svc)
        : 'released' // legacy cache row without session id: nothing to check
      if (released === 'paid') {
        return withCors(
          errorResponse('CHECKOUT_COMPLETED', 'This checkout was already paid.', 409),
          origin,
        )
      }
      if (released === 'unknown') {
        // Keep the key: its hold is still in place, and only a retry with this
        // same key can re-check the session and release it.
        return withCors(
          errorResponse('CHECKOUT_STATUS_UNAVAILABLE', 'Could not verify the previous checkout. Please retry.', 503),
          origin,
        )
      }
      return withCors(
        errorResponse('CHECKOUT_EXPIRED', 'Checkout session expired. Retry with a new Idempotency-Key.', 409),
        origin,
      )
    }
    console.log(`action=checkout_start idem=${idempotencyKey} status=cache_hit`)
    return withCors(NextResponse.json({ data: cached.response }), origin)
  }

  // ── Resolve unit ──────────────────────────────────────────────────────────
  const anon = createAnonClient()
  const { data: unit, error: unitErr } = await anon
    .from('v_public_units')
    .select('id, slug, building_slug, name, base_rate_mxn, cleaning_fee_mxn, max_guests, min_nights')
    .eq('slug', unit_slug)
    .single()

  if (unitErr || !unit) {
    return withCors(
      errorResponse('UNIT_NOT_FOUND', `Unit "${unit_slug}" not found`, 404),
      origin,
    )
  }

  // The public view deliberately does not expose tenant ownership. Resolve it
  // through the service client and persist it in the hold before a customer can
  // be sent to Stripe. The webhook must never derive tenant context from
  // client-visible metadata.
  const { data: unitOwnership, error: unitOwnershipErr } = await svc
    .from('units')
    .select('org_id')
    .eq('id', unit.id)
    .single()

  if (unitOwnershipErr || !unitOwnership?.org_id) {
    console.log(
      `action=checkout_start unit=${unit_slug} error=unit_organization_missing msg=${unitOwnershipErr?.message ?? 'org_id missing'}`,
    )
    return withCors(errorResponse('UNIT_CONFIGURATION_ERROR', 'Unit is not configured for booking', 500), origin)
  }

  // ── Availability check ────────────────────────────────────────────────────
  const { data: isAvailable } = await svc.rpc('fn_unit_is_available', {
    p_unit_id: unit.id,
    p_from: from,
    p_to: to,
  })

  if (!isAvailable) {
    return withCors(
      errorResponse('UNIT_UNAVAILABLE', 'Unit is not available for the requested dates', 409),
      origin,
    )
  }

  // ── Compute quote ─────────────────────────────────────────────────────────
  let quote
  try {
    quote = computeQuote(unit, from, to, guests)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Quote computation failed'
    return withCors(errorResponse('QUOTE_ERROR', msg), origin)
  }

  // ── Create hold (outlives the Checkout session) ─────────────────────────────
  const now = Date.now()
  const { data: hold, error: holdErr } = await svc
    .from('reservation_holds')
    .insert({
      unit_id: unit.id,
      organization_id: unitOwnership.org_id,
      from_date: from,
      to_date: to,
      guests_count: guests,
      guest_name: guest.name,
      guest_email: guest.email,
      guest_phone: guest.phone ?? null,
      // Snapshot the price accepted by the customer. It must not be recomputed
      // after payment because the unit's public rate may have changed.
      price_per_night: Math.round((quote.subtotal_mxn / quote.nights) * 100) / 100,
      total_price: quote.total_mxn,
      booking_mode: 'full',
      idempotency_key: idempotencyKey,
      expires_at: new Date(now + HOLD_TTL_MS).toISOString(),
    })
    .select('id, expires_at')
    .single()

  if (holdErr || !hold) {
    // Could be a GIST conflict (dates already held) or duplicate idempotency key
    const msg =
      holdErr?.code === '23P01'
        ? 'Unit dates were just taken by another booking. Please choose different dates.'
        : holdErr?.message ?? 'Failed to create hold'
    console.log(`action=checkout_hold unit=${unit_slug} error=${holdErr?.code} msg=${msg}`)
    return withCors(
      errorResponse('HOLD_FAILED', msg, holdErr?.code === '23P01' ? 409 : 500),
      origin,
    )
  }

  console.log(
    `action=checkout_hold unit=${unit_slug} hold_id=${hold.id} expires=${hold.expires_at}`,
  )

  // ── Create Stripe Checkout Session ────────────────────────────────────────
  let session
  try {
    session = await createCheckoutSession({
      unitName: unit.name ?? unit_slug,
      buildingSlug: unit.building_slug,
      nights: quote.nights,
      from,
      to,
      guests,
      totalMxn: quote.total_mxn,
      metadata: {
        hold_id: hold.id,
        unit_id: unit.id,
        unit_slug,
        from,
        to,
        guests: String(guests),
        guest_name: guest.name,
        guest_email: guest.email,
        guest_phone: guest.phone ?? '',
      },
      idempotencyKey,
      expiresAt: Math.floor((now + CHECKOUT_SESSION_TTL_MS) / 1000),
    })
  } catch (err: unknown) {
    // Cleanup hold on Stripe failure
    await svc.from('reservation_holds').delete().eq('id', hold.id)
    const msg = err instanceof Error ? err.message : 'Stripe session creation failed'
    console.log(`action=checkout_stripe_fail unit=${unit_slug} hold_id=${hold.id} error=${msg}`)
    return withCors(errorResponse('STRIPE_ERROR', msg, 502), origin)
  }

  // ── Update hold with stripe_session_id ───────────────────────────────────
  const { error: holdSessionErr } = await svc
    .from('reservation_holds')
    .update({ stripe_session_id: session.id })
    .eq('id', hold.id)

  if (holdSessionErr) {
    // Do not return a live Checkout URL unless its paid event can be tied to a
    // durable, complete hold. Expiring this newly-created session avoids a
    // customer being able to pay for an unpromotable booking.
    console.log(
      `action=checkout_session_link hold_id=${hold.id} session_id=${session.id} error=${holdSessionErr.message}`,
    )
    try {
      await getStripePublic().checkout.sessions.expire(session.id)
    } catch (expireErr: unknown) {
      const msg = expireErr instanceof Error ? expireErr.message : 'Unknown Stripe expiration error'
      console.log(
        `action=checkout_session_expire hold_id=${hold.id} session_id=${session.id} error=${msg}`,
      )
    }
    await svc.from('reservation_holds').delete().eq('id', hold.id)
    return withCors(errorResponse('HOLD_LINK_FAILED', 'Failed to initialize checkout. Please try again.', 500), origin)
  }

  console.log(
    `action=checkout_session_created unit=${unit_slug} hold_id=${hold.id} session_id=${session.id}`,
  )

  // ── Build response ────────────────────────────────────────────────────────
  const responseBody: CheckoutResponse = {
    checkout_url: session.url!,
    session_id: session.id,
    hold_id: hold.id,
    // The guest must pay before the Checkout session closes, not the hold.
    expires_at: new Date(session.expires_at * 1000).toISOString(),
  }

  // ── Save to idempotency cache ─────────────────────────────────────────────
  await svc.from('checkout_idempotency').upsert(
    {
      key: idempotencyKey,
      response: responseBody as unknown as Record<string, unknown>,
    },
    { onConflict: 'key' },
  )

  return withCors(NextResponse.json({ data: responseBody }), origin)
}

// Frees the nights of a timed-out attempt right away instead of waiting for
// the checkout.session.expired webhook, so the guest's own new attempt is not
// refused as unavailable. The clock alone is not enough (a payment's webhook
// may still be in flight): Stripe must confirm the session can no longer be
// paid. 'open' past expires_at is expired by us first, as in the link-failure
// path above.
async function releaseExpiredCheckout(
  sessionId: string,
  svc: ReturnType<typeof createServiceClient>,
): Promise<'released' | 'paid' | 'unknown'> {
  try {
    const stripe = getStripePublic()
    let session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.status === 'open') session = await stripe.checkout.sessions.expire(sessionId)
    if (session.status === 'complete') return 'paid'
    if (session.status !== 'expired') return 'unknown'
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown Stripe error'
    console.log(`action=checkout_release_expired session_id=${sessionId} error=${msg}`)
    return 'unknown'
  }

  const { error } = await svc.from('reservation_holds').delete().eq('stripe_session_id', sessionId)
  if (error) {
    console.log(`action=checkout_release_expired session_id=${sessionId} error=${error.message}`)
    return 'unknown'
  }
  console.log(`action=checkout_release_expired session_id=${sessionId} status=hold_deleted`)
  return 'released'
}
