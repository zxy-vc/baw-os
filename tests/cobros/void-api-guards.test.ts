// BAW-18: un cargo anulado ('void') no se reactiva ni se cobra desde el servidor.
// Real: los handlers de recompute y checkout. Simulado: Supabase (en memoria), la
// sesión de miembro y Stripe — Stripe NUNCA se llama de verdad aquí.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeFakeSupabase, type Row } from '../helpers/fake-supabase'

const h = vi.hoisted(() => ({
  db: null as unknown,
  tables: {} as Record<string, Row[]>,
  stripeCreate: vi.fn(async () => ({ id: 'pi_test', client_secret: 'cs_test' })),
}))

vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  createServiceClient: () => h.db,
}))
vi.mock('@/lib/admin-auth', () => ({
  requireMemberCaller: async () => ({ ok: true, orgId: 'org-1' }),
}))
vi.mock('@/lib/stripe', () => ({ stripe: { paymentIntents: { create: h.stripeCreate } } }))

import { POST as recompute } from '@/app/api/payments/[id]/recompute/route'
import { POST as checkout } from '@/app/api/payments/checkout/route'

function seed(status: string) {
  h.tables = {
    payments: [{ id: 'p1', org_id: 'org-1', status, amount: 4_750, late_fee_amount: 0, amount_paid: 0 }],
    payment_receipts: [],
  }
  h.db = makeFakeSupabase(h.tables)
}

const checkoutReq = () =>
  new NextRequest('http://localhost/api/payments/checkout', {
    method: 'POST',
    body: JSON.stringify({ payment_id: 'p1', amount: 4_750 }),
  })

beforeEach(() => h.stripeCreate.mockClear())

describe('recompute — cargo anulado', () => {
  it('responde 409 y no lo reactiva', async () => {
    seed('void')
    const res = await recompute(new NextRequest('http://localhost/x', { method: 'POST' }), { params: { id: 'p1' } })
    expect(res.status).toBe(409)
    expect(h.tables.payments[0].status).toBe('void')
  })

  it('sigue recalculando un cargo vivo', async () => {
    seed('pending')
    const res = await recompute(new NextRequest('http://localhost/x', { method: 'POST' }), { params: { id: 'p1' } })
    expect(res.status).toBe(200)
    expect(h.tables.payments[0].status).toBe('pending')
  })
})

describe('checkout — no se crea intento de cobro sobre un cargo no cobrable', () => {
  it('anulado → 409 sin llamar a Stripe', async () => {
    seed('void')
    const res = await checkout(checkoutReq())
    expect(res.status).toBe(409)
    expect(h.stripeCreate).not.toHaveBeenCalled()
  })

  it('pagado → 409 sin llamar a Stripe', async () => {
    seed('paid')
    const res = await checkout(checkoutReq())
    expect(res.status).toBe(409)
    expect(h.stripeCreate).not.toHaveBeenCalled()
  })

  it('pendiente → crea el intento (Stripe simulado)', async () => {
    seed('pending')
    const res = await checkout(checkoutReq())
    expect(res.status).toBe(200)
    expect(h.stripeCreate).toHaveBeenCalledTimes(1)
  })
})
