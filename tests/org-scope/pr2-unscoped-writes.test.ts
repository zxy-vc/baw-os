// BAW-2 PR2: DELETE sin filtro de org, POST de ledger, estado de cuenta,
// comprobante de pago y POST /v1/payments. Todas exigen sesión (o agente) y
// quedan acotadas a la org validada en TODOS los saltos; la API key global ya
// no autoriza.
//
// Qué es real y qué es simulado:
//  - Real: requireAdminCaller / requireMemberCaller / resolveOrgId (membresía,
//    rol, is_active y cookie de org activa leídos del Supabase en memoria),
//    findCrossOrgDependents, logEvent,
//    getEstadoCuentaData + EstadoCuentaPDF + renderToBuffer (PDF de verdad, con
//    un espía que registra el documento que llega al renderer),
//    sendPaymentReceipt + buildReceiptTemplate.
//  - Simulado: Supabase (en memoria), auth.getUser() y cookies(), y el envío
//    a Meta (sendWhatsAppTemplate) — WhatsApp NUNCA sale de aquí.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeFakeSupabase, type Row } from '../helpers/fake-supabase'
import { CASCADING_DEPENDENTS } from '@/lib/cross-org-dependents'

const h = vi.hoisted(() => ({
  user: null as null | { id: string },
  cookies: {} as Record<string, string>,
  db: null as unknown,
  sendWhatsAppTemplate: vi.fn(),
  rendered: [] as unknown[],
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
vi.mock('@/lib/whatsapp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/whatsapp')>()),
  whatsAppConfigured: () => true,
  cobranzaWhatsAppEnabled: () => true,
  sendWhatsAppTemplate: h.sendWhatsAppTemplate,
}))
vi.mock('@react-pdf/renderer', async (importOriginal) => {
  const real = await importOriginal<typeof import('@react-pdf/renderer')>()
  return {
    ...real,
    renderToBuffer: async (el: Parameters<typeof real.renderToBuffer>[0]) => {
      h.rendered.push((el.props as { doc: unknown }).doc)
      return real.renderToBuffer(el)
    },
  }
})
// v1Write/v1Read envuelven auth de agente + idempotencia + clasificación; aquí
// se prueba el handler ya autorizado, así que el wrapper devuelve la config.
vi.mock('@/lib/agents/v1/handler', () => ({
  v1Read: (opts: unknown) => opts,
  v1Write: (opts: unknown) => opts,
}))

import { setActiveOrgId } from '@/lib/api-auth'
import * as contractsRoute from '@/app/api/contracts/route'
import * as contactsRoute from '@/app/api/contacts/route'
import * as incidentsRoute from '@/app/api/incidents/route'
import * as assetsRoute from '@/app/api/ancillary-assets/route'
import * as ledgerRoute from '@/app/api/ledger/route'
import * as estadoCuentaRoute from '@/app/api/contracts/[id]/estado-cuenta/route'
import * as receiptRoute from '@/app/api/payments/[id]/receipt/route'
import * as v1PaymentsRoute from '@/app/api/v1/payments/route'
import { sendPaymentReceipt } from '@/lib/payment-receipt'
import { dispatchApprovedAction } from '@/lib/agents/v1/dispatcher'
import type { EstadoCuentaDoc } from '@/lib/estado-cuenta'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const LEGACY_KEY = 'legacy-shared-key'
const PHONE_A = '5215550000001'
const PHONE_B = '5215550000002'
// Cualquier rastro de la org B en una respuesta, PDF o mensaje.
const B_DATA = /Beto|5215550000002|Torre B|Calle B|B-201/

let tables: Record<string, Row[]>

/** Sesión con el usuario `id`; `activeOrg` simula la cookie baw_active_org_id. */
function loginAs(id: string | null, activeOrg?: string) {
  h.user = id ? { id } : null
  h.cookies = activeOrg ? { baw_active_org_id: activeOrg } : {}
}

beforeEach(() => {
  vi.clearAllMocks()
  h.rendered = []
  h.resolveOverride = null
  process.env.BAWOS_API_KEY = LEGACY_KEY
  loginAs('u-owner-a')
  tables = {
    platform_admins: [],
    org_members: [
      { user_id: 'u-owner-a', org_id: ORG_A, role: 'pm_owner', created_at: '2026-01-01', is_active: true },
      { user_id: 'u-admin-a', org_id: ORG_A, role: 'pm_admin', created_at: '2026-01-01', is_active: true },
      { user_id: 'u-legacy-admin-a', org_id: ORG_A, role: 'admin', created_at: '2026-01-01', is_active: true },
      { user_id: 'u-operator-a', org_id: ORG_A, role: 'pm_operator', created_at: '2026-01-01', is_active: true },
      { user_id: 'u-viewer-a', org_id: ORG_A, role: 'pm_viewer', created_at: '2026-01-01', is_active: true },
      { user_id: 'u-client-a', org_id: ORG_A, role: 'client', created_at: '2026-01-01', is_active: true },
      { user_id: 'u-agent-a', org_id: ORG_A, role: 'agent', created_at: '2026-01-01', is_active: true },
      // Miembro de A y de B, con B como org activa (cookie).
      { user_id: 'u-multi', org_id: ORG_A, role: 'pm_admin', created_at: '2026-01-01', is_active: true },
      { user_id: 'u-multi', org_id: ORG_B, role: 'pm_admin', created_at: '2026-02-01', is_active: true },
      // Owner de A con la membresía revocada.
      { user_id: 'u-revoked-a', org_id: ORG_A, role: 'pm_owner', created_at: '2026-01-01', is_active: false },
      // Viewer activo en A y owner REVOCADO en B (la cookie intentará elegir B).
      { user_id: 'u-revoked-b', org_id: ORG_A, role: 'pm_viewer', created_at: '2026-01-01', is_active: true },
      { user_id: 'u-revoked-b', org_id: ORG_B, role: 'pm_owner', created_at: '2026-02-01', is_active: false },
    ],
    contracts: [
      { id: 'ct-a', org_id: ORG_A, unit_id: 'unit-a', occupant_id: 'occ-a' },
      { id: 'ct-b', org_id: ORG_B, unit_id: 'unit-b', occupant_id: 'occ-b' },
      { id: 'ct-a-del', org_id: ORG_A, unit_id: 'unit-a', occupant_id: 'occ-a' },
      { id: 'ct-b-del', org_id: ORG_B, unit_id: 'unit-b', occupant_id: 'occ-b' },
      // Contrato de B cuyos hijos son de A: solo el filtro del contrato lo rechaza.
      { id: 'ct-b-kids-a', org_id: ORG_B, unit_id: 'unit-a', occupant_id: 'occ-a' },
      // Contratos propios sin pagos con hijos de B colgando por FK CASCADE.
      { id: 'ct-a-xcharge', org_id: ORG_A, unit_id: 'unit-a', occupant_id: 'occ-a' },
      { id: 'ct-a-xstay', org_id: ORG_A, unit_id: 'unit-a', occupant_id: 'occ-a' },
      { id: 'ct-a-paid', org_id: ORG_A, unit_id: 'unit-a', occupant_id: 'occ-a' },
      // Cadenas de A con un hijo de B en cada salto (FK por id, sin (org_id, id)).
      { id: 'ct-a-xocc', org_id: ORG_A, unit_id: 'unit-a', occupant_id: 'occ-b' },
      { id: 'ct-a-xunit', org_id: ORG_A, unit_id: 'unit-b-in-bld-a', occupant_id: 'occ-a' },
      { id: 'ct-a-xbld', org_id: ORG_A, unit_id: 'unit-a-xbld', occupant_id: 'occ-a' },
    ],
    units: [
      { id: 'unit-a', org_id: ORG_A, number: 'A-101', building_id: 'bld-a' },
      { id: 'unit-b', org_id: ORG_B, number: 'B-201', building_id: 'bld-b' },
      { id: 'unit-a-xbld', org_id: ORG_A, number: 'A-102', building_id: 'bld-b' },
      // Unidad de B que apunta a un edificio de A: aísla el salto contrato → unidad.
      { id: 'unit-b-in-bld-a', org_id: ORG_B, number: 'B-201', building_id: 'bld-a' },
    ],
    buildings: [
      { id: 'bld-a', org_id: ORG_A, name: 'Torre A', address: 'Calle A 1' },
      { id: 'bld-b', org_id: ORG_B, name: 'Torre B', address: 'Calle B 9' },
    ],
    occupants: [
      { id: 'occ-a', org_id: ORG_A, name: 'Ana', phone: PHONE_A },
      { id: 'occ-b', org_id: ORG_B, name: 'Beto', phone: PHONE_B },
      // Ocupantes propios referenciados por filas de B (CASCADE / SET NULL).
      ...CASCADING_DEPENDENTS.occupants.map((d) => ({ id: `occ-a-x-${d.table}`, org_id: ORG_A, name: 'Ana', phone: PHONE_A })),
    ],
    payments: [
      { id: 'pay-a', org_id: ORG_A, contract_id: 'ct-a-paid', status: 'pending', amount: 1000, due_date: '2026-09-05' },
      { id: 'pay-b', org_id: ORG_B, contract_id: 'ct-b', status: 'pending', amount: 1000, due_date: '2026-09-05' },
      { id: 'pay-a-ok', org_id: ORG_A, contract_id: 'ct-a', status: 'paid', amount: 1500, amount_paid: 1500, due_date: '2026-09-05', paid_date: '2026-09-04', method: 'transfer', reference: 'R-1' },
      // Pago de B colgado del contrato de A: no debe aparecer en el estado de cuenta de A.
      { id: 'pay-b-on-ct-a', org_id: ORG_B, contract_id: 'ct-a', status: 'pending', amount: 777, due_date: '2026-09-05' },
      { id: 'pay-a-xct', org_id: ORG_A, contract_id: 'ct-b', status: 'paid', amount: 1000, due_date: '2026-09-05' },
      { id: 'pay-a-xct2', org_id: ORG_A, contract_id: 'ct-b-kids-a', status: 'paid', amount: 1000, due_date: '2026-09-05' },
      { id: 'pay-a-xocc', org_id: ORG_A, contract_id: 'ct-a-xocc', status: 'paid', amount: 1000, due_date: '2026-09-05' },
      { id: 'pay-a-xunit', org_id: ORG_A, contract_id: 'ct-a-xunit', status: 'paid', amount: 1000, due_date: '2026-09-05' },
    ],
    incidents: [
      { id: 'inc-a', org_id: ORG_A },
      { id: 'inc-b', org_id: ORG_B },
    ],
    ancillary_assets: [
      { id: 'asset-a', org_id: ORG_A },
      { id: 'asset-b', org_id: ORG_B },
      { id: 'asset-a-x', org_id: ORG_A },
    ],
    // Hijos por FK con CASCADE / SET NULL. Los de A sobre padres de A no bloquean.
    ancillary_charges: [
      { id: 'chg-a-own', org_id: ORG_A, contract_id: 'ct-a-del', asset_id: 'asset-a' },
      { id: 'chg-b-on-ct-a', org_id: ORG_B, contract_id: 'ct-a-xcharge', asset_id: null },
      { id: 'chg-b-on-asset-a', org_id: ORG_B, contract_id: 'ct-b', asset_id: 'asset-a-x' },
      // Hijo de B sobre el activo de B: sin el 404 previo, A vería 409 (oráculo de existencia).
      { id: 'chg-b-on-asset-b', org_id: ORG_B, contract_id: 'ct-b', asset_id: 'asset-b' },
    ],
    stay_occupants: [
      { id: 'stay-a-own', org_id: ORG_A, contract_id: 'ct-a-del', occupant_id: 'occ-a' },
      { id: 'stay-b-on-ct-a', org_id: ORG_B, contract_id: 'ct-a-xstay', occupant_id: 'occ-b' },
      { id: 'stay-b-on-occ-a', org_id: ORG_B, contract_id: 'ct-b', occupant_id: 'occ-a-x-stay_occupants' },
    ],
    crm_contacts: [{ id: 'crm-b', org_id: ORG_B, occupant_id: 'occ-a-x-crm_contacts' }],
    reservations: [{ id: 'res-b', org_id: ORG_B, occupant_id: 'occ-a-x-reservations' }],
    payment_receipts: [{ id: 'rcpt-b', org_id: ORG_B, payer_occupant_id: 'occ-a-x-payment_receipts' }],
    payment_ledger: [],
    audit_log: [],
    webhook_events: [],
  }
  h.db = makeFakeSupabase(tables)
  h.sendWhatsAppTemplate.mockResolvedValue({ ok: true })
})

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`http://localhost${url}`, init)
const withKey = { headers: { 'x-api-key': LEGACY_KEY } }
const ids = (table: string) => tables[table].map((r) => r.id)

describe('resolver de sesión real', () => {
  it('usuario sin membresía → 401 en DELETE y en estado de cuenta', async () => {
    loginAs('u-nobody')
    const del = await incidentsRoute.DELETE(req('/api/incidents?id=inc-a', { method: 'DELETE' }))
    const ec = await estadoCuentaRoute.GET(req('/api/contracts/ct-a/estado-cuenta?periodo=2026-09'), {
      params: { id: 'ct-a' },
    })
    expect(del.status).toBe(401)
    expect(ec.status).toBe(401)
    expect(ids('incidents')).toContain('inc-a')
  })

  it('cookie de org activa a una org sin membresía → cae a su org real', async () => {
    loginAs('u-owner-a', ORG_B)
    const res = await incidentsRoute.DELETE(req('/api/incidents?id=inc-b', { method: 'DELETE' }))
    expect(res.status).toBe(404)
    expect(ids('incidents')).toContain('inc-b')
  })
})

describe.each([
  ['contracts', contractsRoute, 'contracts', 'ct-a-del', 'ct-b'],
  ['contacts', contactsRoute, 'occupants', 'occ-a', 'occ-b'],
  ['incidents', incidentsRoute, 'incidents', 'inc-a', 'inc-b'],
  ['ancillary-assets', assetsRoute, 'ancillary_assets', 'asset-a', 'asset-b'],
] as const)('DELETE /api/%s', (path, route, table, ownId, foreignId) => {
  const del = (id: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
    route.DELETE(req(`/api/${path}?id=${id}`, { method: 'DELETE', ...init }))

  it('API key global sin sesión → 401 sin borrar', async () => {
    loginAs(null)
    const res = await del(ownId, withKey)
    expect(res.status).toBe(401)
    expect(ids(table)).toContain(ownId)
  })

  it.each(['u-viewer-a', 'u-client-a', 'u-agent-a', 'u-operator-a'])(
    'miembro sin owner/admin (%s) → 403 sin borrar ni evento',
    async (user) => {
      loginAs(user)
      const res = await del(ownId)
      expect(res.status).toBe(403)
      expect(ids(table)).toContain(ownId)
      expect(tables.webhook_events).toHaveLength(0)
    },
  )

  it('fila de otra org → 404 sin borrar', async () => {
    loginAs('u-owner-a')
    const res = await del(foreignId)
    expect(res.status).toBe(404)
    expect(ids(table)).toContain(foreignId)
    expect(tables.webhook_events).toHaveLength(0)
  })

  it.each(['u-owner-a', 'u-admin-a', 'u-legacy-admin-a'])('%s → fila propia se borra', async (user) => {
    loginAs(user)
    const res = await del(ownId)
    expect(res.status).toBe(200)
    expect(ids(table)).not.toContain(ownId)
  })
})

describe('DELETE → logEvent en la org de la sesión (no en la caché global)', () => {
  it.each([
    ['contracts', contractsRoute, 'ct-b-del', 'contract.deleted'],
    ['incidents', incidentsRoute, 'inc-b', 'incident.deleted'],
    ['ancillary-assets', assetsRoute, 'asset-b', 'ancillary_asset.deleted'],
  ] as const)('%s: sesión B con caché A → evento solo en B', async (path, route, id, eventType) => {
    setActiveOrgId(ORG_A) // el shim getOrgId() devolvería A
    loginAs('u-multi', ORG_B)
    const res = await route.DELETE(req(`/api/${path}?id=${id}`, { method: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(tables.webhook_events).toHaveLength(1)
    expect(tables.webhook_events[0]).toMatchObject({ org_id: ORG_B, event_type: eventType })
    expect(tables.webhook_events.some((e) => e.org_id === ORG_A)).toBe(false)
  })
})

describe('DELETE /api/contracts — guard de pagos', () => {
  it('contrato propio con pagos → 409 sin borrar', async () => {
    loginAs('u-owner-a')
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
    loginAs(null)
    const res = await ledgerRoute.POST(req('/api/ledger', { ...body(), ...withKey }))
    expect(res.status).toBe(401)
    expect(tables.payment_ledger).toHaveLength(0)
  })

  it('rol sin finance.record_receipt → 403', async () => {
    loginAs('u-viewer-a')
    const res = await ledgerRoute.POST(req('/api/ledger', body()))
    expect(res.status).toBe(403)
    expect(tables.payment_ledger).toHaveLength(0)
  })

  it('pago de otra org → 404 y el pago ajeno NO se marca pagado', async () => {
    loginAs('u-operator-a')
    const res = await ledgerRoute.POST(req('/api/ledger', body({ payment_id: 'pay-b' })))
    expect(res.status).toBe(404)
    expect(tables.payments.find((p) => p.id === 'pay-b')?.status).toBe('pending')
    expect(tables.payment_ledger).toHaveLength(0)
  })

  it('contrato o unidad de otra org → 404', async () => {
    loginAs('u-operator-a')
    const r1 = await ledgerRoute.POST(req('/api/ledger', body({ contract_id: 'ct-b', payment_id: undefined })))
    const r2 = await ledgerRoute.POST(req('/api/ledger', body({ unit_id: 'unit-b', payment_id: undefined })))
    expect(r1.status).toBe(404)
    expect(r2.status).toBe(404)
    expect(tables.payment_ledger).toHaveLength(0)
  })

  it('pago propio → bitácora en la org del caller y pago marcado', async () => {
    loginAs('u-operator-a')
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

  it('API key global sin sesión → 401 sin renderizar', async () => {
    loginAs(null)
    expect((await get('ct-b', withKey)).status).toBe(401)
    expect(h.rendered).toHaveLength(0)
  })

  it.each(['ct-b', 'ct-b-kids-a'])('contrato de otra org (%s) → 404 sin renderizar', async (id) => {
    loginAs('u-viewer-a')
    expect((await get(id)).status).toBe(404)
    expect(h.rendered).toHaveLength(0)
  })

  it.each([
    ['ocupante de B', 'ct-a-xocc'],
    ['unidad de B', 'ct-a-xunit'],
    ['edificio de B', 'ct-a-xbld'],
  ])('contrato propio → %s → 404, el renderer no recibe nada', async (_name, id) => {
    loginAs('u-viewer-a')
    const res = await get(id)
    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).not.toMatch(B_DATA)
    expect(h.rendered).toHaveLength(0)
  })

  it('contrato propio → PDF real con solo datos de la org', async () => {
    loginAs('u-viewer-a')
    const res = await get('ct-a')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    const bytes = Buffer.from(await res.arrayBuffer())
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')

    expect(h.rendered).toHaveLength(1)
    const doc = h.rendered[0] as EstadoCuentaDoc
    expect(doc).toMatchObject({
      tenantName: 'Ana',
      tenantPhone: PHONE_A,
      unitNumber: 'A-101',
      buildingName: 'Torre A',
      buildingAddress: 'Calle A 1',
      contractId: 'ct-a',
    })
    expect(JSON.stringify(doc)).not.toMatch(B_DATA)
    // El cargo de B colgado de ct-a (777) no entra al estado de cuenta de A.
    expect(JSON.stringify(doc.data)).not.toContain('777')
  })
})

describe('sendPaymentReceipt — cadena pago → contrato → ocupante/unidad', () => {
  it.each([
    ['pago de B', 'pay-b', 'payment_not_found'],
    ['pago propio → contrato de B', 'pay-a-xct', 'contract_not_found'],
    ['pago propio → contrato de B con hijos de A', 'pay-a-xct2', 'contract_not_found'],
    ['contrato propio → ocupante de B', 'pay-a-xocc', 'contract_chain_mismatch'],
    ['contrato propio → unidad de B', 'pay-a-xunit', 'contract_chain_mismatch'],
  ])('%s → cero WhatsApp', async (_name, paymentId, reason) => {
    const res = await sendPaymentReceipt(paymentId, ORG_A)
    expect(res).toEqual({ ok: false, reason })
    expect(h.sendWhatsAppTemplate).not.toHaveBeenCalled()
    expect(tables.audit_log).toHaveLength(0)
  })

  it('cadena propia → WhatsApp al inquilino de la org con sus datos', async () => {
    const res = await sendPaymentReceipt('pay-a-ok', ORG_A)
    expect(res).toEqual({ ok: true })
    expect(h.sendWhatsAppTemplate).toHaveBeenCalledTimes(1)
    const [to, template] = h.sendWhatsAppTemplate.mock.calls[0]
    expect(to).toBe(PHONE_A)
    expect(template.name).toBe('pago_recibido')
    expect(template.params[0]).toBe('Ana')
    expect(template.params[2]).toBe('A-101')
    expect(template.params[4]).toBe('transfer, ref R-1')
    expect(JSON.stringify(template)).not.toMatch(B_DATA)
    expect(tables.audit_log).toHaveLength(1)
    expect(tables.audit_log[0]).toMatchObject({ org_id: ORG_A, entity_id: 'pay-a-ok' })
  })
})

describe('POST /api/payments/[id]/receipt', () => {
  const post = (id: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
    receiptRoute.POST(req(`/api/payments/${id}/receipt`, { method: 'POST', ...init }), {
      params: { id },
    })

  it('API key global sin sesión → 401 sin enviar WhatsApp', async () => {
    loginAs(null)
    const res = await post('pay-b', withKey)
    expect(res.status).toBe(401)
    expect(h.sendWhatsAppTemplate).not.toHaveBeenCalled()
  })

  it('rol no admin → 403 sin enviar', async () => {
    loginAs('u-operator-a')
    const res = await post('pay-a-ok')
    expect(res.status).toBe(403)
    expect(h.sendWhatsAppTemplate).not.toHaveBeenCalled()
  })

  it.each(['pay-b', 'pay-a-xct', 'pay-a-xct2', 'pay-a-xocc', 'pay-a-xunit'])('%s → no envía', async (id) => {
    loginAs('u-admin-a')
    const json = await (await post(id)).json()
    expect(json.success).toBe(false)
    expect(h.sendWhatsAppTemplate).not.toHaveBeenCalled()
  })

  it('pago propio → envía al inquilino de la org', async () => {
    loginAs('u-admin-a')
    const json = await (await post('pay-a-ok')).json()
    expect(json.success).toBe(true)
    expect(h.sendWhatsAppTemplate).toHaveBeenCalledTimes(1)
    expect(h.sendWhatsAppTemplate.mock.calls[0][0]).toBe(PHONE_A)
  })
})

describe('POST /v1/payments (agente) y su despacho por aprobación', () => {
  type V1Handler = (ctx: unknown) => Promise<Response>
  const handler = (v1PaymentsRoute.POST as unknown as { handler: V1Handler }).handler
  const agentAuth = { orgId: ORG_A, agentId: 'alicia-ops' }
  const run = (contract_id: string) =>
    handler({ auth: agentAuth, body: { contract_id, amount: 1500 }, recordAction: vi.fn() })
  const paymentsOf = (contractId: string) => tables.payments.filter((p) => p.contract_id === contractId)

  it('contrato de otra org → 404, sin pago ni WhatsApp', async () => {
    const before = paymentsOf('ct-b').length
    const res = await run('ct-b')
    expect(res.status).toBe(404)
    expect(paymentsOf('ct-b')).toHaveLength(before)
    await new Promise((r) => setTimeout(r, 10))
    expect(h.sendWhatsAppTemplate).not.toHaveBeenCalled()
  })

  it('contrato propio → pago en la org y comprobante al inquilino de la org', async () => {
    const res = await run('ct-a')
    expect(res.status).toBe(200)
    expect(tables.payments.find((p) => p.id === 'new-payments')).toMatchObject({
      org_id: ORG_A,
      contract_id: 'ct-a',
    })
    await vi.waitFor(() => expect(h.sendWhatsAppTemplate).toHaveBeenCalledTimes(1))
    expect(h.sendWhatsAppTemplate.mock.calls[0][0]).toBe(PHONE_A)
  })

  it('aprobación de payment.record con contrato de otra org → falla sin insertar', async () => {
    const before = tables.payments.length
    const res = await dispatchApprovedAction({
      approvalId: 'appr-1',
      orgId: ORG_A,
      agentId: 'alicia-ops',
      actionType: 'payment.record',
      payload: { contract_id: 'ct-b', amount: 1500 },
      resolvedBy: null,
    })
    expect(res.ok).toBe(false)
    expect(tables.payments).toHaveLength(before)
  })

  it('aprobación de payment.record con contrato propio → inserta en la org', async () => {
    const res = await dispatchApprovedAction({
      approvalId: 'appr-1',
      orgId: ORG_A,
      agentId: 'alicia-ops',
      actionType: 'payment.record',
      payload: { contract_id: 'ct-a', amount: 1500 },
      resolvedBy: null,
    })
    expect(res.ok).toBe(true)
    expect(tables.payments.find((p) => p.id === 'new-payments')).toMatchObject({ org_id: ORG_A, contract_id: 'ct-a' })
  })
})

describe('membresía revocada (resolver real)', () => {
  const routes = [
    ['contracts', contractsRoute, 'contracts', 'ct-a-del', 'ct-b-del'],
    ['contacts', contactsRoute, 'occupants', 'occ-a', 'occ-b'],
    ['incidents', incidentsRoute, 'incidents', 'inc-a', 'inc-b'],
    ['ancillary-assets', assetsRoute, 'ancillary_assets', 'asset-a', 'asset-b'],
  ] as const

  it('owner revocado → 401 en DELETE, ledger, estado de cuenta y recibo; nada cambia ni sale', async () => {
    loginAs('u-revoked-a')
    for (const [path, route, table, ownId] of routes) {
      const res = await route.DELETE(req(`/api/${path}?id=${ownId}`, { method: 'DELETE' }))
      expect(res.status, path).toBe(401)
      expect(ids(table)).toContain(ownId)
    }
    const ledger = await ledgerRoute.POST(
      req('/api/ledger', {
        method: 'POST',
        body: JSON.stringify({ contract_id: 'ct-a-paid', unit_id: 'unit-a', payment_id: 'pay-a', amount: 1000, confirmed_by: 'x' }),
      }),
    )
    const ec = await estadoCuentaRoute.GET(req('/api/contracts/ct-a/estado-cuenta?periodo=2026-09'), {
      params: { id: 'ct-a' },
    })
    const rc = await receiptRoute.POST(req('/api/payments/pay-a-ok/receipt', { method: 'POST' }), {
      params: { id: 'pay-a-ok' },
    })
    expect([ledger.status, ec.status, rc.status]).toEqual([401, 401, 401])
    expect(tables.payment_ledger).toHaveLength(0)
    expect(tables.payments.find((p) => p.id === 'pay-a')?.status).toBe('pending')
    expect(h.rendered).toHaveLength(0)
    expect(h.sendWhatsAppTemplate).not.toHaveBeenCalled()
    expect(tables.webhook_events).toHaveLength(0)
  })

  it('cookie que elige la org de una membresía revocada → cae a su org activa (viewer) y no borra en B', async () => {
    loginAs('u-revoked-b', ORG_B)
    for (const [path, route, table, , foreignId] of routes) {
      const res = await route.DELETE(req(`/api/${path}?id=${foreignId}`, { method: 'DELETE' }))
      expect(res.status, path).toBe(403)
      expect(ids(table)).toContain(foreignId)
    }
    const ec = await estadoCuentaRoute.GET(req('/api/contracts/ct-b/estado-cuenta?periodo=2026-09'), {
      params: { id: 'ct-b' },
    })
    expect(ec.status).toBe(404)
    expect(h.rendered).toHaveLength(0)
  })

  it('aunque el resolver devuelva una org cuya membresía está revocada, los guards la rechazan', async () => {
    loginAs('u-revoked-a')
    h.resolveOverride = async () => ORG_A
    for (const [path, route, table, ownId] of routes) {
      const res = await route.DELETE(req(`/api/${path}?id=${ownId}`, { method: 'DELETE' }))
      expect(res.status, path).toBe(403)
      expect(ids(table)).toContain(ownId)
    }
    const ec = await estadoCuentaRoute.GET(req('/api/contracts/ct-a/estado-cuenta?periodo=2026-09'), {
      params: { id: 'ct-a' },
    })
    expect(ec.status).toBe(403)
    expect(h.rendered).toHaveLength(0)
  })
})

describe('DELETE no toca hijos de otra org vía FK CASCADE / SET NULL', () => {
  const del = (path: string, route: { DELETE: (r: NextRequest) => Promise<Response> }, id: string) =>
    route.DELETE(req(`/api/${path}?id=${id}`, { method: 'DELETE' }))

  it.each([
    ['contracts', contractsRoute, 'contracts', 'ct-a-xcharge', 'ancillary_charges', 'chg-b-on-ct-a'],
    ['contracts', contractsRoute, 'contracts', 'ct-a-xstay', 'stay_occupants', 'stay-b-on-ct-a'],
    ['contacts', contactsRoute, 'occupants', 'occ-a-x-stay_occupants', 'stay_occupants', 'stay-b-on-occ-a'],
    ['contacts', contactsRoute, 'occupants', 'occ-a-x-crm_contacts', 'crm_contacts', 'crm-b'],
    ['contacts', contactsRoute, 'occupants', 'occ-a-x-reservations', 'reservations', 'res-b'],
    ['contacts', contactsRoute, 'occupants', 'occ-a-x-payment_receipts', 'payment_receipts', 'rcpt-b'],
    ['ancillary-assets', assetsRoute, 'ancillary_assets', 'asset-a-x', 'ancillary_charges', 'chg-b-on-asset-a'],
  ] as const)('%s: padre propio con hijo de B en %s… → 409, padre e hijo intactos', async (path, route, table, id, childTable, childId) => {
    loginAs('u-owner-a')
    const childBefore = { ...tables[childTable].find((r) => r.id === childId) }
    const res = await del(path, route, id)
    expect(res.status).toBe(409)
    expect(ids(table)).toContain(id)
    expect(tables[childTable].find((r) => r.id === childId)).toEqual(childBefore)
    expect(tables.webhook_events).toHaveLength(0)
  })

  it('hijos de la propia org no bloquean (contrato y activo propios)', async () => {
    loginAs('u-owner-a')
    expect((await del('contracts', contractsRoute, 'ct-a-del')).status).toBe(200)
    expect((await del('ancillary-assets', assetsRoute, 'asset-a')).status).toBe(200)
  })

  it('id de otra org con hijos → 404 (no revela existencia con 409)', async () => {
    loginAs('u-owner-a')
    expect((await del('contracts', contractsRoute, 'ct-b')).status).toBe(404)
    expect((await del('ancillary-assets', assetsRoute, 'asset-b')).status).toBe(404)
  })

  it('error leyendo dependientes → 500 sin borrar (falla cerrado)', async () => {
    loginAs('u-owner-a')
    h.db = makeFakeSupabase(tables, { errors: { stay_occupants: { code: 'XX000', message: 'boom' } } })
    expect((await del('contracts', contractsRoute, 'ct-a-del')).status).toBe(500)
    expect((await del('contacts', contactsRoute, 'occ-a')).status).toBe(500)
    expect(ids('contracts')).toContain('ct-a-del')
    expect(ids('occupants')).toContain('occ-a')
  })

  it('tabla dependiente inexistente en el entorno (42P01) → no bloquea', async () => {
    loginAs('u-owner-a')
    h.db = makeFakeSupabase(tables, { errors: { crm_contacts: { code: '42P01', message: 'relation does not exist' } } })
    expect((await del('contacts', contactsRoute, 'occ-a')).status).toBe(200)
    expect(ids('occupants')).not.toContain('occ-a')
  })
})
