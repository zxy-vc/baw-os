// BaW OS v1 — Referencias foráneas acotadas a la org del agente (BAW-11 / BAW-26)
//
// Las escrituras de agentes insertan con org_id = org de la credencial, pero los
// ids que vienen en el body (unit_id, occupant_id, entity_id…) solo los valida
// la FK (que la fila exista), no que sea de la misma org. Sin estos guards un
// agente de la org A podía colgar una incidencia, un contrato o una tarea de una
// unidad/inquilino de la org B (y la UI o el portal de B la verían). Los usan
// las rutas POST /v1/* y el dispatcher de aprobaciones, igual que el guard de
// contrato de payment.record (BAW-2).
//
// `incidentRefsOutsideOrg` conserva la firma y el mensaje del PR #172 (BAW-11)
// para que ambas ramas compartan el mismo helper.

import type { createServiceClient } from '@/lib/supabase'

type DB = ReturnType<typeof createServiceClient>

export async function incidentRefsOutsideOrg(
  supabase: DB,
  orgId: string,
  refs: { unit_id?: string | null; reported_by?: string | null }
): Promise<string | null> {
  const checks: [string, 'units' | 'occupants', string | null | undefined][] = [
    ['unit', 'units', refs.unit_id],
    ['occupant', 'occupants', refs.reported_by],
  ]
  for (const [label, table, id] of checks) {
    if (!id) continue
    const { data } = await supabase.from(table).select('id').eq('id', id).eq('org_id', orgId).maybeSingle()
    if (!data) return `${label} ${id} not found`
  }
  return null
}

type OrgTable = 'units' | 'occupants' | 'contracts' | 'incidents' | 'payments'

export interface OrgRef {
  table: OrgTable
  id: string | null | undefined
  field: string
}

/**
 * entity_type de una task → tabla (todas con org_id). Una task de agente solo
 * puede apuntar a estas entidades; cualquier otro entity_type con entity_id se
 * rechaza para no ligar ids que no podemos verificar.
 */
const TASK_ENTITY_TABLE: Record<string, OrgTable> = {
  unit: 'units',
  units: 'units',
  occupant: 'occupants',
  occupants: 'occupants',
  contract: 'contracts',
  contracts: 'contracts',
  incident: 'incidents',
  incidents: 'incidents',
  payment: 'payments',
  payments: 'payments',
}

/**
 * Valida la entidad ligada a una task. null = OK (sin entidad o de la org);
 * string = motivo del rechazo.
 */
export async function checkTaskEntity(
  db: DB,
  orgId: string,
  entityType: string | null | undefined,
  entityId: string | null | undefined
): Promise<string | null> {
  if (!entityId) return null
  // hasOwn: 'constructor', '__proto__'… no son tipos de entidad.
  const table =
    entityType && Object.prototype.hasOwnProperty.call(TASK_ENTITY_TABLE, entityType)
      ? TASK_ENTITY_TABLE[entityType]
      : undefined
  if (!table) return `entity_type no soportado para entity_id: ${entityType ?? '(vacío)'}`
  return (await findForeignRef(db, orgId, [{ table, id: entityId, field: 'entity_id' }]))
    ? 'entity_id not found in this organization'
    : null
}

/** Devuelve el primer campo cuyo id no existe en la org, o null si todo es de la org. */
export async function findForeignRef(db: DB, orgId: string, refs: OrgRef[]): Promise<string | null> {
  for (const ref of refs) {
    if (!ref.id) continue
    const { data } = await db.from(ref.table).select('id').eq('id', ref.id).eq('org_id', orgId).maybeSingle()
    if (!data) return ref.field
  }
  return null
}
