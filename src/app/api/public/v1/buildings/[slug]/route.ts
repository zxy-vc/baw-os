import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/public-booking/supabase-public'
import {
  featureDisabled,
  handlePreflight,
  withCors,
  rateLimitExceeded,
  errorResponse,
} from '@/lib/public-booking/cors'
import { rateLimitByIp } from '@/lib/public-booking/rate-limit'

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

  const rl = rateLimitByIp('buildings-slug', ip, 60)
  if (!rl.allowed) return withCors(rateLimitExceeded(), origin)

  const slug = params.slug
  console.log(`action=buildings_get slug=${slug} ip=${ip}`)

  const supabase = createAnonClient()
  const { data, error } = await supabase
    .from('v_public_buildings')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !data) {
    console.log(`action=buildings_get slug=${slug} status=not_found`)
    return withCors(
      errorResponse('BUILDING_NOT_FOUND', `Building "${slug}" not found`, 404),
      origin,
    )
  }

  console.log(`action=buildings_get slug=${slug} status=ok`)
  return withCors(NextResponse.json({ data }), origin)
}
