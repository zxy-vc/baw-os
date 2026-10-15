// BAW-2 PR1: las rutas de facturas exigen sesión y quedan acotadas a la org
// del caller. FacturAPI está 100% mockeado — estos tests nunca tocan LIVE.
// El resolver de sesión es el real (requireMemberCaller + resolveOrgId leen
// membresía, rol, is_active y la cookie de org activa del Supabase en memoria);
// solo se simulan auth.getUser() y cookies().
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>

const h = vi.hoisted(() => ({
  user: null as null | { id: string },
  cookies: {} as Record<string, string>,
  db: null as unknown,
  createInvoice: vi.fn(),
  cancelInvoice: vi.fn(),
  downloadInvoice: vi.fn(),
  /** Si se define, sustituye a resolveOrgId (simula una org activa ya obsoleta). */
  resolveOverride: null as null | (() => Promise<string>),
}))

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (name in h.cookies ? { name, value: h.cookies[name] } : undefined),
    getAll: () => Object.entries(h.cookies).map(([name, value]) => ({ name, value })),
    set: () => {},
  }),
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
vi.mock('@/lib/org-context', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/org-context')>()
  return { ...real, resolveOrgId: () => (h.resolveOverride ? h.resolveOverride() : real.resolveOrgId()) }
})
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

/** Usuario con membresía activa en A con ese rol. */
const member = (role: string) => `u-${role}-a`
const noSession = null

/** Sesión con el usuario `id`; `activeOrg` simula la cookie baw_active_org_id. */
function loginAs(id: string | null, activeOrg?: string) {
  h.user = id ? { id } : null
  h.cookies = activeOrg ? { baw_active_org_id: activeOrg } : {}
}

const membership = (user_id: string, org_id: string, role: string, is_active = true) => ({
  user_id,
  org_id,
  role,
  is_active,
  created_at: org_id === ORG_A ? '2026-01-01' : '2026-02-01',
})

let tables: Record<string, Row[]>

beforeEach(() => {
  vi.clearAllMocks()
  // Cadenas coherentes (ct-a, ct-b) y cadenas de A con un hijo de B en cada
  // salto: el esquema solo tiene FK por id, así que RLS/FK no las impiden.
  loginAs(null)
  h.resolveOverride = null
  tables = {
    platform_admins: [],
    org_members: [
      ...['pm_owner', 'pm_admin', 'pm_operator', 'pm_viewer'].map((r) => membership(member(r), ORG_A, r)),
      // Owner de A con la membresía revocada.
      membership('u-revoked-a', ORG_A, 'pm_owner', false),
      // Viewer activo en A y owner REVOCADO en B (la cookie intentará elegir B).
      membership('u-multi', ORG_A, 'pm_viewer'),
      membership('u-multi', ORG_B, 'pm_owner', false),
    ],
    invoices: [
      { id: 'inv-a', org_id: ORG_A, status: 'valid', facturapi_id: 'fx_a', contract_id: null, payment_id: null },
      { id: 'inv-b', org_id: ORG_B, status: 'valid', facturapi_id: 'fx_b', contract_id: null, payment_id: null },
      { id: 'inv-a-full', org_id: ORG_A, status: 'valid', facturapi_id: 'fx_af', contract_id: 'ct-a', payment_id: 'pay-a' },
      { id: 'inv-a-xct', org_id: ORG_A, status: 'valid', facturapi_id: 'fx_1', contract_id: 'ct-b', payment_id: null },
      { id: 'inv-a-xct2', org_id: ORG_A, status: 'valid', facturapi_id: 'fx_5', contract_id: 'ct-b-kids-a', payment_id: null },
      { id: 'inv-a-xunit', org_id: ORG_A, status: 'valid', facturapi_id: 'fx_2', contract_id: 'ct-a-xunit', payment_id: null },
      { id: 'inv-a-xocc', org_id: ORG_A, status: 'valid', facturapi_id: 'fx_3', contract_id: 'ct-a-xocc', payment_id: null },
      { id: 'inv-a-xpay', org_id: ORG_A, status: 'valid', facturapi_id: 'fx_4', contract_id: 'ct-a', payment_id: 'pay-b' },
    ],
    payments: [
      { id: 'pay-a', org_id: ORG_A, status: 'paid', amount: 1000, contract_id: 'ct-a' },
      { id: 'pay-b', org_id: ORG_B, status: 'paid', amount: 1000, contract_id: 'ct-b' },
      { id: 'pay-a-xct', org_id: ORG_A, status: 'paid', amount: 1000, contract_id: 'ct-b' },
      // Pago de B enlazado a un contrato de A (ejemplo original del revisor).
      { id: 'pay-b-on-ct-a', org_id: ORG_B, status: 'paid', amount: 1000, contract_id: 'ct-a' },
      { id: 'pay-a-xct2', org_id: ORG_A, status: 'paid', amount: 1000, contract_id: 'ct-b-kids-a' },
      { id: 'pay-a-xunit', org_id: ORG_A, status: 'paid', amount: 1000, contract_id: 'ct-a-xunit' },
      { id: 'pay-a-xocc', org_id: ORG_A, status: 'paid', amount: 1000, contract_id: 'ct-a-xocc' },
    ],
    contracts: [
      { id: 'ct-a', org_id: ORG_A, unit_id: 'unit-a', occupant_id: 'occ-a' },
      { id: 'ct-b', org_id: ORG_B, unit_id: 'unit-b', occupant_id: 'occ-b', notes: 'contrato de Beto' },
      // Contrato de B cuyos hijos son de A: solo el filtro del contrato lo rechaza.
      { id: 'ct-b-kids-a', org_id: ORG_B, unit_id: 'unit-a', occupant_id: 'occ-a', notes: 'contrato de Beto' },
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
    loginAs(noSession)
    const res = await listRoute.GET(req('/api/invoices'))
    expect(res.status).toBe(401)
  })

  it('solo devuelve facturas de la org del caller', async () => {
    loginAs(member('pm_viewer'))
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
    loginAs(member('pm_operator'))
    const res = await listRoute.POST(req('/api/invoices', postBody('pay-a')))
    expect(res.status).toBe(403)
    expect(h.createInvoice).not.toHaveBeenCalled()
  })

  it('pago de B enlazado a contrato de A, caller de A → 404 sin FacturAPI', async () => {
    loginAs(member('pm_admin'))
    const res = await listRoute.POST(req('/api/invoices', postBody('pay-b-on-ct-a')))
    expect(res.status).toBe(404)
    expect(h.createInvoice).not.toHaveBeenCalled()
  })

  it('pago de otra org → 404 sin llamar FacturAPI', async () => {
    loginAs(member('pm_admin'))
    const res = await listRoute.POST(req('/api/invoices', postBody('pay-b')))
    expect(res.status).toBe(404)
    expect(h.createInvoice).not.toHaveBeenCalled()
  })

  it.each([
    ['pago propio → contrato de B', 'pay-a-xct'],
    ['pago propio → contrato de B con hijos de A', 'pay-a-xct2'],
    ['contrato propio → unidad de B', 'pay-a-xunit'],
    ['contrato propio → ocupante de B', 'pay-a-xocc'],
  ])('%s → 404, sin FacturAPI ni factura', async (_name, paymentId) => {
    loginAs(member('pm_admin'))
    const before = tables.invoices.length
    const res = await listRoute.POST(req('/api/invoices', postBody(paymentId)))
    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).not.toMatch(/Beto|beto@b\.mx|B-909/)
    expect(h.createInvoice).not.toHaveBeenCalled()
    expect(tables.invoices).toHaveLength(before)
  })

  it('pago propio → FacturAPI recibe solo datos de la org y la factura queda en ella', async () => {
    loginAs(member('pm_admin'))
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
    loginAs(noSession)
    const res = await detailRoute.DELETE(req('/api/invoices/inv-a'), { params: { id: 'inv-a' } })
    expect(res.status).toBe(401)
    expect(h.cancelInvoice).not.toHaveBeenCalled()
  })

  it('GET de factura de otra org → 404', async () => {
    loginAs(member('pm_admin'))
    const res = await detailRoute.GET(req('/api/invoices/inv-b'), { params: { id: 'inv-b' } })
    expect(res.status).toBe(404)
  })

  it.each([
    ['factura propia → contrato de B', 'inv-a-xct'],
    ['factura propia → contrato de B con hijos de A', 'inv-a-xct2'],
    ['contrato propio → unidad de B', 'inv-a-xunit'],
    ['contrato propio → ocupante de B', 'inv-a-xocc'],
    ['factura propia → pago de B', 'inv-a-xpay'],
  ])('GET %s → 404 sin datos de B', async (_name, id) => {
    loginAs(member('pm_viewer'))
    const res = await detailRoute.GET(req(`/api/invoices/${id}`), { params: { id } })
    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).not.toMatch(/Beto|beto@b\.mx|B-909|pay-b|ct-b/)
  })

  it('GET de factura propia → contrato, unidad, ocupante y pago de la org', async () => {
    loginAs(member('pm_viewer'))
    const res = await detailRoute.GET(req('/api/invoices/inv-a-full'), { params: { id: 'inv-a-full' } })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.contract).toMatchObject({ id: 'ct-a', unit: { number: 'A-101' }, occupant: { name: 'Ana A' } })
    expect(data.payment).toMatchObject({ id: 'pay-a', org_id: ORG_A })
  })

  it('DELETE de factura de otra org → 404 sin cancelar en FacturAPI', async () => {
    loginAs(member('pm_owner'))
    const res = await detailRoute.DELETE(req('/api/invoices/inv-b'), { params: { id: 'inv-b' } })
    expect(res.status).toBe(404)
    expect(h.cancelInvoice).not.toHaveBeenCalled()
    expect(tables.invoices.find((i) => i.id === 'inv-b')?.status).toBe('valid')
  })

  it('DELETE con rol sin finance.emit_cfdi → 403', async () => {
    loginAs(member('pm_viewer'))
    const res = await detailRoute.DELETE(req('/api/invoices/inv-a'), { params: { id: 'inv-a' } })
    expect(res.status).toBe(403)
    expect(h.cancelInvoice).not.toHaveBeenCalled()
  })

  it('DELETE de factura propia → cancela', async () => {
    loginAs(member('pm_admin'))
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
    loginAs(noSession)
    const res = await route.GET(req(`/api/invoices/inv-a/${format}`), { params: { id: 'inv-a' } })
    expect(res.status).toBe(401)
  })

  it('factura de otra org → 404 sin descargar', async () => {
    loginAs(member('pm_viewer'))
    const res = await route.GET(req(`/api/invoices/inv-b/${format}`), { params: { id: 'inv-b' } })
    expect(res.status).toBe(404)
    expect(h.downloadInvoice).not.toHaveBeenCalled()
  })

  it('factura propia → descarga', async () => {
    loginAs(member('pm_viewer'))
    const res = await route.GET(req(`/api/invoices/inv-a/${format}`), { params: { id: 'inv-a' } })
    expect(res.status).toBe(200)
    expect(h.downloadInvoice).toHaveBeenCalledWith('fx_a', format)
  })
})

describe('membresía revocada (resolver real)', () => {
  const calls = () =>
    h.createInvoice.mock.calls.length + h.cancelInvoice.mock.calls.length + h.downloadInvoice.mock.calls.length

  it('owner con membresía revocada → 401 en todas las rutas, cero FacturAPI', async () => {
    loginAs('u-revoked-a')
    const before = tables.invoices.map((i) => ({ ...i }))
    const statuses = [
      (await listRoute.GET(req('/api/invoices'))).status,
      (await listRoute.POST(req('/api/invoices', postBody('pay-a')))).status,
      (await detailRoute.GET(req('/api/invoices/inv-a'), { params: { id: 'inv-a' } })).status,
      (await detailRoute.DELETE(req('/api/invoices/inv-a'), { params: { id: 'inv-a' } })).status,
      (await pdfRoute.GET(req('/api/invoices/inv-a/pdf'), { params: { id: 'inv-a' } })).status,
      (await xmlRoute.GET(req('/api/invoices/inv-a/xml'), { params: { id: 'inv-a' } })).status,
    ]
    expect(statuses).toEqual([401, 401, 401, 401, 401, 401])
    expect(calls()).toBe(0)
    expect(tables.invoices).toEqual(before)
  })

  it('cookie que elige la org de una membresía revocada → cae a su org activa', async () => {
    loginAs('u-multi', ORG_B)
    const list = await (await listRoute.GET(req('/api/invoices'))).json()
    expect(new Set(list.data.invoices.map((i: Row) => i.org_id))).toEqual(new Set([ORG_A]))
    const detail = await detailRoute.GET(req('/api/invoices/inv-b'), { params: { id: 'inv-b' } })
    expect(detail.status).toBe(404)
    const pdf = await pdfRoute.GET(req('/api/invoices/inv-b/pdf'), { params: { id: 'inv-b' } })
    expect(pdf.status).toBe(404)
    // En A es viewer: no puede emitir ni cancelar; en B (revocado, owner) tampoco.
    const post = await listRoute.POST(req('/api/invoices', postBody('pay-b')))
    const del = await detailRoute.DELETE(req('/api/invoices/inv-b'), { params: { id: 'inv-b' } })
    expect(post.status).toBe(403)
    expect(del.status).toBe(403)
    expect(calls()).toBe(0)
    expect(tables.invoices.find((i) => i.id === 'inv-b')?.status).toBe('valid')
  })

  it('aunque el resolver devuelva una org cuya membresía está revocada, el guard la rechaza', async () => {
    loginAs('u-revoked-a')
    h.resolveOverride = async () => ORG_A
    const res = await listRoute.POST(req('/api/invoices', postBody('pay-a')))
    const del = await detailRoute.DELETE(req('/api/invoices/inv-a'), { params: { id: 'inv-a' } })
    expect(res.status).toBe(403)
    expect(del.status).toBe(403)
    expect(calls()).toBe(0)
  })
})
