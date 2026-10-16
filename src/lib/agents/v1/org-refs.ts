// BaW OS v1 — Validación de referencias foráneas por org (BAW-26).
//
// Las escrituras de agentes insertan con org_id = org de la credencial, pero los
// ids que vienen en el body (unit_id, occupant_id…) también tienen que ser de
// esa org: si no, un agente podría ligar un contrato o una incidencia a la
// unidad/inquilino de otro tenant y la UI de su org mostraría datos ajenos.

import type { createServiceClient } from '@/lib/supabase'

type DB = ReturnType<typeof createServiceClient>

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
  const table = entityType ? TASK_ENTITY_TABLE[entityType] : undefined
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
