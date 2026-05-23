import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/public-booking/supabase-public'
import { createServiceClient } from '@/lib/public-booking/supabase-public'
import {
  featureDisabled,
  handlePreflight,
  withCors,
  rateLimitExceeded,
  errorResponse,
} from '@/lib/public-booking/cors'
import { rateLimitByIp } from '@/lib/public-booking/rate-limit'
import { QuoteRequest } from '@/lib/public-booking/schemas'
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

  const rl = rateLimitByIp('quotes', ip, 10)
  if (!rl.allowed) return withCors(rateLimitExceeded(), origin)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return withCors(errorResponse('INVALID_JSON', 'Request body must be JSON'), origin)
  }

  const parsed = QuoteRequest.safeParse(body)
  if (!parsed.success) {
    return withCors(
      errorResponse('INVALID_PARAMS', parsed.error.errors[0]?.message ?? 'Invalid params'),
      origin,
    )
  }

  const { unit_slug, from, to, guests } = parsed.data
  console.log(`action=quote unit=${unit_slug} from=${from} to=${to} guests=${guests} ip=${ip}`)

  // Fetch unit data (public view — no auth needed)
  const anon = createAnonClient()
  const { data: unit, error: unitErr } = await anon
    .from('v_public_units')
    .select('id, slug, base_rate_mxn, cleaning_fee_mxn, max_guests, min_nights')
    .eq('slug', unit_slug)
    .single()

  if (unitErr || !unit) {
    return withCors(
      errorResponse('UNIT_NOT_FOUND', `Unit "${unit_slug}" not found`, 404),
      origin,
    )
  }

  // Check availability — quotes do NOT hold dates but we warn if unavailable
  const svc = createServiceClient()
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

  // Compute quote
  let quote
  try {
    quote = computeQuote(unit, from, to, guests)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Quote computation failed'
    return withCors(errorResponse('QUOTE_ERROR', msg), origin)
  }

  console.log(`action=quote unit=${unit_slug} total=${quote.total_mxn} nights=${quote.nights} status=ok`)
  return withCors(NextResponse.json({ data: quote }), origin)
}
