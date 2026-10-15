// BaW OS — Carga un contrato con su unidad y ocupante, TODO dentro de una org.
//
// BAW-2: con service-role un embed de PostgREST (`contracts(*, unit:units(*),
// occupant:occupants(*))`) solo filtra la tabla raíz; las FKs son por id, no por
// (org_id, id), así que una fila propia puede apuntar a hijos de otra org. Aquí
// cada salto se lee con su propio `.eq('org_id', orgId)` y, si alguna referencia
// no está en la org, la cadena entera se rechaza (null) — nunca se devuelven
// datos parciales ni ajenos.
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, any>

export type OrgScopedContract = Row & {
  id: string
  org_id: string
  unit: Row | null
  occupant: Row | null
}

export async function loadContractInOrg(
  supabase: SupabaseClient,
  contractId: string | null | undefined,
  orgId: string,
): Promise<OrgScopedContract | null> {
  if (!contractId) return null

  const { data: contract } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!contract) return null

  const [{ data: unit }, { data: occupant }] = await Promise.all([
    contract.unit_id
      ? supabase.from('units').select('*').eq('id', contract.unit_id).eq('org_id', orgId).maybeSingle()
      : Promise.resolve({ data: null }),
    contract.occupant_id
      ? supabase.from('occupants').select('*').eq('id', contract.occupant_id).eq('org_id', orgId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  // Referencia presente pero fuera de la org → cadena inconsistente.
  if (contract.unit_id && !unit) return null
  if (contract.occupant_id && !occupant) return null

  return { ...contract, unit: unit ?? null, occupant: occupant ?? null } as OrgScopedContract
}
