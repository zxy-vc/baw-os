// BaW OS — API unificada de ciclo de vida (Archivar / Restaurar / Eliminar / Force-delete)
//
// GET  /api/lifecycle?entity=&id=        → preflight: qué bloquea el borrado
// POST /api/lifecycle  { entity, id, action: 'archive'|'restore'|'delete'|'force_delete' }
//
// Solo owner/admin del tenant (o platform admin). Scoping estricto por org:
// la entidad debe pertenecer a la org activa del caller.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdminCaller } from '@/lib/admin-auth'
import {
  archiveEntity,
  restoreEntity,
  deleteClean,
  forceDelete,
  checkBlockers,
  ENTITY_TABLE,
  LifecycleError,
  type LifecycleEntity,
} from '@/lib/lifecycle'

export const dynamic = 'force-dynamic'

const VALID_ENTITIES: LifecycleEntity[] = ['building', 'unit', 'contract', 'occupant']
const VALID_ACTIONS = ['archive', 'restore', 'delete', 'force_delete'] as const
type Action = (typeof VALID_ACTIONS)[number]

function isEntity(v: unknown): v is LifecycleEntity {
  return typeof v === 'string' && (VALID_ENTITIES as string[]).includes(v)
}

// Verifica que la entidad exista y pertenezca a la org del caller.
async function assertOrgOwnership(
  db: ReturnType<typeof createServiceClient>,
  entity: LifecycleEntity,
  id: string,
  orgId: string
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const { data, error } = await db.from(ENTITY_TABLE[entity]).select('org_id').eq('id', id).maybeSingle()
  if (error) return { ok: false, status: 500, message: error.message }
  if (!data) return { ok: false, status: 404, message: `${entity} no encontrado` }
  if ((data as { org_id: string }).org_id !== orgId) {
    return { ok: false, status: 403, message: 'Entidad de otra organización' }
  }
  return { ok: true }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminCaller()
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status })

  const entity = req.nextUrl.searchParams.get('entity')
  const id = req.nextUrl.searchParams.get('id')
  if (!isEntity(entity) || !id) {
    return NextResponse.json({ success: false, error: 'entity e id requeridos' }, { status: 400 })
  }

  const db = createServiceClient()
  const owns = await assertOrgOwnership(db, entity, id, auth.orgId)
  if (!owns.ok) return NextResponse.json({ success: false, error: owns.message }, { status: owns.status })

  const preflight = await checkBlockers(db, entity, id)
  return NextResponse.json({ success: true, data: preflight })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminCaller()
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status })

  let body: { entity?: unknown; id?: unknown; action?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 })
  }

  const { entity, id, action } = body
  if (!isEntity(entity) || typeof id !== 'string' || !id) {
    return NextResponse.json({ success: false, error: 'entity e id requeridos' }, { status: 400 })
  }
  if (typeof action !== 'string' || !(VALID_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ success: false, error: `action inválida (${VALID_ACTIONS.join(', ')})` }, { status: 400 })
  }

  const db = createServiceClient()
  const owns = await assertOrgOwnership(db, entity, id, auth.orgId)
  if (!owns.ok) return NextResponse.json({ success: false, error: owns.message }, { status: owns.status })

  try {
    switch (action as Action) {
      case 'archive':
        await archiveEntity(db, entity, id)
        break
      case 'restore':
        await restoreEntity(db, entity, id)
        break
      case 'delete':
        await deleteClean(db, entity, id)
        break
      case 'force_delete':
        await forceDelete(db, entity, id)
        break
    }
  } catch (e) {
    if (e instanceof LifecycleError) {
      // Borrado bloqueado por dependencias → 409 con detalle para la UI.
      return NextResponse.json(
        { success: false, error: e.message, blockers: e.blockers ?? [] },
        { status: 409 }
      )
    }
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
