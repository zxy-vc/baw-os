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

  const rl = rateLimitByIp('units-slug', ip, 60)
  if (!rl.allowed) return withCors(rateLimitExceeded(), origin)

  const slug = params.slug
  console.log(`action=unit_detail slug=${slug} ip=${ip}`)

  const supabase = createAnonClient()
  const { data, error } = await supabase
    .from('v_public_units')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !data) {
    console.log(`action=unit_detail slug=${slug} status=not_found`)
    return withCors(
      errorResponse('UNIT_NOT_FOUND', `Unit "${slug}" not found`, 404),
      origin,
    )
  }

  // Galería pública (media_assets con visibility='public' vía vista anon)
  const { data: gallery } = await supabase
    .from('v_public_unit_media')
    .select('*')
    .eq('unit_id', data.id)
    .order('is_cover', { ascending: false })
    .order('sort_order', { ascending: true })

  console.log(
    `action=unit_detail slug=${slug} gallery=${gallery?.length ?? 0} status=ok`,
  )
  return withCors(
    NextResponse.json({ data: { ...data, gallery: gallery ?? [] } }),
    origin,
  )
}
