import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient, createServiceClient } from '@/lib/public-booking/supabase-public'
import {
  featureDisabled,
  handlePreflight,
  withCors,
  rateLimitExceeded,
  errorResponse,
} from '@/lib/public-booking/cors'
import { rateLimitByIp } from '@/lib/public-booking/rate-limit'
import { AvailabilityQuery } from '@/lib/public-booking/schemas'

export const runtime = 'nodejs'

const MAX_RANGE_DAYS = 90

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request.headers.get('origin'))
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  if (process.env.PUBLIC_BOOKING_ENABLED !== 'true') return featureDisabled()

  const origin = request.headers.get('origin')
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  const rl = rateLimitByIp('units-availability', ip, 60)
  if (!rl.allowed) return withCors(rateLimitExceeded(), origin)

  const slug = params.slug
  const sp = request.nextUrl.searchParams

  const parsed = AvailabilityQuery.safeParse({
    from: sp.get('from'),
    to: sp.get('to'),
  })
  if (!parsed.success) {
    return withCors(
      errorResponse('INVALID_PARAMS', parsed.error.errors[0]?.message ?? 'from and to are required'),
      origin,
    )
  }

  const { from, to } = parsed.data

  // Enforce 90-day max range
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  const rangeDays = (toMs - fromMs) / 86_400_000
  if (rangeDays > MAX_RANGE_DAYS) {
    return withCors(
      errorResponse('RANGE_TOO_LARGE', `Max range is ${MAX_RANGE_DAYS} days`),
      origin,
    )
  }
  if (rangeDays <= 0) {
    return withCors(
      errorResponse('INVALID_RANGE', '"to" must be after "from"'),
      origin,
    )
  }

  console.log(`action=unit_availability slug=${slug} from=${from} to=${to} ip=${ip}`)

  // Resolve unit id from slug using anon client (public view)
  const anon = createAnonClient()
  const { data: unit, error: unitErr } = await anon
    .from('v_public_units')
    .select('id')
    .eq('slug', slug)
    .single()

  if (unitErr || !unit) {
    return withCors(
      errorResponse('UNIT_NOT_FOUND', `Unit "${slug}" not found`, 404),
      origin,
    )
  }

  const svc = createServiceClient()

  // Overall availability boolean
  const { data: isAvailable } = await svc.rpc('fn_unit_is_available', {
    p_unit_id: unit.id,
    p_from: from,
    p_to: to,
  })

  // Blocked date ranges (confirmed/checked_in reservations + active holds)
  const [{ data: reservations }, { data: holds }] = await Promise.all([
    svc
      .from('reservations')
      .select('check_in, check_out')
      .eq('unit_id', unit.id)
      .in('status', ['confirmed', 'checked_in', 'tentative'])
      .gte('check_out', from)
      .lte('check_in', to),

    svc
      .from('reservation_holds')
      .select('from_date, to_date')
      .eq('unit_id', unit.id)
      .gt('expires_at', new Date().toISOString())
      .gte('to_date', from)
      .lte('from_date', to),
  ])

  // Build a set of blocked day strings in range (ISO YYYY-MM-DD)
  const blockedDays = new Set<string>()

  function addBlockedDays(start: string, end: string) {
    const cursor = new Date(start)
    const endDate = new Date(end)
    while (cursor < endDate) {
      blockedDays.add(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
  }

  for (const r of reservations ?? []) {
    addBlockedDays(r.check_in, r.check_out)
  }
  for (const h of holds ?? []) {
    addBlockedDays(h.from_date, h.to_date)
  }

  console.log(`action=unit_availability slug=${slug} available=${isAvailable} blocked_days=${blockedDays.size} status=ok`)

  return withCors(
    NextResponse.json({
      data: {
        unit_slug: slug,
        from,
        to,
        is_available: Boolean(isAvailable),
        blocked_days: Array.from(blockedDays).sort(),
      },
    }),
    origin,
  )
}
