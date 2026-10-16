// BaW OS — Referencias de una incidencia acotadas a la org del agente (BAW-11)
//
// Las FK de incidents (unit_id → units, reported_by → occupants) solo comprueban
// que la fila exista, no que sea de la misma org. Sin este guard un agente de la
// org A podía colgar una incidencia de una unidad de la org B (y el portal del
// inquilino de B la vería). Lo usan POST /v1/incidents y el dispatcher de
// aprobaciones, igual que el guard de contrato de payment.record (BAW-2).

import type { createServiceClient } from '@/lib/supabase'

type Supa = ReturnType<typeof createServiceClient>

export async function incidentRefsOutsideOrg(
  supabase: Supa,
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
