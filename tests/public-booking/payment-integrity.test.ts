// BaW OS · BAW-15 — El huésped nunca paga sin que su reserva quede apartada.
// Recorrido "llega un huésped de renta corta": paga → su noche queda apartada.
//
// Drives the real checkout route and Stripe webhook route handlers against an
// in-memory Supabase fake (./fake-supabase.ts) and a mocked Stripe module.
// Stripe is LIVE in prod: the real SDK must never be constructed here.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createFakeDb, type FakeDb } from './fake-supabase'

vi.mock('stripe', () => ({
  default: class GuardStripe {
    constructor() {
      throw new Error('Real Stripe client must never be constructed in tests')
    }
  },
}))

const stripeMock = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  expire: vi.fn(),
  retrieve: vi.fn(),
  sessionSeq: 0,
}))

vi.mock('@/lib/public-booking/stripe-public', () => ({
  createCheckoutSession: stripeMock.createCheckoutSession,
  getStripePublic: () => ({
    webhooks: {
      // Signature verification is Stripe's; here a fixed header stands in.
      constructEvent: (raw: string, sig: string) => {
        if (sig !== 't=1,v1=valid') throw new Error('No signatures found matching the expected signature')
        return JSON.parse(raw)
      },
    },
    checkout: { sessions: { expire: stripeMock.expire, retrieve: stripeMock.retrieve } },
  }),
}))

const dbRef = vi.hoisted(() => ({ current: null as null | { client: unknown } }))

vi.mock('@/lib/public-booking/supabase-public', () => ({
  createServiceClient: () => dbRef.current!.client,
  createAnonClient: () => dbRef.current!.client,
}))

import { POST as checkoutPOST } from '@/app/api/public/v1/bookings/checkout/route'
import { POST as webhookPOST } from '@/app/api/public/v1/webhooks/stripe/route'

const ORG_ID = 'org-baw'
const UNIT_ID = 'unit-101'
const UNIT_SLUG = 'mateos-809-101'

let db: FakeDb
let ipSeq = 0

function seedUnit() {
  db.tables.units.push({ id: UNIT_ID, org_id: ORG_ID })
  db.tables.v_public_units.push({
    id: UNIT_ID,
    slug: UNIT_SLUG,
    building_slug: 'mateos-809',
    name: 'Depto 101',
    base_rate_mxn: 1000,
    cleaning_fee_mxn: 300,
    max_guests: 4,
    min_nights: 1,
  })
}

beforeEach(() => {
  process.env.PUBLIC_BOOKING_ENABLED = 'true' // test process only
  process.env.STRIPE_WEBHOOK_SECRET_PUBLIC = 'whsec_test_only'
  db = createFakeDb()
  dbRef.current = db
  seedUnit()
  stripeMock.sessionSeq = 0
  stripeMock.expire.mockReset().mockImplementation(async (id: string) => ({ id, status: 'expired' }))
  stripeMock.retrieve.mockReset().mockImplementation(async (id: string) => ({ id, status: 'expired' }))
  stripeMock.createCheckoutSession.mockReset().mockImplementation(async (p: { expiresAt: number }) => {
    const id = `cs_test_${++stripeMock.sessionSeq}`
    return { id, url: `https://checkout.stripe.test/${id}`, expires_at: p.expiresAt }
  })
})

async function startCheckout(idem = `idem-${Math.random()}`, dates = { from: '2026-11-10', to: '2026-11-12' }) {
  const req = new NextRequest('http://localhost/api/public/v1/bookings/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': idem,
      'x-forwarded-for': `10.0.0.${++ipSeq}`,
    },
    body: JSON.stringify({
      unit_slug: UNIT_SLUG,
      ...dates,
      guests: 2,
      guest: { name: 'Ana Huésped', email: 'ana@example.com', phone: '+524771234567' },
    }),
  })
  const res = await checkoutPOST(req)
  return { status: res.status, body: await res.json() }
}

function completedEvent(
  sessionId: string,
  amountCents: number,
  opts: {
    eventId?: string
    created?: number
    paymentStatus?: string
    currency?: string
    metadata?: Record<string, string>
  } = {},
) {
  return {
    id: opts.eventId ?? `evt_${sessionId}`,
    type: 'checkout.session.completed',
    created: opts.created ?? Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: sessionId,
        amount_total: amountCents,
        currency: opts.currency ?? 'mxn',
        payment_status: opts.paymentStatus ?? 'paid',
        metadata: opts.metadata ?? { hold_id: 'set-by-checkout-route' },
      },
    },
  }
}

async function deliver(event: unknown) {
  const req = new NextRequest('http://localhost/api/public/v1/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=valid' },
    body: JSON.stringify(event),
  })
  const res = await webhookPOST(req)
  return { status: res.status, body: await res.json() }
}

// 2 nights × 1000 + 300 cleaning = 2300; + 16% IVA = 2668.00 MXN
const TOTAL_MXN = 2668
const TOTAL_CENTS = 266_800

describe('checkout: snapshot completo en el hold antes de mandar a Stripe', () => {
  it('guarda org, huésped, precio y total en el hold y lo liga a la sesión', async () => {
    const { status, body } = await startCheckout()
    expect(status).toBe(200)

    expect(db.tables.reservation_holds).toHaveLength(1)
    const hold = db.tables.reservation_holds[0]
    expect(hold).toMatchObject({
      unit_id: UNIT_ID,
      organization_id: ORG_ID,
      guest_name: 'Ana Huésped',
      guest_email: 'ana@example.com',
      guest_phone: '+524771234567',
      price_per_night: 1000,
      total_price: TOTAL_MXN,
      booking_mode: 'full',
      stripe_session_id: body.data.session_id,
    })
    expect(body.data.hold_id).toBe(hold.id)
  })

  it('la sesión de Stripe cierra antes de que venza el hold', async () => {
    const { body } = await startCheckout()
    const hold = db.tables.reservation_holds[0]
    const [params] = stripeMock.createCheckoutSession.mock.calls[0]
    const sessionExpiresMs = params.expiresAt * 1000
    const holdExpiresMs = new Date(hold.expires_at as string).getTime()

    expect(sessionExpiresMs - Date.now()).toBeGreaterThanOrEqual(30 * 60_000) // Stripe minimum
    expect(holdExpiresMs - sessionExpiresMs).toBeGreaterThanOrEqual(20 * 60_000)
    expect(new Date(body.data.expires_at).getTime()).toBe(sessionExpiresMs)
  })

  it('si Stripe falla al crear la sesión, libera el hold', async () => {
    stripeMock.createCheckoutSession.mockRejectedValueOnce(new Error('stripe down'))
    const { status } = await startCheckout()
    expect(status).toBe(502)
    expect(db.tables.reservation_holds).toHaveLength(0)
  })

  it('si no puede ligar la sesión al hold, expira la sesión y no entrega URL de pago', async () => {
    db.faults.reservation_holds = { update: { code: '08006', message: 'connection lost' } }
    const { status, body } = await startCheckout()
    expect(status).toBe(500)
    expect(body.data).toBeUndefined()
    expect(stripeMock.expire).toHaveBeenCalledWith('cs_test_1')
    expect(db.tables.reservation_holds).toHaveLength(0)
  })

  it('no aparta noches que ya tienen una reserva confirmada', async () => {
    db.tables.reservations.push({
      id: 'res-ota', unit_id: UNIT_ID, status: 'confirmed', check_in: '2026-11-11', check_out: '2026-11-13',
    })
    const { status } = await startCheckout()
    expect(status).toBe(409)
    expect(stripeMock.createCheckoutSession).not.toHaveBeenCalled()
  })
})

describe('hold → checkout → webhook → reserva creada', () => {
  it('promueve el hold a reserva confirmada y pagada, y borra el hold', async () => {
    const { body } = await startCheckout()
    const sessionId = body.data.session_id

    const res = await deliver(completedEvent(sessionId, TOTAL_CENTS))
    expect(res.status).toBe(200)

    expect(db.tables.reservations).toHaveLength(1)
    expect(db.tables.reservations[0]).toMatchObject({
      unit_id: UNIT_ID,
      organization_id: ORG_ID,
      guest_name: 'Ana Huésped',
      check_in: '2026-11-10',
      check_out: '2026-11-12',
      mode: 'full',
      price_per_night: 1000,
      total_price: TOTAL_MXN,
      amount_paid: TOTAL_MXN,
      status: 'confirmed',
      payment_status: 'paid',
      platform: 'direct',
      stripe_checkout_session_id: sessionId,
    })
    expect(db.tables.reservation_holds).toHaveLength(0)
    expect(db.tables.stripe_processed_events.map((e) => e.event_id)).toEqual([`evt_${sessionId}`])
    expect(db.tables.public_booking_payment_failures).toHaveLength(0)
  })

  it('rechaza una firma inválida sin tocar la base', async () => {
    const req = new NextRequest('http://localhost/api/public/v1/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=forged' },
      body: JSON.stringify(completedEvent('cs_test_1', TOTAL_CENTS)),
    })
    const res = await webhookPOST(req)
    expect(res.status).toBe(400)
    expect(db.tables.reservations).toHaveLength(0)
    expect(db.tables.stripe_processed_events).toHaveLength(0)
  })
})

describe('webhook repetido: no duplica', () => {
  it('el mismo evento entregado dos veces deja una sola reserva', async () => {
    const { body } = await startCheckout()
    const event = completedEvent(body.data.session_id, TOTAL_CENTS)

    expect((await deliver(event)).status).toBe(200)
    const second = await deliver(event)
    expect(second.status).toBe(200)
    expect(second.body.message).toBe('already processed')
    expect(db.tables.reservations).toHaveLength(1)
  })

  it('otro evento de la misma sesión (reenvío manual) tampoco duplica', async () => {
    const { body } = await startCheckout()
    const sessionId = body.data.session_id

    await deliver(completedEvent(sessionId, TOTAL_CENTS, { eventId: 'evt_a' }))
    const res = await deliver(completedEvent(sessionId, TOTAL_CENTS, { eventId: 'evt_b' }))
    expect(res.status).toBe(200)
    expect(db.tables.reservations).toHaveLength(1)
  })

  it('entregas concurrentes de la misma sesión dejan una sola reserva', async () => {
    const { body } = await startCheckout()
    const sessionId = body.data.session_id

    const results = await Promise.all([
      deliver(completedEvent(sessionId, TOTAL_CENTS, { eventId: 'evt_1' })),
      deliver(completedEvent(sessionId, TOTAL_CENTS, { eventId: 'evt_1' })),
      deliver(completedEvent(sessionId, TOTAL_CENTS, { eventId: 'evt_2' })),
    ])
    expect(results.map((r) => r.status)).toEqual([200, 200, 200])
    expect(db.tables.reservations).toHaveLength(1)
  })

  it('un fallo transitorio no se marca como procesado: el reintento de Stripe sí crea la reserva', async () => {
    const { body } = await startCheckout()
    const sessionId = body.data.session_id
    const event = completedEvent(sessionId, TOTAL_CENTS)

    db.faults.stripe_processed_events = { select: { code: '08006', message: 'connection lost' } }
    expect((await deliver(event)).status).toBe(500)
    expect(db.tables.reservations).toHaveLength(0)

    delete db.faults.stripe_processed_events
    expect((await deliver(event)).status).toBe(200)
    expect(db.tables.reservations).toHaveLength(1)
  })
})

describe('webhook con hold vencido: registra el fallo y no deja reserva', () => {
  it('pago posterior al vencimiento del hold (hold aún presente)', async () => {
    const { body } = await startCheckout()
    const sessionId = body.data.session_id
    const hold = db.tables.reservation_holds[0]
    const expiredAt = Date.now() - 60_000
    hold.expires_at = new Date(expiredAt).toISOString()

    const res = await deliver(
      completedEvent(sessionId, TOTAL_CENTS, { created: Math.floor(expiredAt / 1000) + 1 }),
    )

    expect(res.status).toBe(500) // Stripe keeps retrying; never acked as processed
    expect(db.tables.reservations).toHaveLength(0)
    expect(db.tables.stripe_processed_events).toHaveLength(0)
    expect(db.tables.public_booking_payment_failures).toHaveLength(1)
    expect(db.tables.public_booking_payment_failures[0]).toMatchObject({
      stripe_session_id: sessionId,
      stripe_event_id: `evt_${sessionId}`,
      resolved_at: null,
    })
    expect(db.tables.public_booking_payment_failures[0].last_error).toMatch(/expired/)
  })

  it('hold vencido y ya liberado por otro huésped que apartó las mismas noches', async () => {
    const first = await startCheckout('idem-guest-a')
    const sessionA = first.body.data.session_id
    db.tables.reservation_holds[0].expires_at = new Date(Date.now() - 1000).toISOString()

    // Guest B takes the nights: the insert purges A's expired hold.
    const second = await startCheckout('idem-guest-b')
    expect(second.status).toBe(200)
    expect(db.tables.reservation_holds).toHaveLength(1)

    const res = await deliver(completedEvent(sessionA, TOTAL_CENTS))
    expect(res.status).toBe(500)
    expect(db.tables.reservations).toHaveLength(0)
    expect(db.tables.public_booking_payment_failures.map((f) => f.stripe_session_id)).toEqual([sessionA])
    // Guest B's hold is untouched and still promotable.
    expect((await deliver(completedEvent(second.body.data.session_id, TOTAL_CENTS))).status).toBe(200)
    expect(db.tables.reservations).toHaveLength(1)
  })

  it('reintentos repetidos actualizan el mismo registro de conciliación', async () => {
    const { body } = await startCheckout()
    const sessionId = body.data.session_id
    db.tables.reservation_holds.length = 0

    await deliver(completedEvent(sessionId, TOTAL_CENTS))
    await deliver(completedEvent(sessionId, TOTAL_CENTS))
    expect(db.tables.public_booking_payment_failures).toHaveLength(1)
    expect(db.tables.reservations).toHaveLength(0)
  })

  it('pagado a tiempo con webhook tardío: el hold sigue presente y se promueve', async () => {
    const { body } = await startCheckout()
    const sessionId = body.data.session_id
    const hold = db.tables.reservation_holds[0]
    const paidAt = Math.floor(Date.now() / 1000) - 120
    hold.expires_at = new Date(Date.now() - 60_000).toISOString() // expired after payment

    const res = await deliver(completedEvent(sessionId, TOTAL_CENTS, { created: paidAt }))
    expect(res.status).toBe(200)
    expect(db.tables.reservations).toHaveLength(1)
  })
})

describe('fallos alrededor de la promoción', () => {
  it('si falla el marcador después de promover: 500 sin conciliación falsa, y el reintento queda limpio', async () => {
    const { body } = await startCheckout()
    const event = completedEvent(body.data.session_id, TOTAL_CENTS)

    db.faults.stripe_processed_events = { insert: { code: '08006', message: 'connection lost' } }
    expect((await deliver(event)).status).toBe(500)
    expect(db.tables.reservations).toHaveLength(1)
    expect(db.tables.public_booking_payment_failures).toHaveLength(0)

    delete db.faults.stripe_processed_events
    expect((await deliver(event)).status).toBe(200)
    expect(db.tables.reservations).toHaveLength(1)
    expect(db.tables.stripe_processed_events).toHaveLength(1)
  })

  it('una entrega que falla DESPUÉS de que otra creó la reserva no deja conciliación abierta', async () => {
    const { body } = await startCheckout()
    const sessionId = body.data.session_id
    expect((await deliver(completedEvent(sessionId, TOTAL_CENTS, { eventId: 'evt_b' }))).status).toBe(200)

    // Delivery A of the same session hits a DB error after B committed.
    db.rpcFaults.fn_promote_paid_reservation = { code: '08006', message: 'connection lost' }
    expect((await deliver(completedEvent(sessionId, TOTAL_CENTS, { eventId: 'evt_a' }))).status).toBe(500)
    expect(db.tables.public_booking_payment_failures).toHaveLength(0)
    expect(db.tables.reservations).toHaveLength(1)
  })

  it('una conciliación abierta se cierra aunque la promoción regrese already_promoted', async () => {
    const { body } = await startCheckout()
    const sessionId = body.data.session_id
    await deliver(completedEvent(sessionId, TOTAL_CENTS, { eventId: 'evt_ok' }))
    db.tables.public_booking_payment_failures.push({
      stripe_session_id: sessionId, stripe_event_id: 'evt_old', last_error: 'x', resolved_at: null,
    })

    expect((await deliver(completedEvent(sessionId, TOTAL_CENTS, { eventId: 'evt_again' }))).status).toBe(200)
    expect(db.tables.public_booking_payment_failures[0].resolved_at).not.toBeNull()
  })

  it('una sesión que no es del booking público (p. ej. Payment Link) se ignora sin reintentos ni conciliación', async () => {
    const res = await deliver(completedEvent('cs_live_payment_link', 150_000, { metadata: {} }))
    expect(res.status).toBe(200)
    expect(db.tables.reservations).toHaveLength(0)
    expect(db.tables.public_booking_payment_failures).toHaveLength(0)
  })
})

describe('caché de Idempotency-Key del checkout', () => {
  async function staleAttempt(idem: string) {
    const first = await startCheckout(idem)
    expect(first.status).toBe(200)
    expect((await startCheckout(idem)).body.data.checkout_url).toBe(first.body.data.checkout_url)
    // 31 min later the Checkout session is dead; the cache row still lives 24 h.
    const cache = db.tables.checkout_idempotency.find((c) => c.key === idem)!
    ;(cache.response as Record<string, unknown>).expires_at = new Date(Date.now() - 1000).toISOString()
    return first.body.data.session_id as string
  }

  it('no devuelve una URL de pago vencida y libera el hold si Stripe confirma que venció', async () => {
    const sessionId = await staleAttempt('idem-retry-later')

    // checkout.session.expired has NOT arrived yet.
    const stale = await startCheckout('idem-retry-later')
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('CHECKOUT_EXPIRED')
    expect(stripeMock.retrieve).toHaveBeenCalledWith(sessionId)
    expect(db.tables.reservation_holds).toHaveLength(0)

    const retry = await startCheckout('idem-new-attempt')
    expect(retry.status).toBe(200)
    expect(retry.body.data.session_id).not.toBe(sessionId)
  })

  it('si Stripe aún la tiene abierta, la expira primero y luego libera', async () => {
    const sessionId = await staleAttempt('idem-open')
    stripeMock.retrieve.mockImplementationOnce(async (id: string) => ({ id, status: 'open' }))

    expect((await startCheckout('idem-open')).body.error.code).toBe('CHECKOUT_EXPIRED')
    expect(stripeMock.expire).toHaveBeenCalledWith(sessionId)
    expect(db.tables.reservation_holds).toHaveLength(0)
  })

  it('si Stripe dice que ya se pagó, NO libera el hold (el webhook puede venir en camino)', async () => {
    await staleAttempt('idem-paid')
    stripeMock.retrieve.mockImplementationOnce(async (id: string) => ({ id, status: 'complete' }))

    const res = await startCheckout('idem-paid')
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CHECKOUT_COMPLETED')
    expect(db.tables.reservation_holds).toHaveLength(1)
  })

  it('si Stripe no responde, no libera nada y conserva la clave; al recuperarse, libera', async () => {
    await staleAttempt('idem-stripe-down')
    stripeMock.retrieve.mockRejectedValueOnce(new Error('stripe down'))

    const down = await startCheckout('idem-stripe-down')
    expect(down.status).toBe(503)
    expect(down.body.error.code).toBe('CHECKOUT_STATUS_UNAVAILABLE')
    expect(db.tables.reservation_holds).toHaveLength(1)

    // Same key again once Stripe answers: released, then a new attempt works.
    expect((await startCheckout('idem-stripe-down')).body.error.code).toBe('CHECKOUT_EXPIRED')
    expect(db.tables.reservation_holds).toHaveLength(0)
    expect((await startCheckout('idem-after-recovery')).status).toBe(200)
  })
})

describe('otros cobros que no deben confirmar reserva', () => {
  it('monto distinto al total del hold: registra el fallo', async () => {
    const { body } = await startCheckout()
    const res = await deliver(completedEvent(body.data.session_id, TOTAL_CENTS - 100))
    expect(res.status).toBe(500)
    expect(db.tables.reservations).toHaveLength(0)
    expect(db.tables.reservation_holds).toHaveLength(1)
    expect(db.tables.public_booking_payment_failures[0].last_error).toMatch(/does not match/)
  })

  it('sesión completada sin pago (unpaid): no confirma', async () => {
    const { body } = await startCheckout()
    const res = await deliver(completedEvent(body.data.session_id, TOTAL_CENTS, { paymentStatus: 'unpaid' }))
    expect(res.status).toBe(500)
    expect(db.tables.reservations).toHaveLength(0)
  })

  it('moneda distinta de MXN: no confirma', async () => {
    const { body } = await startCheckout()
    const res = await deliver(completedEvent(body.data.session_id, TOTAL_CENTS, { currency: 'usd' }))
    expect(res.status).toBe(500)
    expect(db.tables.reservations).toHaveLength(0)
  })

  it('un reintento exitoso cierra el registro de conciliación', async () => {
    const { body } = await startCheckout()
    const sessionId = body.data.session_id
    await deliver(completedEvent(sessionId, TOTAL_CENTS - 1, { eventId: 'evt_bad' }))
    expect(db.tables.public_booking_payment_failures[0].resolved_at).toBeNull()

    await deliver(completedEvent(sessionId, TOTAL_CENTS, { eventId: 'evt_good' }))
    expect(db.tables.reservations).toHaveLength(1)
    expect(db.tables.public_booking_payment_failures[0].resolved_at).not.toBeNull()
  })
})

describe('checkout.session.expired libera solo el hold de esa sesión', () => {
  it('borra el hold ligado a la sesión vencida', async () => {
    const a = await startCheckout('idem-a', { from: '2026-11-10', to: '2026-11-12' })
    await startCheckout('idem-b', { from: '2026-11-20', to: '2026-11-22' })
    expect(db.tables.reservation_holds).toHaveLength(2)

    const res = await deliver({
      id: 'evt_expired',
      type: 'checkout.session.expired',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: a.body.data.session_id, metadata: { hold_id: 'spoofed' } } },
    })
    expect(res.status).toBe(200)
    expect(db.tables.reservation_holds.map((h) => h.stripe_session_id)).toEqual(['cs_test_2'])
  })
})
