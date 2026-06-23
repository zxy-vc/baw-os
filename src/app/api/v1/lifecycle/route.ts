// BaW OS v1 — POST /v1/lifecycle  (agentes: ARCHIVAR, nunca eliminar)
//
// Los agentes pueden archivar entidades (reversible) SIEMPRE con aprobación
// humana — `lifecycle.archive` está en el guardrail duro del classifier, así que
// nunca se ejecuta directo: encola una aprobación (202) y el dispatcher la corre
// al ser concedida. NO hay borrado vía agentes.

import { v1Write } from '@/lib/agents/v1/handler'
import { v1Ok } from '@/lib/agents/v1/responses'
import { createServiceClient } from '@/lib/supabase'
import { archiveEntity, ENTITY_TABLE, type LifecycleEntity } from '@/lib/lifecycle'

interface ArchiveBody {
  entity: LifecycleEntity
  id: string
  action: 'archive'
}

export const POST = v1Write<ArchiveBody>({
  scopes: ['lifecycle:archive'],
  actionType: 'lifecycle.archive',
  endpoint: '/v1/lifecycle',
  validate: (raw) => {
    if (typeof raw !== 'object' || raw === null) throw new Error('body must be object')
    const b = raw as Record<string, unknown>
    if (typeof b.entity !== 'string' || !(b.entity in ENTITY_TABLE)) {
      throw new Error('entity inválido (building|unit|contract|occupant)')
    }
    if (typeof b.id !== 'string' || !b.id) throw new Error('id requerido')
    if (b.action !== undefined && b.action !== 'archive') {
      throw new Error("solo se soporta action 'archive' (los agentes no eliminan)")
    }
    return { entity: b.entity as LifecycleEntity, id: b.id, action: 'archive' }
  },
  // Nota: por el guardrail duro este handler casi nunca corre (la acción se encola
  // siempre como aprobación → dispatcher). Se implementa por completitud.
  handler: async ({ auth, body, recordAction }) => {
    const db = createServiceClient()
    await archiveEntity(db, body.entity, body.id)
    await recordAction({
      actionType: 'lifecycle.archive',
      entityType: body.entity,
      entityId: body.id,
      payload: body as unknown as Record<string, unknown>,
      result: { archived: body.id },
      status: 'ok',
    })
    void auth
    return v1Ok({ archived: body.id, entity: body.entity })
  },
})
