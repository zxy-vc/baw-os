// BaW OS · BAW-15 — The booking client must read the API's error envelope
// ({ error: { code, message } }) so it can react to CHECKOUT_EXPIRED.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { postCheckout } from '@/lib/public-booking-client/api-client'

afterEach(() => vi.unstubAllGlobals())

describe('postCheckout errors', () => {
  it('expone code y message del envelope de error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: { code: 'CHECKOUT_EXPIRED', message: 'Checkout session expired.' } }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )
    const res = await postCheckout(
      { unit_slug: 'u', from: '2026-11-10', to: '2026-11-12', guests: 2, guest: { name: 'A', email: 'a@example.com' } },
      'idem-1',
    )
    expect(res.error).toEqual({ status: 409, code: 'CHECKOUT_EXPIRED', message: 'Checkout session expired.' })
  })
})
