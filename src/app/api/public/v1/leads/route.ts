import { NextRequest, NextResponse } from 'next/server'
import {
  createAnonClient,
  createServiceClient,
} from '@/lib/public-booking/supabase-public'
import {
  featureDisabled,
  handlePreflight,
  withCors,
  rateLimitExceeded,
  errorResponse,
} from '@/lib/public-booking/cors'
import { rateLimitByIp } from '@/lib/public-booking/rate-limit'
import { LeadRequest } from '@/lib/public-booking/schemas'

export const runtime = 'nodejs'

// Etapas de oportunidad consideradas "abiertas" para no duplicar el pipeline
// cuando la misma persona vuelve a mandar interés por la misma unidad.
const OPEN_STAGES = ['identificado', 'contactado', 'interesado', 'negociacion']

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request.headers.get('origin'))
}

/**
 * POST /api/public/v1/leads — interés en una unidad MTR/LTR desde el listing
 * público. Crea/reusa el contacto CRM, abre la oportunidad y pre-crea una
 * tenant_application en draft cuyo token permite continuar el intake en
 * /apply/[token]. Todo server-side con service role; el anon solo valida que
 * la unidad sea pública.
 */
export async function POST(request: NextRequest) {
  if (process.env.PUBLIC_BOOKING_ENABLED !== 'true') return featureDisabled()

  const origin = request.headers.get('origin')
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  const rl = rateLimitByIp('leads', ip, 5)
  if (!rl.allowed) return withCors(rateLimitExceeded(), origin)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return withCors(errorResponse('INVALID_JSON', 'Body must be JSON'), origin)
  }

  const parsed = LeadRequest.safeParse(body)
  if (!parsed.success) {
    return withCors(
      errorResponse(
        'INVALID_PARAMS',
        parsed.error.errors[0]?.message ?? 'Invalid params',
      ),
      origin,
    )
  }

  const { unit_slug, name, email, phone, message, desired_move_in } = parsed.data
  console.log(`action=lead_create unit=${unit_slug} ip=${ip}`)

  // 1. La unidad debe ser pública (vista anon = misma regla que el listing).
  const anon = createAnonClient()
  const { data: unit } = await anon
    .from('v_public_units')
    .select('id, slug, rent_type, monthly_rate_mxn')
    .eq('slug', unit_slug)
    .maybeSingle()

  if (!unit) {
    return withCors(
      errorResponse('UNIT_NOT_FOUND', `Unit "${unit_slug}" not found`, 404),
      origin,
    )
  }

  const svc = createServiceClient()

  // 2. org_id de la unidad (campo interno, no expuesto en la vista).
  const { data: unitRow, error: unitErr } = await svc
    .from('units')
    .select('org_id')
    .eq('id', unit.id)
    .single()

  if (unitErr || !unitRow?.org_id) {
    console.log(`action=lead_create unit=${unit_slug} status=error err=no_org`)
    return withCors(errorResponse('DB_ERROR', 'Failed to resolve unit', 500), origin)
  }
  const orgId: string = unitRow.org_id

  // 3. Contacto CRM: reusar por (org, email) o crear como lead de portal.
  const { data: existingContact } = await svc
    .from('crm_contacts')
    .select('id')
    .eq('org_id', orgId)
    .eq('email', email)
    .maybeSingle()

  let contactId = existingContact?.id as string | undefined
  if (!contactId) {
    const { data: newContact, error: contactErr } = await svc
      .from('crm_contacts')
      .insert({
        org_id: orgId,
        name,
        email,
        phone: phone ?? null,
        source: 'portal',
        status: 'nuevo',
        interest_product: unit.rent_type,
        notes: message ?? null,
      })
      .select('id')
      .single()
    if (contactErr || !newContact) {
      console.log(`action=lead_create unit=${unit_slug} status=error err=contact`)
      return withCors(errorResponse('DB_ERROR', 'Failed to record lead', 500), origin)
    }
    contactId = newContact.id
  }

  // 4. Oportunidad: solo si no hay una abierta para este contacto + unidad.
  const { data: openOpp } = await svc
    .from('crm_opportunities')
    .select('id')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .eq('unit_id', unit.id)
    .in('stage', OPEN_STAGES)
    .maybeSingle()

  if (!openOpp) {
    const oppNotes = [
      'Lead del listing público.',
      message ? `Mensaje: ${message}` : null,
      desired_move_in ? `Fecha deseada de entrada: ${desired_move_in}` : null,
    ]
      .filter(Boolean)
      .join(' ')
    const { error: oppErr } = await svc.from('crm_opportunities').insert({
      org_id: orgId,
      contact_id: contactId,
      kind: 'nueva',
      target_product: unit.rent_type,
      unit_id: unit.id,
      stage: 'identificado',
      est_monthly: unit.monthly_rate_mxn ?? null,
      notes: oppNotes,
    })
    if (oppErr) {
      console.log(
        `action=lead_create unit=${unit_slug} status=error err=opportunity`,
      )
      return withCors(errorResponse('DB_ERROR', 'Failed to record lead', 500), origin)
    }
  }

  // 5. Pre-crear la solicitud de intake (draft) para continuar en /apply/[token].
  const { data: application, error: appErr } = await svc
    .from('tenant_applications')
    .insert({
      org_id: orgId,
      unit_id: unit.id,
      status: 'draft',
      notes: `Lead del listing público: ${name} · ${email}${phone ? ` · ${phone}` : ''}`,
    })
    .select('token')
    .single()

  if (appErr || !application?.token) {
    console.log(`action=lead_create unit=${unit_slug} status=error err=application`)
    return withCors(errorResponse('DB_ERROR', 'Failed to record lead', 500), origin)
  }

  console.log(`action=lead_create unit=${unit_slug} status=ok`)
  return withCors(
    NextResponse.json({
      data: { ok: true, apply_url: `/apply/${application.token}` },
    }),
    origin,
  )
}
