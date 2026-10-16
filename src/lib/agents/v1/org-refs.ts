// BaW OS v1 — Validación de referencias foráneas por org (BAW-26).
//
// Las escrituras de agentes insertan con org_id = org de la credencial, pero los
// ids que vienen en el body (unit_id, occupant_id…) también tienen que ser de
// esa org: si no, un agente podría ligar un contrato o una incidencia a la
// unidad/inquilino de otro tenant y la UI de su org mostraría datos ajenos.

import type { createServiceClient } from '@/lib/supabase'

type DB = ReturnType<typeof createServiceClient>

export interface OrgRef {
  table: 'units' | 'occupants'
  id: string | null | undefined
  field: string
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
