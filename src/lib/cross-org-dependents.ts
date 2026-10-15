// BaW OS — ¿Borrar este padre tocaría filas de OTRA org vía FK?
//
// BAW-2: acotar el DELETE con `.eq('org_id', orgId)` no acota sus efectos
// referenciales. Las FKs versionadas son por id (no por (org_id, id)) y varias
// son ON DELETE CASCADE / SET NULL, así que borrar un padre propio puede borrar
// o modificar hijos de otra org. Antes del borrado físico se buscan hijos
// ajenos en cada una de esas FKs; si hay alguno, el borrado se rechaza.
//
// Inventario (supabase/migrations): mantener en sync al agregar FKs con
// CASCADE / SET NULL hacia estas tablas. Las FKs sin acción (NO ACTION) no
// necesitan entrar: Postgres rechaza el borrado sin tocar el hijo.
import type { SupabaseClient } from '@supabase/supabase-js'

export const CASCADING_DEPENDENTS = {
  contracts: [
    { table: 'ancillary_charges', column: 'contract_id' }, // CASCADE · 20260616_02_ancillary_charges.sql:99
    { table: 'stay_occupants', column: 'contract_id' }, // CASCADE · 20260627_stay_occupants.sql:15
  ],
  occupants: [
    { table: 'stay_occupants', column: 'occupant_id' }, // CASCADE · 20260627_stay_occupants.sql:17
    { table: 'crm_contacts', column: 'occupant_id' }, // SET NULL · 20260617_crm.sql:24
    { table: 'reservations', column: 'occupant_id' }, // SET NULL · 20260704_quote_flow_crm.sql:26
    { table: 'payment_receipts', column: 'payer_occupant_id' }, // SET NULL · 20260628_payment_receipts.sql:24
  ],
  ancillary_assets: [
    { table: 'ancillary_charges', column: 'asset_id' }, // SET NULL · 20260616_02_ancillary_charges.sql:100
  ],
} as const

export type CascadingParent = keyof typeof CASCADING_DEPENDENTS

/** PostgREST/Postgres: la tabla no existe en este entorno → no hay FK que propague. */
const UNDEFINED_TABLE = new Set(['42P01', 'PGRST205'])

/**
 * `blocked: true` si algún hijo de OTRA org referencia al padre. Falla cerrado:
 * cualquier error de lectura (salvo tabla inexistente) se devuelve como `error`
 * y el caller NO debe borrar.
 */
export async function findCrossOrgDependents(
  supabase: SupabaseClient,
  parent: CascadingParent,
  id: string,
  orgId: string,
): Promise<{ blocked: boolean; error?: undefined } | { blocked?: undefined; error: string }> {
  for (const dep of CASCADING_DEPENDENTS[parent]) {
    const { count, error } = await supabase
      .from(dep.table)
      .select('id', { count: 'exact', head: true })
      .eq(dep.column, id)
      .neq('org_id', orgId)
    if (error) {
      if (UNDEFINED_TABLE.has(error.code)) continue
      return { error: error.message }
    }
    if ((count ?? 0) > 0) return { blocked: true }
  }
  return { blocked: false }
}
