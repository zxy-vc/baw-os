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

/** Supabase en memoria: solo aplica filtros .eq(), suficiente para org scoping. */
function makeDb(tables: Record<string, Row[]>) {
  function from(table: string) {
    const state = {
      op: 'select' as 'select' | 'insert' | 'update',
      filters: [] as [string, unknown][],
      payload: null as Row | null,
      single: false,
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
      if (state.single) {
        return rows.length
          ? { data: rows[0], error: null }
          : { data: null, error: { message: 'not found' } }
      }
      return { data: rows, error: null }
    }
    const b = {
      select: () => b,
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
        state.single = true
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
  const contractB = { id: 'contract-b', org_id: ORG_B, unit: { type: 'LTR', number: '1' } }
  const contractA = { id: 'contract-a', org_id: ORG_A, unit: { type: 'LTR', number: '2' } }
  tables = {
    invoices: [
      { id: 'inv-a', org_id: ORG_A, status: 'valid', facturapi_id: 'fx_a', contract_id: null, payment_id: null },
      { id: 'inv-b', org_id: ORG_B, status: 'valid', facturapi_id: 'fx_b', contract_id: null, payment_id: null },
    ],
    payments: [
      { id: 'pay-a', org_id: ORG_A, status: 'paid', amount: 1000, contract: contractA },
      { id: 'pay-b', org_id: ORG_B, status: 'paid', amount: 1000, contract: contractB },
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
    expect(json.data.invoices.map((i: Row) => i.id)).toEqual(['inv-a'])
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

  it('pago propio → factura con org_id del caller', async () => {
    h.auth = member('pm_admin')
    const res = await listRoute.POST(req('/api/invoices', postBody('pay-a')))
    expect(res.status).toBe(201)
    expect(h.createInvoice).toHaveBeenCalledTimes(1)
    const inserted = tables.invoices.find((i) => i.facturapi_id === 'fx_new')
    expect(inserted?.org_id).toBe(ORG_A)
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
