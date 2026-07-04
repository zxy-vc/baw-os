import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/public-booking/supabase-public'
import {
  featureDisabled,
  handlePreflight,
  withCors,
  rateLimitExceeded,
  errorResponse,
} from '@/lib/public-booking/cors'
import { rateLimitByIp } from '@/lib/public-booking/rate-limit'

export const runtime = 'nodejs'

const InterestRequest = z.object({
  email: z.string().email(),
})

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request.headers.get('origin'))
}

/**
 * POST /api/public/v1/interest — lista de interés de la landing baw.mx
 * ("¿Operas propiedades?"). Registra el correo como contacto CRM (source
 * 'portal', interest_product 'BaW OS') en la org indicada por
 * MARKETING_LEADS_ORG_ID (fallback: DISCORD_DEFAULT_ORG_ID). Sin org
 * configurada devuelve 503 y el cliente cae a mailto:admin@baw.mx.
 */
export async function POST(request: NextRequest) {
  if (process.env.PUBLIC_BOOKING_ENABLED !== 'true') return featureDisabled()

  const origin = request.headers.get('origin')
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  const rl = rateLimitByIp('interest', ip, 5)
  if (!rl.allowed) return withCors(rateLimitExceeded(), origin)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return withCors(errorResponse('INVALID_JSON', 'Body must be JSON'), origin)
  }

  const parsed = InterestRequest.safeParse(body)
  if (!parsed.success) {
    return withCors(errorResponse('INVALID_PARAMS', 'Email inválido'), origin)
  }

  const orgId =
    process.env.MARKETING_LEADS_ORG_ID || process.env.DISCORD_DEFAULT_ORG_ID
  if (!orgId) {
    console.log('action=interest status=unconfigured (sin org para leads)')
    return withCors(
      errorResponse('NOT_CONFIGURED', 'Interest list not configured', 503),
      origin,
    )
  }

  const { email } = parsed.data
  const svc = createServiceClient()

  // Dedupe por (org, email): si ya está en la lista, es un OK silencioso.
  const { data: existing } = await svc
    .from('crm_contacts')
    .select('id')
    .eq('org_id', orgId)
    .eq('email', email)
    .maybeSingle()

  if (!existing) {
    const { error } = await svc.from('crm_contacts').insert({
      org_id: orgId,
      name: email.split('@')[0],
      email,
      source: 'portal',
      status: 'nuevo',
      interest_product: 'BaW OS',
      notes: 'Lista de interés baw.mx (landing informativa)',
    })
    if (error) {
      console.log(`action=interest status=error err=${error.code}`)
      return withCors(errorResponse('DB_ERROR', 'Failed to register', 500), origin)
    }
  }

  console.log(`action=interest status=ok`)
  return withCors(NextResponse.json({ data: { ok: true } }), origin)
}
