// BaW OS — Motor de ciclo de vida (Archivar / Restaurar / Eliminar / Force-delete)
//
// Modelo (decisión de Fran):
//   - Archivar  → reversible, conserva todo. Marca `archived_at`. Acción principal.
//   - Eliminar  → permanente, SOLO si la entidad está "limpia" (sin historia ligada).
//   - Force-delete → para casos extremos, borra en cascada lo dependiente, PERO
//     nunca cruza el "piso duro": si hay PAGOS ligados, se rechaza siempre
//     (la historia financiera no se destruye jamás, ni con force).
//
// Este módulo centraliza el conocimiento de las llaves foráneas (ver el mapa en
// supabase/migrations) para que la UI y la API no lo dupliquen.

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, 'public', any>

export type LifecycleEntity = 'building' | 'unit' | 'contract' | 'occupant'

export const ENTITY_TABLE: Record<LifecycleEntity, string> = {
  building: 'buildings',
  unit: 'units',
  contract: 'contracts',
  occupant: 'occupants',
}

export const ENTITY_LABEL: Record<LifecycleEntity, string> = {
  building: 'edificio',
  unit: 'unidad',
  contract: 'contrato',
  occupant: 'inquilino',
}

export interface Blocker {
  key: string
  label: string // legible para el usuario (ej. "2 contratos")
  count: number
  hardFloor: boolean // true = ni siquiera force-delete puede pasarlo (pagos)
}

export interface DeletePreflight {
  canDelete: boolean // sin bloqueadores → eliminar directo
  canForce: boolean // hay bloqueadores pero ninguno es piso duro → force posible
  blockers: Blocker[]
}

// ── helpers de conteo ────────────────────────────────────────────────────────

async function countWhere(db: DB, table: string, col: string, val: string): Promise<number> {
  const { count } = await db.from(table).select('id', { count: 'exact', head: true }).eq(col, val)
  return count ?? 0
}

async function contractIdsForUnit(db: DB, unitId: string): Promise<string[]> {
  const { data } = await db.from('contracts').select('id').eq('unit_id', unitId)
  return (data || []).map((r: { id: string }) => r.id)
}

async function contractIdsForOccupant(db: DB, occupantId: string): Promise<string[]> {
  const { data } = await db.from('contracts').select('id').eq('occupant_id', occupantId)
  return (data || []).map((r: { id: string }) => r.id)
}

async function countPaymentsForContracts(db: DB, contractIds: string[]): Promise<number> {
  if (contractIds.length === 0) return 0
  const { count } = await db
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .in('contract_id', contractIds)
  return count ?? 0
}

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`
}

// ── preflight: qué bloquea el borrado ────────────────────────────────────────

export async function checkBlockers(
  db: DB,
  entity: LifecycleEntity,
  id: string
): Promise<DeletePreflight> {
  const blockers: Blocker[] = []

  if (entity === 'building') {
    const units = await countWhere(db, 'units', 'building_id', id)
    if (units > 0) blockers.push({ key: 'units', label: plural(units, 'unidad', 'unidades'), count: units, hardFloor: false })
  } else if (entity === 'unit') {
    const [contracts, reservations, incidents] = await Promise.all([
      countWhere(db, 'contracts', 'unit_id', id),
      countWhere(db, 'reservations', 'unit_id', id),
      countWhere(db, 'incidents', 'unit_id', id),
    ])
    const contractIds = await contractIdsForUnit(db, id)
    const payments = await countPaymentsForContracts(db, contractIds)
    if (payments > 0) blockers.push({ key: 'payments', label: plural(payments, 'pago', 'pagos'), count: payments, hardFloor: true })
    if (contracts > 0) blockers.push({ key: 'contracts', label: plural(contracts, 'contrato', 'contratos'), count: contracts, hardFloor: false })
    if (reservations > 0) blockers.push({ key: 'reservations', label: plural(reservations, 'reserva', 'reservas'), count: reservations, hardFloor: false })
    if (incidents > 0) blockers.push({ key: 'incidents', label: plural(incidents, 'incidencia', 'incidencias'), count: incidents, hardFloor: false })
  } else if (entity === 'contract') {
    const payments = await countPaymentsForContracts(db, [id])
    if (payments > 0) blockers.push({ key: 'payments', label: plural(payments, 'pago', 'pagos'), count: payments, hardFloor: true })
  } else if (entity === 'occupant') {
    const [contracts, reservations, incidents] = await Promise.all([
      countWhere(db, 'contracts', 'occupant_id', id),
      countWhere(db, 'reservations', 'guest_id', id),
      countWhere(db, 'incidents', 'reported_by', id),
    ])
    const contractIds = await contractIdsForOccupant(db, id)
    const payments = await countPaymentsForContracts(db, contractIds)
    if (payments > 0) blockers.push({ key: 'payments', label: plural(payments, 'pago', 'pagos'), count: payments, hardFloor: true })
    if (contracts > 0) blockers.push({ key: 'contracts', label: plural(contracts, 'contrato', 'contratos'), count: contracts, hardFloor: false })
    if (reservations > 0) blockers.push({ key: 'reservations', label: plural(reservations, 'reserva', 'reservas'), count: reservations, hardFloor: false })
    if (incidents > 0) blockers.push({ key: 'incidents', label: plural(incidents, 'incidencia', 'incidencias'), count: incidents, hardFloor: false })
  }

  const hasHardFloor = blockers.some((b) => b.hardFloor)
  return {
    canDelete: blockers.length === 0,
    canForce: blockers.length > 0 && !hasHardFloor,
    blockers,
  }
}

// ── archivar / restaurar ─────────────────────────────────────────────────────

export async function archiveEntity(db: DB, entity: LifecycleEntity, id: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db.from(ENTITY_TABLE[entity]).update({ archived_at: now }).eq('id', id)
  if (error) throw new Error(error.message)
  // Archivar un edificio archiva en cascada sus unidades.
  if (entity === 'building') {
    await db.from('units').update({ archived_at: now }).eq('building_id', id).is('archived_at', null)
  }
}

export async function restoreEntity(db: DB, entity: LifecycleEntity, id: string): Promise<void> {
  const { error } = await db.from(ENTITY_TABLE[entity]).update({ archived_at: null }).eq('id', id)
  if (error) throw new Error(error.message)
  if (entity === 'building') {
    await db.from('units').update({ archived_at: null }).eq('building_id', id)
  }
}

// ── eliminar (limpio) ────────────────────────────────────────────────────────

export class LifecycleError extends Error {
  constructor(message: string, public blockers?: Blocker[]) {
    super(message)
  }
}

/** Borra una entidad SOLO si está limpia. Lanza LifecycleError con blockers si no. */
export async function deleteClean(db: DB, entity: LifecycleEntity, id: string): Promise<void> {
  const pre = await checkBlockers(db, entity, id)
  if (!pre.canDelete) {
    throw new LifecycleError(`La ${ENTITY_LABEL[entity]} tiene registros ligados`, pre.blockers)
  }
  await hardDelete(db, entity, id)
}

async function hardDelete(db: DB, entity: LifecycleEntity, id: string): Promise<void> {
  if (entity === 'building') {
    // ownership_stakes es CASCADE en DB, pero lo limpiamos explícito por claridad.
    await db.from('ownership_stakes').delete().eq('building_id', id)
  }
  const { error } = await db.from(ENTITY_TABLE[entity]).delete().eq('id', id)
  if (error) throw new LifecycleError(error.message)
}

// ── force-delete (cascada, con piso duro en pagos) ───────────────────────────

/**
 * Borra en cascada para casos extremos. Rechaza SIEMPRE si hay pagos ligados
 * (piso duro: la historia financiera no se destruye). Borra explícitamente los
 * dependientes operativos (reservas, incidencias, contratos sin pagos, etc.).
 */
export async function forceDelete(db: DB, entity: LifecycleEntity, id: string): Promise<void> {
  if (entity === 'contract') {
    if ((await countPaymentsForContracts(db, [id])) > 0) {
      throw new LifecycleError('No se puede eliminar: el contrato tiene pagos registrados (historia financiera).')
    }
    await forceDeleteContract(db, id)
    return
  }

  if (entity === 'unit') {
    const contractIds = await contractIdsForUnit(db, id)
    if ((await countPaymentsForContracts(db, contractIds)) > 0) {
      throw new LifecycleError('No se puede eliminar: la unidad tiene pagos ligados a sus contratos.')
    }
    for (const cid of contractIds) await forceDeleteContract(db, cid)
    await db.from('reservations').delete().eq('unit_id', id)
    await db.from('incidents').delete().eq('unit_id', id)
    // units: CASCADE limpia unit_spaces/media_assets/booking; SET NULL en expenses/crm/ancillary
    const { error } = await db.from('units').delete().eq('id', id)
    if (error) throw new LifecycleError(error.message)
    return
  }

  if (entity === 'occupant') {
    const contractIds = await contractIdsForOccupant(db, id)
    if ((await countPaymentsForContracts(db, contractIds)) > 0) {
      throw new LifecycleError('No se puede eliminar: el inquilino tiene pagos ligados a sus contratos.')
    }
    for (const cid of contractIds) await forceDeleteContract(db, cid)
    await db.from('reservations').delete().eq('guest_id', id)
    await db.from('incidents').delete().eq('reported_by', id)
    await db.from('whatsapp_notifications').delete().eq('occupant_id', id)
    const { error } = await db.from('occupants').delete().eq('id', id)
    if (error) throw new LifecycleError(error.message)
    return
  }

  if (entity === 'building') {
    const { data: units } = await db.from('units').select('id').eq('building_id', id)
    const unitIds = (units || []).map((u: { id: string }) => u.id)
    // Pre-chequeo de piso duro en TODAS las unidades antes de borrar nada.
    for (const uid of unitIds) {
      const cids = await contractIdsForUnit(db, uid)
      if ((await countPaymentsForContracts(db, cids)) > 0) {
        throw new LifecycleError('No se puede eliminar: una unidad del edificio tiene pagos registrados.')
      }
    }
    for (const uid of unitIds) await forceDelete(db, 'unit', uid)
    await db.from('ownership_stakes').delete().eq('building_id', id)
    const { error } = await db.from('buildings').delete().eq('id', id)
    if (error) throw new LifecycleError(error.message)
    return
  }
}

// Contrato sin pagos: limpia dependientes con FK NO ACTION antes de borrar.
async function forceDeleteContract(db: DB, contractId: string): Promise<void> {
  await db.from('invoices').delete().eq('contract_id', contractId)
  await db.from('payment_ledger').delete().eq('contract_id', contractId)
  await db.from('whatsapp_notifications').delete().eq('contract_id', contractId)
  // ancillary_charges es CASCADE; el contrato se borra al final.
  const { error } = await db.from('contracts').delete().eq('id', contractId)
  if (error) throw new LifecycleError(error.message)
}
