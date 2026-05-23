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
import { UnitsListQuery } from '@/lib/public-booking/schemas'

export const runtime = 'nodejs'

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

  const rl = rateLimitByIp('buildings-slug-units', ip, 60)
  if (!rl.allowed) return withCors(rateLimitExceeded(), origin)

  const buildingSlug = params.slug
  const searchParams = request.nextUrl.searchParams

  // Validate query params
  const parsed = UnitsListQuery.safeParse({
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    guests: searchParams.get('guests') ?? undefined,
  })
  if (!parsed.success) {
    return withCors(
      errorResponse('INVALID_PARAMS', parsed.error.errors[0]?.message ?? 'Invalid params'),
      origin,
    )
  }

  const { from, to, guests } = parsed.data
  console.log(`action=buildings_units_list building=${buildingSlug} from=${from} to=${to} guests=${guests} ip=${ip}`)

  const supabase = createAnonClient()

  // Fetch units for this building slug
  let query = supabase
    .from('v_public_units')
    .select('*')
    .eq('building_slug', buildingSlug)

  if (guests) {
    query = query.gte('max_guests', guests)
  }

  const { data: units, error } = await query

  if (error) {
    console.log(`action=buildings_units_list building=${buildingSlug} status=error err=${error.message}`)
    return withCors(errorResponse('DB_ERROR', 'Failed to fetch units', 500), origin)
  }

  if (!units || units.length === 0) {
    return withCors(NextResponse.json({ data: [] }), origin)
  }

  // If date range provided, filter by availability
  if (from && to) {
    const svc = createServiceClient()
    const availabilityChecks = await Promise.all(
      units.map(async (unit) => {
        const { data: available } = await svc.rpc('fn_unit_is_available', {
          p_unit_id: unit.id,
          p_from: from,
          p_to: to,
        })
        return { unit, available: Boolean(available) }
      }),
    )
    const filtered = availabilityChecks
      .filter((r) => r.available)
      .map((r) => r.unit)

    console.log(`action=buildings_units_list building=${buildingSlug} total=${units.length} available=${filtered.length} status=ok`)
    return withCors(NextResponse.json({ data: filtered }), origin)
  }

  console.log(`action=buildings_units_list building=${buildingSlug} total=${units.length} status=ok`)
  return withCors(NextResponse.json({ data: units }), origin)
}
