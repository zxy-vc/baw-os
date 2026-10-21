// BaW OS — Lecturas con alcance del conector v1 (ENG-624).
//
// El límite de seguridad es la UNIDAD: una llave ve las unidades de su org
// (y, si está limitada, solo las de sus edificios). Reservas, contratos y
// bloqueos se leen siempre filtrando por esas unidades — nunca por un id que
// mande el consumidor sin validar. Solo SELECTs.

import { addDaysISO, diffDaysISO } from '@/lib/calendar-occupancy'
import type { ConnectorCtx } from './handler'
import { badRequest, outOfScope } from './handler'
import type { Period } from './rules'

type Db = ConnectorCtx['db']

/** Rango máximo de un periodo (noches). */
export const MAX_PERIOD_DAYS = 366
export const DEFAULT_LIMIT = 100
export const MAX_LIMIT = 500
/** Ids por `.in()` (la lista viaja en la URL de PostgREST). */
const IN_CHUNK = 100
/** Filas por página al leer completo (PostgREST corta en 1000). */
const PAGE = 1000

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* ------------------------------ Parámetros ------------------------------ */

function isRealDate(s: string): boolean {
  return ISO_DATE.test(s) && addDaysISO(s, 0) === s
}

/** `from` (incluido) y `to` (excluido), obligatorios, ≤ 366 noches. */
export function parsePeriod(params: URLSearchParams): Period {
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  if (!isRealDate(from) || !isRealDate(to)) {
    throw badRequest('invalid_period', 'from y to son obligatorios (yyyy-mm-dd; to es exclusivo)')
  }
  const days = diffDaysISO(from, to)
  if (days <= 0) throw badRequest('invalid_period', 'to debe ser posterior a from')
  if (days > MAX_PERIOD_DAYS) {
    throw badRequest('period_too_long', `El periodo máximo es de ${MAX_PERIOD_DAYS} noches`)
  }
  return { from, to }
}

export function parseLimit(params: URLSearchParams): number {
  const raw = params.get('limit')
  if (raw === null) return DEFAULT_LIMIT
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) throw badRequest('invalid_limit', 'limit debe ser un entero ≥ 1')
  return Math.min(n, MAX_LIMIT)
}

function optionalUuid(params: URLSearchParams, name: string): string | null {
  const v = params.get(name)
  if (v === null) return null
  if (!UUID.test(v)) throw badRequest(`invalid_${name}`, `${name} debe ser un uuid`)
  return v
}

/* ------------------------------ Paginación ------------------------------ */

/** Paginación por id (orden estable entre páginas). Cursor = último id. */
export function paginateById<T extends { id: string }>(
  rows: T[],
  params: URLSearchParams,
): { page: T[]; next_cursor: string | null; limit: number } {
  const limit = parseLimit(params)
  const cursor = params.get('cursor')
  let after: string | null = null
  if (cursor !== null) {
    try {
      after = Buffer.from(cursor, 'base64url').toString('utf-8')
    } catch {
      after = null
    }
    if (!after || !UUID.test(after)) throw badRequest('invalid_cursor', 'cursor inválido')
  }
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const rest = after ? sorted.filter((r) => r.id > after!) : sorted
  const page = rest.slice(0, limit)
  const next_cursor =
    rest.length > limit ? Buffer.from(page[page.length - 1].id, 'utf-8').toString('base64url') : null
  return { page, next_cursor, limit }
}

/* -------------------------------- Lecturas ------------------------------ */

function chunks<T>(xs: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

/** Lee todas las filas de una consulta, página por página (orden por id). */
async function readAll<T>(build: () => any, label: string): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await build().order('id', { ascending: true }).range(offset, offset + PAGE - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

export interface ScopedUnit {
  id: string
  building_id: string
  building_name: string | null
  number: string
  type: string | null
  bedrooms: number | null
  bathrooms: number | null
  max_guests: number | null
  archived_at: string | null
}

/**
 * Unidades que la llave puede ver, opcionalmente filtradas por `building_id`
 * y `unit_id` de la query. Pedir un edificio o unidad fuera del alcance → 403
 * (sin distinguir "no existe" de "no es tuyo").
 */
export async function loadScopedUnits(ctx: ConnectorCtx): Promise<ScopedUnit[]> {
  const { db, key, params } = ctx
  const buildingParam = optionalUuid(params, 'building_id')
  const unitParam = optionalUuid(params, 'unit_id')

  if (buildingParam && key.building_ids && !key.building_ids.includes(buildingParam)) {
    throw outOfScope('El edificio está fuera del alcance de esta llave')
  }

  const buildings = await readAll<{ id: string; name: string | null }>(
    () => db.from('buildings').select('id, name').eq('org_id', key.org_id),
    'buildings',
  )
  const allowedBuildings = new Map(
    buildings
      .filter((b) => !key.building_ids || key.building_ids.includes(b.id))
      .filter((b) => !buildingParam || b.id === buildingParam)
      .map((b) => [b.id, b.name]),
  )
  if (buildingParam && !allowedBuildings.has(buildingParam)) {
    throw outOfScope('El edificio está fuera del alcance de esta llave')
  }

  const units = await readAll<Omit<ScopedUnit, 'building_name'> & { org_id: string }>(
    () =>
      db
        .from('units')
        .select('id, org_id, building_id, number, type, bedrooms, bathrooms, max_guests, archived_at')
        .eq('org_id', key.org_id),
    'units',
  )
  const scoped = units
    .filter((u) => u.org_id === key.org_id && allowedBuildings.has(u.building_id))
    .filter((u) => !unitParam || u.id === unitParam)
    .map(({ org_id: _org, ...u }) => ({ ...u, building_name: allowedBuildings.get(u.building_id) ?? null }))

  if (unitParam && scoped.length === 0) {
    throw outOfScope('La unidad está fuera del alcance de esta llave')
  }
  return scoped
}

export interface ReservationRow {
  id: string
  organization_id: string | null
  unit_id: string
  guest_name: string | null
  check_in: string
  check_out: string
  status: string
  total_price: unknown
  amount_paid: unknown
  payment_status: string | null
  channel: string | null
  platform: string | null
  external_id: string | null
  guests_count: number | null
  created_at: string | null
  updated_at: string | null
}

const RESERVATION_COLUMNS =
  'id, organization_id, unit_id, guest_name, check_in, check_out, status, total_price, amount_paid, payment_status, channel, platform, external_id, guests_count, created_at, updated_at'

/** Reservas de las unidades con al menos una noche en el periodo. */
export async function loadReservations(
  db: Db,
  orgId: string,
  unitIds: string[],
  period: Period,
  statuses: readonly string[],
): Promise<ReservationRow[]> {
  const out: ReservationRow[] = []
  for (const chunk of chunks(unitIds, IN_CHUNK)) {
    const rows = await readAll<ReservationRow>(
      () =>
        db
          .from('reservations')
          .select(RESERVATION_COLUMNS)
          .in('unit_id', chunk)
          .in('status', statuses as string[])
          .lt('check_in', period.to)
          .gt('check_out', period.from),
      'reservations',
    )
    // Algunas reservas (checkout público) se insertan sin organization_id; el
    // dueño real es la unidad. Si sí trae org, debe ser la de la llave.
    out.push(...rows.filter((r) => !r.organization_id || r.organization_id === orgId))
  }
  return out
}

export interface ContractRow {
  id: string
  unit_id: string
  status: string
  start_date: string
  end_date: string | null
}

/** Contratos de las unidades que arrancan antes del fin del periodo. */
export async function loadContracts(
  db: Db,
  orgId: string,
  unitIds: string[],
  period: Period,
): Promise<ContractRow[]> {
  const out: ContractRow[] = []
  for (const chunk of chunks(unitIds, IN_CHUNK)) {
    const rows = await readAll<ContractRow>(
      () =>
        db
          .from('contracts')
          .select('id, unit_id, status, start_date, end_date')
          .eq('org_id', orgId)
          .in('unit_id', chunk)
          .lt('start_date', period.to),
      'contracts',
    )
    out.push(...rows.filter((c) => c.end_date === null || c.end_date >= period.from))
  }
  return out
}

export interface BlockRow {
  id: string
  unit_id: string
  start_date: string
  end_date: string
}

export async function loadBlocks(
  db: Db,
  orgId: string,
  unitIds: string[],
  period: Period,
): Promise<BlockRow[]> {
  const out: BlockRow[] = []
  for (const chunk of chunks(unitIds, IN_CHUNK)) {
    out.push(
      ...(await readAll<BlockRow>(
        () =>
          db
            .from('unit_blocks')
            .select('id, unit_id, start_date, end_date')
            .eq('org_id', orgId)
            .in('unit_id', chunk)
            .lt('start_date', period.to)
            .gte('end_date', period.from),
        'unit_blocks',
      )),
    )
  }
  return out
}

export function groupByUnit<T extends { unit_id: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    if (!m.has(r.unit_id)) m.set(r.unit_id, [])
    m.get(r.unit_id)!.push(r)
  }
  return m
}
