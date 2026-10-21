// ENG-624 · Conector v1: autenticación por llave, alcance por edificio,
// revocación, rastro de lecturas, idempotencia de lectura y solo-lectura.
//
// Real: las rutas /api/connectors/v1/*, connectorRead (hash + bitácora), la
// carga con alcance y las reglas; las rutas de admin con requireAdminCaller y
// resolveOrgId reales (membresía y rol leídos del Supabase en memoria).
// Simulado: Supabase (en memoria, tests/connectors/fake-db.ts), auth.getUser()
// y cookies().
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { makeFakeDb, type Row } from './fake-db'
import { buildFixture, KEYS, KEY_IDS, ORG_A, B1, B2, B3, U1, U3, U4, R } from './fixture'

const h = vi.hoisted(() => ({
  user: null as null | { id: string },
  db: null as unknown,
}))

vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [], set: () => {} }),
}))
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  }),
}))
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  createServiceClient: () => h.db,
}))
vi.mock('@/lib/supabase', () => ({ createServiceClient: () => h.db }))

import * as unitsRoute from '@/app/api/connectors/v1/units/route'
import * as reservationsRoute from '@/app/api/connectors/v1/reservations/route'
import * as occupancyRoute from '@/app/api/connectors/v1/occupancy/route'
import * as revenueRoute from '@/app/api/connectors/v1/revenue/route'
import * as guestsRoute from '@/app/api/connectors/v1/guests/route'
import * as adminKeysRoute from '@/app/api/admin/connectors/keys/route'
import * as adminKeyRoute from '@/app/api/admin/connectors/keys/[id]/route'
import * as adminLogRoute from '@/app/api/admin/connectors/keys/[id]/access-log/route'

type Db = ReturnType<typeof makeFakeDb>
let db: Db
let tables: Record<string, Row[]>

const OCT = { from: '2026-10-01', to: '2026-11-01' }

const ROUTES = {
  units: unitsRoute,
  reservations: reservationsRoute,
  occupancy: occupancyRoute,
  revenue: revenueRoute,
  guests: guestsRoute,
} as const

function req(dataset: keyof typeof ROUTES, key: string | null, query: Record<string, string> = {}) {
  const url = new URL(`http://localhost/api/connectors/v1/${dataset}`)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  const headers: Record<string, string> = { 'user-agent': 'engrane-test/1.0', 'x-forwarded-for': '203.0.113.7' }
  if (key) headers.authorization = `Bearer ${key}`
  return new NextRequest(url, { headers })
}

async function read(dataset: keyof typeof ROUTES, key: string | null, query: Record<string, string> = {}) {
  const res = await ROUTES[dataset].GET(req(dataset, key, query))
  return { status: res.status, body: await res.json(), headers: res.headers }
}

const log = () => tables.connector_access_log

beforeEach(async () => {
  tables = await buildFixture()
  db = makeFakeDb(tables, {
    checkInsert: (table, row, all) =>
      table === 'connector_keys' &&
      all.connector_keys.some(
        (k) =>
          k.status === 'active' &&
          k.org_id === row.org_id &&
          k.consumer === row.consumer &&
          k.consumer_ref === row.consumer_ref,
      )
        ? 'duplicate key value violates unique constraint "connector_keys_one_active_per_consumer"'
        : null,
  })
  h.db = db
  h.user = null
})

describe('autenticación por llave', () => {
  it('sin Authorization → 401 y no deja rastro (no hay org a quién atribuirlo)', async () => {
    const r = await read('units', null)
    expect(r.status).toBe(401)
    expect(r.body.error.code).toBe('missing_credentials')
    expect(log()).toHaveLength(0)
  })

  it('una credencial de agente (sk_live_) no sirve en el conector', async () => {
    const r = await read('units', 'sk_live_' + 'a1'.repeat(24))
    expect(r.status).toBe(401)
    expect(r.body.error.code).toBe('invalid_key')
  })

  it('llave con prefijo conocido pero hash distinto → 401', async () => {
    const r = await read('units', KEYS.unknownSamePrefix)
    expect(r.status).toBe(401)
    expect(r.body.error.code).toBe('invalid_key')
    expect(log()).toHaveLength(0)
  })

  it('llave válida → 200 con as_of, source y alcance', async () => {
    const r = await read('units', KEYS.fullA)
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(new Date(r.body.as_of).toISOString()).toBe(r.body.as_of)
    expect(r.body.source).toMatchObject({ system: 'baw-os', api: 'connectors/v1', dataset: 'units' })
    expect(r.body.source.rules).toMatch(/^connectors-v1\./)
    expect(r.body.scope).toEqual({ org_id: ORG_A, building_ids: 'all' })
  })

  it('cada respuesta, también de error con llave reconocida, trae as_of y source', async () => {
    for (const ds of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
      const ok = await read(ds, KEYS.fullA, OCT)
      expect(ok.status, ds).toBe(200)
      expect(ok.body.as_of, ds).toBeTruthy()
      expect(ok.body.source.dataset, ds).toBe(ds)
    }
    const bad = await read('occupancy', KEYS.fullA, { from: '2026-10-01' })
    expect(bad.status).toBe(400)
    expect(bad.body.as_of).toBeTruthy()
    expect(bad.body.source.dataset).toBe('occupancy')
  })

  it('una llave solo ve su org: Org B no ve nada de Org A y viceversa', async () => {
    const a = await read('units', KEYS.fullA)
    const b = await read('units', KEYS.fullB)
    const aIds = a.body.data.map((u: Row) => u.id)
    const bIds = b.body.data.map((u: Row) => u.id)
    expect(aIds).not.toContain(bIds[0])
    expect(b.body.data.every((u: Row) => u.building_id === B3)).toBe(true)

    const resA = await read('reservations', KEYS.fullA, OCT)
    const ids = resA.body.data.map((x: Row) => x.id)
    expect(ids).not.toContain(R.R9) // reserva de Org B
    expect(ids).not.toContain(R.Rx) // fila con organization_id de Org B sobre una unidad de A
  })

  it('una llave sin el dataset → 403 y queda registrada', async () => {
    const ok = await read('units', KEYS.unitsOnly)
    expect(ok.status).toBe(200)
    const r = await read('guests', KEYS.unitsOnly, OCT)
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('dataset_not_allowed')
    expect(log().at(-1)).toMatchObject({ key_id: KEY_IDS.unitsOnly, outcome: 'denied_dataset', http_status: 403 })
  })

  it('llave vencida → 401 y queda registrada', async () => {
    const r = await read('units', KEYS.expired)
    expect(r.status).toBe(401)
    expect(r.body.error.code).toBe('key_expired')
    expect(log().at(-1)).toMatchObject({ key_id: KEY_IDS.expired, outcome: 'denied_expired' })
  })
})

describe('alcance por edificio', () => {
  it('una llave limitada a B2 solo ve unidades de B2', async () => {
    const r = await read('units', KEYS.b2Only)
    expect(r.status).toBe(200)
    expect(r.body.scope.building_ids).toEqual([B2])
    expect(r.body.data.map((u: Row) => u.id).sort()).toEqual([U3, U4].sort())
  })

  it('reservas, huéspedes, ocupación e ingresos respetan el edificio', async () => {
    const resv = await read('reservations', KEYS.b2Only, OCT)
    expect(resv.body.data.map((x: Row) => x.id).sort()).toEqual([R.R6, R.R7].sort())
    const guests = await read('guests', KEYS.b2Only, OCT)
    expect(guests.body.data.every((g: Row) => g.unit_id === U3)).toBe(true)
    const occ = await read('occupancy', KEYS.b2Only, OCT)
    expect(occ.body.data.by_unit.map((u: Row) => u.unit_id)).toEqual([U3])
    const rev = await read('revenue', KEYS.b2Only, OCT)
    expect(rev.body.data.totals.revenue_mxn).toBe(3400.01)
  })

  it('pedir un edificio fuera del alcance → 403 denied_scope (registrado)', async () => {
    const r = await read('units', KEYS.b2Only, { building_id: B1 })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('out_of_scope')
    expect(log().at(-1)).toMatchObject({ key_id: KEY_IDS.b2Only, outcome: 'denied_scope', http_status: 403 })
  })

  it('pedir una unidad de otro edificio → 403 (igual que si no existiera)', async () => {
    const r = await read('occupancy', KEYS.b2Only, { ...OCT, unit_id: U1 })
    expect(r.status).toBe(403)
    const ajena = await read('occupancy', KEYS.fullA, { ...OCT, unit_id: '20000000-0000-4000-8000-000000000009' })
    expect(ajena.status).toBe(403)
  })

  it('un edificio de otra org nunca entra aunque se pida explícito', async () => {
    const r = await read('units', KEYS.fullA, { building_id: B3 })
    expect(r.status).toBe(403)
  })

  it('filtro building_id dentro del alcance funciona', async () => {
    const r = await read('units', KEYS.fullA, { building_id: B2 })
    expect(r.status).toBe(200)
    expect(r.body.data.every((u: Row) => u.building_id === B2)).toBe(true)
  })
})

describe('revocación', () => {
  it('una llave revocada → 401 key_revoked y el intento queda registrado', async () => {
    const r = await read('units', KEYS.revoked)
    expect(r.status).toBe(401)
    expect(r.body.error.code).toBe('key_revoked')
    expect(log().at(-1)).toMatchObject({ key_id: KEY_IDS.revoked, outcome: 'denied_revoked', http_status: 401 })
  })

  it('revocar desde admin corta la siguiente lectura', async () => {
    expect((await read('units', KEYS.fullA)).status).toBe(200)
    h.user = { id: 'user-admin-a' }
    const res = await adminKeyRoute.DELETE(
      new NextRequest(`http://localhost/api/admin/connectors/keys/${KEY_IDS.fullA}`, { method: 'DELETE' }),
      { params: { id: KEY_IDS.fullA } },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.status).toBe('revoked')
    expect(body.data).not.toHaveProperty('key_hash')
    const after = await read('units', KEYS.fullA)
    expect(after.status).toBe(401)
    expect(after.body.error.code).toBe('key_revoked')
  })

  it('un admin no puede revocar la llave de otra org', async () => {
    h.user = { id: 'user-admin-a' }
    const res = await adminKeyRoute.DELETE(
      new NextRequest(`http://localhost/api/admin/connectors/keys/${KEY_IDS.fullB}`, { method: 'DELETE' }),
      { params: { id: KEY_IDS.fullB } },
    )
    expect(res.status).toBe(404)
    expect((await read('units', KEYS.fullB)).status).toBe(200)
  })
})

describe('gestión de llaves (admin)', () => {
  const post = (body: unknown) =>
    adminKeysRoute.POST(
      new NextRequest('http://localhost/api/admin/connectors/keys', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
    )

  it('sin sesión → 401; un pm_viewer → 403', async () => {
    expect((await post({ consumer_ref: 'x', label: 'x' })).status).toBe(401)
    h.user = { id: 'user-viewer-a' }
    expect((await post({ consumer_ref: 'x', label: 'x' })).status).toBe(403)
  })

  it('crea la llave: el valor sale UNA vez, en base solo queda el hash, y sirve para leer', async () => {
    h.user = { id: 'user-admin-a' }
    const res = await post({ consumer_ref: 'engrane-space-nuevo', label: 'Engrane · Torre', building_ids: [B2] })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.api_key).toMatch(/^ck_live_[0-9a-f]{48}$/)
    expect(data).not.toHaveProperty('key_hash')

    const stored = tables.connector_keys.find((k) => k.consumer_ref === 'engrane-space-nuevo')!
    expect(stored.key_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(stored)).not.toContain(data.api_key)
    expect(stored).toMatchObject({ org_id: ORG_A, building_ids: [B2], created_by: 'user-admin-a' })

    const list = await (await adminKeysRoute.GET()).json()
    expect(JSON.stringify(list)).not.toContain(data.api_key)
    expect(list.data.every((k: Row) => !('key_hash' in k))).toBe(true)

    const r = await read('units', data.api_key)
    expect(r.status).toBe(200)
    expect(r.body.data.every((u: Row) => u.building_id === B2)).toBe(true)
  })

  it('una sola llave activa por espacio de Engrane → 409', async () => {
    h.user = { id: 'user-admin-a' }
    const res = await post({ consumer_ref: 'engrane-space-a', label: 'duplicada' })
    expect(res.status).toBe(409)
  })

  it('no acepta edificios de otra org', async () => {
    h.user = { id: 'user-admin-a' }
    const res = await post({ consumer_ref: 'engrane-space-z', label: 'z', building_ids: [B3] })
    expect(res.status).toBe(400)
  })

  it('no acepta datasets desconocidos', async () => {
    h.user = { id: 'user-admin-a' }
    const res = await post({ consumer_ref: 'engrane-space-z', label: 'z', datasets: ['payments'] })
    expect(res.status).toBe(400)
  })
})

describe('rastro de cada lectura', () => {
  it('registra quién, cuándo y qué (endpoint, query, filas, ip, agente)', async () => {
    const r = await read('reservations', KEYS.fullA, { ...OCT, limit: '2' })
    expect(r.status).toBe(200)
    expect(log()).toHaveLength(1)
    expect(log()[0]).toMatchObject({
      key_id: KEY_IDS.fullA,
      org_id: ORG_A,
      consumer: 'engrane',
      consumer_ref: 'engrane-space-a',
      dataset: 'reservations',
      endpoint: '/api/connectors/v1/reservations',
      query: { ...OCT, limit: '2' },
      outcome: 'ok',
      http_status: 200,
      row_count: 2,
      ip: '203.0.113.7',
      user_agent: 'engrane-test/1.0',
    })
    expect(log()[0].created_at).toBeTruthy()
  })

  it('los admins de la org leen el rastro de su llave', async () => {
    await read('units', KEYS.fullA)
    await read('guests', KEYS.fullA, OCT)
    h.user = { id: 'user-admin-a' }
    const res = await adminLogRoute.GET(
      new NextRequest(`http://localhost/api/admin/connectors/keys/${KEY_IDS.fullA}/access-log`),
      { params: { id: KEY_IDS.fullA } },
    )
    const body = await res.json()
    expect(body.data.map((e: Row) => e.dataset).sort()).toEqual(['guests', 'units'])
  })

  it('si la bitácora no se puede escribir, no se sirven datos (503)', async () => {
    h.db = makeFakeDb(tables, { failInsert: new Set(['connector_access_log']) })
    const r = await read('guests', KEYS.fullA, OCT)
    expect(r.status).toBe(503)
    expect(r.body.error.code).toBe('audit_unavailable')
    expect(r.body).not.toHaveProperty('data')
  })
})

describe('solo lectura e idempotencia', () => {
  it('leer dos veces lo mismo da los mismos datos y no escribe nada fuera de la bitácora', async () => {
    const before = JSON.stringify({ ...tables, connector_access_log: [] })
    for (const ds of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
      const a = await read(ds, KEYS.fullA, OCT)
      const b = await read(ds, KEYS.fullA, OCT)
      expect(a.status, ds).toBe(200)
      expect(b.body.data, ds).toEqual(a.body.data)
      expect(b.body.pagination, ds).toEqual(a.body.pagination)
    }
    expect(JSON.stringify({ ...tables, connector_access_log: [] })).toBe(before)
    expect(db.writes.every((w) => w.table === 'connector_access_log' && w.op === 'insert')).toBe(true)
    expect(log()).toHaveLength(10)
  })

  it('las tablas de dinero de contratos (payments, payment_receipts) no se leen', async () => {
    const spy = vi.spyOn(db, 'from')
    await read('revenue', KEYS.fullA, OCT)
    await read('reservations', KEYS.fullA, OCT)
    const read_tables = new Set(spy.mock.calls.map((c) => c[0]))
    expect(read_tables.has('payments')).toBe(false)
    expect(read_tables.has('payment_receipts')).toBe(false)
    expect(read_tables.has('payment_ledger')).toBe(false)
  })

  it('las rutas del conector solo exportan GET', () => {
    const dir = path.resolve(__dirname, '../../src/app/api/connectors')
    const files: string[] = []
    const walk = (d: string) =>
      readdirSync(d).forEach((f) => {
        const p = path.join(d, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (f === 'route.ts') files.push(p)
      })
    walk(dir)
    expect(files.length).toBe(5)
    for (const f of files) {
      const src = readFileSync(f, 'utf-8')
      expect(src, f).not.toMatch(/export (const|async function) (POST|PUT|PATCH|DELETE)\b/)
      expect(src, f).not.toMatch(/\.(insert|update|upsert|delete)\(/)
    }
    for (const mod of Object.values(ROUTES)) {
      expect(Object.keys(mod).filter((k) => /^(POST|PUT|PATCH|DELETE)$/.test(k))).toEqual([])
    }
  })

  it('huéspedes: solo nombre y fechas (sin contacto ni documentos)', async () => {
    const r = await read('guests', KEYS.fullA, OCT)
    for (const g of r.body.data) {
      expect(Object.keys(g).sort()).toEqual(['check_in', 'check_out', 'guest_name', 'reservation_id', 'unit_id'])
    }
    expect(JSON.stringify(r.body)).not.toContain('huesped@example.com')
    expect(JSON.stringify(r.body)).not.toContain('+52 55')
    const resv = await read('reservations', KEYS.fullA, OCT)
    expect(JSON.stringify(resv.body)).not.toContain('Huésped')
  })

  it('paginación por cursor recorre todo sin repetir', async () => {
    const all = await read('reservations', KEYS.fullA, OCT)
    const seen: string[] = []
    let cursor: string | null = null
    do {
      const page: Awaited<ReturnType<typeof read>> = await read('reservations', KEYS.fullA, {
        ...OCT,
        limit: '2',
        ...(cursor ? { cursor } : {}),
      })
      seen.push(...page.body.data.map((x: Row) => x.id as string))
      cursor = page.body.pagination.next_cursor
    } while (cursor)
    expect(seen).toEqual(all.body.data.map((x: Row) => x.id))
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('valida el periodo', async () => {
    expect((await read('occupancy', KEYS.fullA, { from: '2026-10-01', to: '2026-10-01' })).status).toBe(400)
    expect((await read('occupancy', KEYS.fullA, { from: '2026-02-30', to: '2026-03-05' })).status).toBe(400)
    expect((await read('occupancy', KEYS.fullA, { from: '2026-01-01', to: '2027-01-03' })).status).toBe(400)
    expect(log().at(-1)).toMatchObject({ outcome: 'bad_request', http_status: 400 })
  })
})
