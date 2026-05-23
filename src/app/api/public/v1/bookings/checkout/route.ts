import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient, createServiceClient } from '@/lib/public-booking/supabase-public'
import { createCheckoutSession } from '@/lib/public-booking/stripe-public'
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
    console.log(`action=checkout_start idem=${idempotencyKey} status=cache_hit`)
    return withCors(NextResponse.json({ data: cached.response }), origin)
  }

  // ── Resolve unit ──────────────────────────────────────────────────────────
  const anon = createAnonClient()
  const { data: unit, error: unitErr } = await anon
    .from('v_public_units')
    .select('id, slug, name, base_rate_mxn, cleaning_fee_mxn, max_guests, min_nights')
    .eq('slug', unit_slug)
    .single()

  if (unitErr || !unit) {
    return withCors(
      errorResponse('UNIT_NOT_FOUND', `Unit "${unit_slug}" not found`, 404),
      origin,
    )
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

  // ── Create hold (15 min) ──────────────────────────────────────────────────
  const { data: hold, error: holdErr } = await svc
    .from('reservation_holds')
    .insert({
      unit_id: unit.id,
      from_date: from,
      to_date: to,
      guests_count: guests,
      guest_email: guest.email,
      idempotency_key: idempotencyKey,
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
    })
  } catch (err: unknown) {
    // Cleanup hold on Stripe failure
    await svc.from('reservation_holds').delete().eq('id', hold.id)
    const msg = err instanceof Error ? err.message : 'Stripe session creation failed'
    console.log(`action=checkout_stripe_fail unit=${unit_slug} hold_id=${hold.id} error=${msg}`)
    return withCors(errorResponse('STRIPE_ERROR', msg, 502), origin)
  }

  // ── Update hold with stripe_session_id ───────────────────────────────────
  await svc
    .from('reservation_holds')
    .update({ stripe_session_id: session.id })
    .eq('id', hold.id)

  console.log(
    `action=checkout_session_created unit=${unit_slug} hold_id=${hold.id} session_id=${session.id}`,
  )

  // ── Build response ────────────────────────────────────────────────────────
  const responseBody: CheckoutResponse = {
    checkout_url: session.url!,
    session_id: session.id,
    hold_id: hold.id,
    expires_at: hold.expires_at,
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
