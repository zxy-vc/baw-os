// BAW-2 PR1: las rutas de facturas exigen sesión y quedan acotadas a la org
// del caller. FacturAPI está 100% mockeado — estos tests nunca tocan LIVE.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>

const h = vi.hoisted(() => ({
  auth: null as unknown,
  db: null as unknown,
  createInvoice: vi.fn(),
  cancelInvoice: vi.fn(),
  downloadInvoice: vi.fn(),
}))

vi.mock('@/lib/admin-auth', () => ({
  requireMemberCaller: async () => h.auth,
}))
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  createServiceClient: () => h.db,
}))
vi.mock('@/lib/facturapi', () => ({
  isMockMode: false,
  createInvoice: h.createInvoice,
  cancelInvoice: h.cancelInvoice,
  downloadInvoice: h.downloadInvoice,
}))

import * as listRoute from '@/app/api/invoices/route'
import * as detailRoute from '@/app/api/invoices/[id]/route'
import * as pdfRoute from '@/app/api/invoices/[id]/pdf/route'
import * as xmlRoute from '@/app/api/invoices/[id]/xml/route'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'

/**
 * Supabase en memoria: solo aplica filtros .eq(), suficiente para org scoping.
 * No resuelve embeds (`contract:contracts(...)`): si una ruta vuelve a pedir
 * joins, la query falla — los joins de PostgREST no filtran hijos por org.
 */
function makeDb(tables: Record<string, Row[]>) {
  function from(table: string) {
    const state = {
      op: 'select' as 'select' | 'insert' | 'update',
      filters: [] as [string, unknown][],
      payload: null as Row | null,
      single: null as null | 'single' | 'maybeSingle',
    }
    const exec = () => {
      let rows = (tables[table] ?? []).filter((r) =>
        state.filters.every(([k, v]) => r[k] === v),
      )
      if (state.op === 'insert') {
        const row = { id: `new-${table}`, ...state.payload }
        tables[table] = [...(tables[table] ?? []), row]
        rows = [row]
      }
      if (state.op === 'update') rows.forEach((r) => Object.assign(r, state.payload))
      if (state.single === 'single') {
        return rows.length
          ? { data: rows[0], error: null }
          : { data: null, error: { message: 'not found' } }
      }
      if (state.single === 'maybeSingle') return { data: rows[0] ?? null, error: null }
      return { data: rows, error: null }
    }
    const b = {
      select: (cols?: string) => {
        if (cols?.includes('(')) throw new Error(`fake db: embed no soportado en ${table}: ${cols}`)
        return b
      },
      order: () => b,
      gte: () => b,
      lt: () => b,
      eq: (k: string, v: unknown) => {
        state.filters.push([k, v])
        return b
      },
      insert: (p: Row) => {
        state.op = 'insert'
        state.payload = p
        return b
      },
      update: (p: Row) => {
        state.op = 'update'
        state.payload = p
        return b
      },
      single: () => {
        state.single = 'single'
        return b
      },
      maybeSingle: () => {
        state.single = 'maybeSingle'
        return b
      },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(exec()).then(res, rej),
    }
    return b
  }
  return { from }
}

function member(role: string, orgId = ORG_A) {
  return { ok: true, userId: 'user-1', orgId, isPlatformAdmin: false, role }
}

const noSession = { ok: false, status: 401, message: 'No authenticated user' }

let tables: Record<string, Row[]>

beforeEach(() => {
  vi.clearAllMocks()
  // Cadenas coherentes (ct-a, ct-b) y cadenas de A con un hijo de B en cada
  // salto: el esquema solo tiene FK por id, así que RLS/FK no las impiden.
  tables = {
    invoices: [
      { id: 'inv-a', org_id: ORG_A, status: 'valid', facturapi_id: 'fx_a', contract_id: null, payment_id: null },
      { id: 'inv-b', org_id: ORG_B, status: 'valid', facturapi_id: 'fx_b', contract_id: null, payment_id: null },
      { id: 'inv-a-full', org_id: ORG_A, status: 'valid', facturapi_id: 'fx_af', contract_id: 'ct-a', payment_id: 'pay-a' },
      { id: 'inv-a-xct', org_id: ORG_A, status: 'valid', facturapi_id: 'fx_1', contract_id: 'ct-b', payment_id: null },
      { id: 'inv-a-xunit', org_id: ORG_A, status: 'valid', facturapi_id: 'fx_2', contract_id: 'ct-a-xunit', payment_id: null },
      { id: 'inv-a-xocc', org_id: ORG_A, status: 'valid', facturapi_id: 'fx_3', contract_id: 'ct-a-xocc', payment_id: null },
      { id: 'inv-a-xpay', org_id: ORG_A, status: 'valid', facturapi_id: 'fx_4', contract_id: 'ct-a', payment_id: 'pay-b' },
    ],
    payments: [
      { id: 'pay-a', org_id: ORG_A, status: 'paid', amount: 1000, contract_id: 'ct-a' },
      { id: 'pay-b', org_id: ORG_B, status: 'paid', amount: 1000, contract_id: 'ct-b' },
      { id: 'pay-a-xct', org_id: ORG_A, status: 'paid', amount: 1000, contract_id: 'ct-b' },
      { id: 'pay-a-xunit', org_id: ORG_A, status: 'paid', amount: 1000, contract_id: 'ct-a-xunit' },
      { id: 'pay-a-xocc', org_id: ORG_A, status: 'paid', amount: 1000, contract_id: 'ct-a-xocc' },
    ],
    contracts: [
      { id: 'ct-a', org_id: ORG_A, unit_id: 'unit-a', occupant_id: 'occ-a' },
      { id: 'ct-b', org_id: ORG_B, unit_id: 'unit-b', occupant_id: 'occ-b' },
      { id: 'ct-a-xunit', org_id: ORG_A, unit_id: 'unit-b', occupant_id: 'occ-a' },
      { id: 'ct-a-xocc', org_id: ORG_A, unit_id: 'unit-a', occupant_id: 'occ-b' },
    ],
    units: [
      { id: 'unit-a', org_id: ORG_A, type: 'LTR', number: 'A-101' },
      { id: 'unit-b', org_id: ORG_B, type: 'STR', number: 'B-909' },
    ],
    occupants: [
      { id: 'occ-a', org_id: ORG_A, name: 'Ana A', email: 'ana@a.mx', cp_fiscal: '11111', regimen_fiscal: '605' },
      { id: 'occ-b', org_id: ORG_B, name: 'Beto B', email: 'beto@b.mx', cp_fiscal: '99999', regimen_fiscal: '612' },
    ],
  }
  h.db = makeDb(tables)
  h.createInvoice.mockResolvedValue({ id: 'fx_new', folio_number: 7 })
  h.cancelInvoice.mockResolvedValue({})
  h.downloadInvoice.mockResolvedValue(new Response('file'))
})

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`http://localhost${url}`, init)

const postBody = (payment_id: string) => ({
  method: 'POST',
  body: JSON.stringify({ payment_id, rfc: 'XAXX010101000', legal_name: 'Público' }),
})

describe('GET /api/invoices', () => {
  it('sin sesión → 401', async () => {
    h.auth = noSession
    const res = await listRoute.GET(req('/api/invoices'))
    expect(res.status).toBe(401)
  })

  it('solo devuelve facturas de la org del caller', async () => {
    h.auth = member('pm_viewer')
    const res = await listRoute.GET(req('/api/invoices'))
    const json = await res.json()
    const orgs = json.data.invoices.map((i: Row) => i.org_id)
    expect(orgs.length).toBeGreaterThan(0)
    expect(new Set(orgs)).toEqual(new Set([ORG_A]))
    expect(json.data.invoices.map((i: Row) => i.id)).not.toContain('inv-b')
  })
})

describe('POST /api/invoices', () => {
  it('rol sin finance.emit_cfdi → 403 sin llamar FacturAPI', async () => {
    h.auth = member('pm_operator')
    const res = await listRoute.POST(req('/api/invoices', postBody('pay-a')))
    expect(res.status).toBe(403)
    expect(h.createInvoice).not.toHaveBeenCalled()
  })

  it('pago de otra org → 404 sin llamar FacturAPI', async () => {
    h.auth = member('pm_admin')
    const res = await listRoute.POST(req('/api/invoices', postBody('pay-b')))
    expect(res.status).toBe(404)
    expect(h.createInvoice).not.toHaveBeenCalled()
  })

  it.each([
    ['pago propio → contrato de B', 'pay-a-xct'],
    ['contrato propio → unidad de B', 'pay-a-xunit'],
    ['contrato propio → ocupante de B', 'pay-a-xocc'],
  ])('%s → 404, sin FacturAPI ni factura', async (_name, paymentId) => {
    h.auth = member('pm_admin')
    const before = tables.invoices.length
    const res = await listRoute.POST(req('/api/invoices', postBody(paymentId)))
    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).not.toMatch(/Beto|beto@b\.mx|B-909/)
    expect(h.createInvoice).not.toHaveBeenCalled()
    expect(tables.invoices).toHaveLength(before)
  })

  it('pago propio → FacturAPI recibe solo datos de la org y la factura queda en ella', async () => {
    h.auth = member('pm_admin')
    const res = await listRoute.POST(req('/api/invoices', postBody('pay-a')))
    expect(res.status).toBe(201)
    expect(h.createInvoice).toHaveBeenCalledTimes(1)
    const sent = h.createInvoice.mock.calls[0][0]
    expect(sent.customer).toMatchObject({ email: 'ana@a.mx', tax_system: '605', address: { zip: '11111' } })
    expect(sent.items[0].product.description).toBe('Renta mensual — Unidad A-101')
    expect(sent.use).toBe('S01')
    expect(JSON.stringify(sent)).not.toMatch(/Beto|beto@b\.mx|B-909|99999/)
    const inserted = tables.invoices.find((i) => i.facturapi_id === 'fx_new')
    expect(inserted).toMatchObject({ org_id: ORG_A, contract_id: 'ct-a', payment_id: 'pay-a' })
  })
})

describe('GET/DELETE /api/invoices/[id]', () => {
  it('sin sesión → 401 sin cancelar', async () => {
    h.auth = noSession
    const res = await detailRoute.DELETE(req('/api/invoices/inv-a'), { params: { id: 'inv-a' } })
    expect(res.status).toBe(401)
    expect(h.cancelInvoice).not.toHaveBeenCalled()
  })

  it('GET de factura de otra org → 404', async () => {
    h.auth = member('pm_admin')
    const res = await detailRoute.GET(req('/api/invoices/inv-b'), { params: { id: 'inv-b' } })
    expect(res.status).toBe(404)
  })

  it.each([
    ['factura propia → contrato de B', 'inv-a-xct'],
    ['contrato propio → unidad de B', 'inv-a-xunit'],
    ['contrato propio → ocupante de B', 'inv-a-xocc'],
    ['factura propia → pago de B', 'inv-a-xpay'],
  ])('GET %s → 404 sin datos de B', async (_name, id) => {
    h.auth = member('pm_viewer')
    const res = await detailRoute.GET(req(`/api/invoices/${id}`), { params: { id } })
    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).not.toMatch(/Beto|beto@b\.mx|B-909|pay-b|ct-b/)
  })

  it('GET de factura propia → contrato, unidad, ocupante y pago de la org', async () => {
    h.auth = member('pm_viewer')
    const res = await detailRoute.GET(req('/api/invoices/inv-a-full'), { params: { id: 'inv-a-full' } })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.contract).toMatchObject({ id: 'ct-a', unit: { number: 'A-101' }, occupant: { name: 'Ana A' } })
    expect(data.payment).toMatchObject({ id: 'pay-a', org_id: ORG_A })
  })

  it('DELETE de factura de otra org → 404 sin cancelar en FacturAPI', async () => {
    h.auth = member('pm_owner')
    const res = await detailRoute.DELETE(req('/api/invoices/inv-b'), { params: { id: 'inv-b' } })
    expect(res.status).toBe(404)
    expect(h.cancelInvoice).not.toHaveBeenCalled()
    expect(tables.invoices.find((i) => i.id === 'inv-b')?.status).toBe('valid')
  })

  it('DELETE con rol sin finance.emit_cfdi → 403', async () => {
    h.auth = member('pm_viewer')
    const res = await detailRoute.DELETE(req('/api/invoices/inv-a'), { params: { id: 'inv-a' } })
    expect(res.status).toBe(403)
    expect(h.cancelInvoice).not.toHaveBeenCalled()
  })

  it('DELETE de factura propia → cancela', async () => {
    h.auth = member('pm_admin')
    const res = await detailRoute.DELETE(req('/api/invoices/inv-a'), { params: { id: 'inv-a' } })
    expect(res.status).toBe(200)
    expect(h.cancelInvoice).toHaveBeenCalledWith('fx_a')
    expect(tables.invoices.find((i) => i.id === 'inv-a')?.status).toBe('cancelled')
  })
})

describe.each([
  ['pdf', pdfRoute],
  ['xml', xmlRoute],
])('GET /api/invoices/[id]/%s', (format, route) => {
  it('sin sesión → 401', async () => {
    h.auth = noSession
    const res = await route.GET(req(`/api/invoices/inv-a/${format}`), { params: { id: 'inv-a' } })
    expect(res.status).toBe(401)
  })

  it('factura de otra org → 404 sin descargar', async () => {
    h.auth = member('pm_viewer')
    const res = await route.GET(req(`/api/invoices/inv-b/${format}`), { params: { id: 'inv-b' } })
    expect(res.status).toBe(404)
    expect(h.downloadInvoice).not.toHaveBeenCalled()
  })

  it('factura propia → descarga', async () => {
    h.auth = member('pm_viewer')
    const res = await route.GET(req(`/api/invoices/inv-a/${format}`), { params: { id: 'inv-a' } })
    expect(res.status).toBe(200)
    expect(h.downloadInvoice).toHaveBeenCalledWith('fx_a', format)
  })
})
