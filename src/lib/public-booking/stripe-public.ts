import Stripe from 'stripe'

// Singleton Stripe client for public booking endpoints.
// Uses the same STRIPE_SECRET_KEY as the internal client but a DIFFERENT
// webhook secret (STRIPE_WEBHOOK_SECRET_PUBLIC) to keep public and internal
// webhook flows isolated (ADR-018).
let _stripe: Stripe | null = null

export function getStripePublic(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-04-10',
      typescript: true,
    })
  }
  return _stripe
}

// ── Session creation helper ───────────────────────────────────────────────────

export interface CreateCheckoutSessionParams {
  unitName: string
  nights: number
  from: string
  to: string
  guests: number
  totalMxn: number           // pesos, not cents
  metadata: Record<string, string>
  idempotencyKey: string
}

export async function createCheckoutSession(
  params: CreateCheckoutSessionParams,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripePublic()
  const totalCents = Math.round(params.totalMxn * 100)

  const successUrl =
    process.env.PUBLIC_BOOKING_SUCCESS_URL?.replace('{HOLD_ID}', params.metadata.hold_id ?? '') ??
    'https://809.mx/confirmacion/{HOLD_ID}'

  const cancelUrl =
    process.env.PUBLIC_BOOKING_CANCEL_URL ?? 'https://809.mx/reservar'

  return stripe.checkout.sessions.create(
    {
      mode: 'payment',
      currency: 'mxn',
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            unit_amount: totalCents,
            product_data: {
              name: `Reserva ${params.unitName} · ${params.nights} ${params.nights === 1 ? 'noche' : 'noches'}`,
              description: `${params.from} → ${params.to} · ${params.guests} ${params.guests === 1 ? 'huésped' : 'huéspedes'}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: params.metadata,
      success_url: successUrl,
      cancel_url: cancelUrl,
    },
    {
      idempotencyKey: params.idempotencyKey,
    },
  )
}
