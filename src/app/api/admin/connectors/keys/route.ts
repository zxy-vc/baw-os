// BaW OS — Admin: llaves del conector v1 (ENG-624)
// GET  /api/admin/connectors/keys — listar las llaves de la org activa (sin hash)
// POST /api/admin/connectors/keys — crear una llave; el valor plano se devuelve
//                                   UNA sola vez y solo se guarda su SHA-256.
// Solo owner/admin de la org activa (requireAdminCaller, plano de humanos).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdminCaller } from '@/lib/admin-auth'
import {
  CONNECTOR_CONSUMERS,
  CONNECTOR_DATASETS,
  CONNECTOR_KEY_PUBLIC_COLUMNS,
  generateConnectorKey,
  hashConnectorKey,
} from '@/lib/connectors/keys'

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status })

export async function GET() {
  const auth = await requireAdminCaller()
  if (!auth.ok) return fail(auth.message, auth.status)

  const { data, error } = await createServiceClient()
    .from('connector_keys')
    .select(CONNECTOR_KEY_PUBLIC_COLUMNS)
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })
  if (error) return fail(error.message, 500)
  return NextResponse.json({ success: true, data: data ?? [] })
}

interface CreateBody {
  consumer?: string
  consumer_ref?: string
  label?: string
  building_ids?: string[] | null
  datasets?: string[]
  expires_in_days?: number | null
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminCaller()
  if (!auth.ok) return fail(auth.message, auth.status)

  let body: CreateBody
  try {
    body = await req.json()
  } catch {
    return fail('Invalid JSON body', 400)
  }

  const consumer = body.consumer ?? 'engrane'
  if (!(CONNECTOR_CONSUMERS as readonly string[]).includes(consumer)) return fail('consumer inválido', 400)
  const consumerRef = (body.consumer_ref ?? '').trim()
  if (!consumerRef || consumerRef.length > 128) return fail('consumer_ref es obligatorio (1-128)', 400)
  const label = (body.label ?? '').trim()
  if (!label || label.length > 64) return fail('label es obligatorio (1-64)', 400)

  const datasets = body.datasets ?? [...CONNECTOR_DATASETS]
  if (
    !Array.isArray(datasets) ||
    datasets.length === 0 ||
    datasets.some((d) => !(CONNECTOR_DATASETS as readonly string[]).includes(d))
  ) {
    return fail(`datasets debe ser un subconjunto de ${CONNECTOR_DATASETS.join(', ')}`, 400)
  }

  const service = createServiceClient()

  // Alcance por edificio: null = toda la org; si viene, cada edificio debe ser
  // de la org activa (nunca se acepta un edificio ajeno).
  let buildingIds: string[] | null = null
  if (body.building_ids !== undefined && body.building_ids !== null) {
    if (!Array.isArray(body.building_ids) || body.building_ids.length === 0) {
      return fail('building_ids debe ser null (toda la org) o una lista no vacía', 400)
    }
    buildingIds = Array.from(new Set(body.building_ids))
    const { data: owned, error } = await service.from('buildings').select('id').eq('org_id', auth.orgId)
    if (error) return fail(error.message, 500)
    const ownedIds = new Set((owned ?? []).map((b) => b.id as string))
    if (buildingIds.some((id) => !ownedIds.has(id))) return fail('Algún edificio no pertenece a la org', 400)
  }

  const expiresAt =
    typeof body.expires_in_days === 'number' && body.expires_in_days > 0
      ? new Date(Date.now() + body.expires_in_days * 86_400_000).toISOString()
      : null

  const { plainKey, prefix } = generateConnectorKey()
  const { data: created, error: insertErr } = await service
    .from('connector_keys')
    .insert({
      org_id: auth.orgId,
      consumer,
      consumer_ref: consumerRef,
      label,
      key_prefix: prefix,
      key_hash: await hashConnectorKey(plainKey),
      building_ids: buildingIds,
      datasets,
      status: 'active',
      expires_at: expiresAt,
      created_by: auth.userId,
    })
    .select(CONNECTOR_KEY_PUBLIC_COLUMNS)
    .single()

  if (insertErr || !created) {
    const msg = insertErr?.message ?? 'No se pudo crear la llave'
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return fail('Ya existe una llave activa para ese espacio; revócala antes de crear otra', 409)
    }
    return fail(msg, 500)
  }

  return NextResponse.json({
    success: true,
    data: {
      ...created,
      api_key: plainKey,
      warning: 'Esta es la única vez que verás la llave completa. Guárdala ahora — no se puede recuperar.',
    },
  })
}
