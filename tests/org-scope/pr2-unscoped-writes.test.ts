// BAW-2 PR2: DELETE sin filtro de org, POST de ledger, estado de cuenta y
// comprobante de pago. Todas exigen sesión y quedan acotadas a la org del
// caller; la API key global ya no autoriza. WhatsApp está mockeado.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeFakeSupabase, type Row } from '../helpers/fake-supabase'

const h = vi.hoisted(() => ({
  auth: null as unknown,
  db: null as unknown,
  sendWhatsAppTemplate: vi.fn(),
}))

vi.mock('@/lib/admin-auth', () => ({
  requireMemberCaller: async () => h.auth,
  requireAdminCaller: async () => h.auth,
}))
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  createServiceClient: () => h.db,
}))
vi.mock('@/lib/webhooks', () => ({ logEvent: vi.fn() }))
vi.mock('@/lib/whatsapp', () => ({
  whatsAppConfigured: () => true,
  cobranzaWhatsAppEnabled: () => true,
  buildReceiptTemplate: () => ({}),
  sendWhatsAppTemplate: h.sendWhatsAppTemplate,
}))
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: async () => Buffer.from('pdf') }))
vi.mock('@/lib/pdf/EstadoCuentaPDF', () => ({ EstadoCuentaPDF: () => null }))

import * as contractsRoute from '@/app/api/contracts/route'
import * as contactsRoute from '@/app/api/contacts/route'
import * as incidentsRoute from '@/app/api/incidents/route'
import * as assetsRoute from '@/app/api/ancillary-assets/route'
import * as ledgerRoute from '@/app/api/ledger/route'
import * as estadoCuentaRoute from '@/app/api/contracts/[id]/estado-cuenta/route'
import * as receiptRoute from '@/app/api/payments/[id]/receipt/route'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const LEGACY_KEY = 'legacy-shared-key'

function member(role: string, orgId = ORG_A) {
  return { ok: true, userId: 'user-1', orgId, isPlatformAdmin: false, role }
}
const noSession = { ok: false, status: 401, message: 'No authenticated user' }

let tables: Record<string, Row[]>

beforeEach(() => {
  vi.clearAllMocks()
  process.env.BAWOS_API_KEY = LEGACY_KEY
  tables = {
    contracts: [
      { id: 'ct-a', org_id: ORG_A, unit_id: 'unit-a', occupant_id: 'occ-a' },
      { id: 'ct-b', org_id: ORG_B, unit_id: 'unit-b', occupant_id: 'occ-b' },
      { id: 'ct-a-paid', org_id: ORG_A, unit_id: 'unit-a', occupant_id: 'occ-a' },
    ],
    units: [
      { id: 'unit-a', org_id: ORG_A, number: '101' },
      { id: 'unit-b', org_id: ORG_B, number: '201' },
    ],
    occupants: [
      { id: 'occ-a', org_id: ORG_A, name: 'Ana', phone: '5215550000001' },
      { id: 'occ-b', org_id: ORG_B, name: 'Beto', phone: '5215550000002' },
    ],
    payments: [
      { id: 'pay-a', org_id: ORG_A, contract_id: 'ct-a-paid', status: 'pending', amount: 1000 },
      { id: 'pay-b', org_id: ORG_B, contract_id: 'ct-b', status: 'pending', amount: 1000 },
    ],
    incidents: [
      { id: 'inc-a', org_id: ORG_A },
      { id: 'inc-b', org_id: ORG_B },
    ],
    ancillary_assets: [
      { id: 'asset-a', org_id: ORG_A },
      { id: 'asset-b', org_id: ORG_B },
    ],
    payment_ledger: [],
    audit_log: [],
  }
  h.db = makeFakeSupabase(tables)
  h.sendWhatsAppTemplate.mockResolvedValue({ ok: true })
})

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`http://localhost${url}`, init)
const withKey = { headers: { 'x-api-key': LEGACY_KEY } }
const ids = (table: string) => tables[table].map((r) => r.id)

describe.each([
  ['contracts', contractsRoute, 'contracts', 'ct-a', 'ct-b'],
  ['contacts', contactsRoute, 'occupants', 'occ-a', 'occ-b'],
  ['incidents', incidentsRoute, 'incidents', 'inc-a', 'inc-b'],
  ['ancillary-assets', assetsRoute, 'ancillary_assets', 'asset-a', 'asset-b'],
] as const)('DELETE /api/%s', (path, route, table, ownId, foreignId) => {
  it('API key global sin sesión → 401 sin borrar', async () => {
    h.auth = noSession
    const res = await route.DELETE(req(`/api/${path}?id=${ownId}`, { method: 'DELETE', ...withKey }))
    expect(res.status).toBe(401)
    expect(ids(table)).toContain(ownId)
  })

  it('fila de otra org → 404 sin borrar', async () => {
    h.auth = member('pm_owner')
    const res = await route.DELETE(req(`/api/${path}?id=${foreignId}`, { method: 'DELETE' }))
    expect(res.status).toBe(404)
    expect(ids(table)).toContain(foreignId)
  })

  it('fila propia → se borra', async () => {
    h.auth = member('pm_operator')
    const res = await route.DELETE(req(`/api/${path}?id=${ownId}`, { method: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(ids(table)).not.toContain(ownId)
  })
})

describe('DELETE /api/contracts — guard de pagos', () => {
  it('contrato propio con pagos → 409 sin borrar', async () => {
    h.auth = member('pm_owner')
    const res = await contractsRoute.DELETE(req('/api/contracts?id=ct-a-paid', { method: 'DELETE' }))
    expect(res.status).toBe(409)
    expect(ids('contracts')).toContain('ct-a-paid')
  })
})

describe('POST /api/ledger', () => {
  const body = (over: Row = {}) => ({
    method: 'POST',
    body: JSON.stringify({
      contract_id: 'ct-a-paid',
      unit_id: 'unit-a',
      payment_id: 'pay-a',
      amount: 1000,
      confirmed_by: 'Fran',
      ...over,
    }),
  })

  it('API key global sin sesión → 401', async () => {
    h.auth = noSession
    const res = await ledgerRoute.POST(req('/api/ledger', { ...body(), ...withKey }))
    expect(res.status).toBe(401)
    expect(tables.payment_ledger).toHaveLength(0)
  })

  it('rol sin finance.record_receipt → 403', async () => {
    h.auth = member('pm_viewer')
    const res = await ledgerRoute.POST(req('/api/ledger', body()))
    expect(res.status).toBe(403)
    expect(tables.payment_ledger).toHaveLength(0)
  })

  it('pago de otra org → 404 y el pago ajeno NO se marca pagado', async () => {
    h.auth = member('pm_operator')
    const res = await ledgerRoute.POST(req('/api/ledger', body({ payment_id: 'pay-b' })))
    expect(res.status).toBe(404)
    expect(tables.payments.find((p) => p.id === 'pay-b')?.status).toBe('pending')
    expect(tables.payment_ledger).toHaveLength(0)
  })

  it('contrato o unidad de otra org → 404', async () => {
    h.auth = member('pm_operator')
    const r1 = await ledgerRoute.POST(req('/api/ledger', body({ contract_id: 'ct-b', payment_id: undefined })))
    const r2 = await ledgerRoute.POST(req('/api/ledger', body({ unit_id: 'unit-b', payment_id: undefined })))
    expect(r1.status).toBe(404)
    expect(r2.status).toBe(404)
    expect(tables.payment_ledger).toHaveLength(0)
  })

  it('pago propio → bitácora en la org del caller y pago marcado', async () => {
    h.auth = member('pm_operator')
    const res = await ledgerRoute.POST(req('/api/ledger', body()))
    expect(res.status).toBe(200)
    expect(tables.payment_ledger[0]?.org_id).toBe(ORG_A)
    expect(tables.payments.find((p) => p.id === 'pay-a')?.status).toBe('paid')
  })
})

describe('GET /api/contracts/[id]/estado-cuenta', () => {
  const get = (id: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
    estadoCuentaRoute.GET(req(`/api/contracts/${id}/estado-cuenta?periodo=2026-09`, init), {
      params: { id },
    })

  it('API key global sin sesión → 401', async () => {
    h.auth = noSession
    expect((await get('ct-b', withKey)).status).toBe(401)
  })

  it('contrato de otra org → 404', async () => {
    h.auth = member('pm_viewer')
    expect((await get('ct-b')).status).toBe(404)
  })

  it('contrato propio → PDF', async () => {
    h.auth = member('pm_viewer')
    const res = await get('ct-a')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
  })
})

describe('POST /api/payments/[id]/receipt', () => {
  const post = (id: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
    receiptRoute.POST(req(`/api/payments/${id}/receipt`, { method: 'POST', ...init }), {
      params: { id },
    })

  it('API key global sin sesión → 401 sin enviar WhatsApp', async () => {
    h.auth = noSession
    const res = await post('pay-b', withKey)
    expect(res.status).toBe(401)
    expect(h.sendWhatsAppTemplate).not.toHaveBeenCalled()
  })

  it('pago de otra org → no envía', async () => {
    h.auth = member('pm_admin')
    const json = await (await post('pay-b')).json()
    expect(json).toEqual({ success: false, reason: 'payment_not_found' })
    expect(h.sendWhatsAppTemplate).not.toHaveBeenCalled()
  })

  it('pago propio → envía al inquilino de la org', async () => {
    h.auth = member('pm_admin')
    const json = await (await post('pay-a')).json()
    expect(json.success).toBe(true)
    expect(h.sendWhatsAppTemplate).toHaveBeenCalledWith('5215550000001', {})
  })
})
