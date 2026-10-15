// BaW OS · BAW-15 — Parámetros de la sesión de Stripe Checkout.
// The Stripe SDK is replaced by a recorder: no request ever leaves the process.
import { describe, expect, it, vi } from 'vitest'

const recorded = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('stripe', () => ({
  default: class FakeStripe {
    checkout = { sessions: { create: recorded.create } }
  },
}))

import { createCheckoutSession } from '@/lib/public-booking/stripe-public'

describe('createCheckoutSession', () => {
  it('solo tarjeta, con vencimiento explícito y montos en centavos', async () => {
    recorded.create.mockResolvedValue({ id: 'cs_test_x' })
    const expiresAt = Math.floor(Date.now() / 1000) + 31 * 60

    await createCheckoutSession({
      unitName: 'Depto 101',
      buildingSlug: 'mateos-809',
      nights: 2,
      from: '2026-11-10',
      to: '2026-11-12',
      guests: 2,
      totalMxn: 2668,
      metadata: { hold_id: 'hold-1' },
      idempotencyKey: 'idem-1',
      expiresAt,
    })

    const [params, options] = recorded.create.mock.calls[0]
    // Delayed methods (OXXO) settle after the hold is gone → paid without a night.
    expect(params.payment_method_types).toEqual(['card'])
    expect(params.expires_at).toBe(expiresAt)
    expect(params.line_items[0].price_data.unit_amount).toBe(266_800)
    expect(params.line_items[0].price_data.currency).toBe('mxn')
    expect(options).toEqual({ idempotencyKey: 'idem-1' })
  })
})
