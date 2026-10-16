import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/api-auth'
import { isCollectibleCharge } from '@/lib/billing'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { payment_id, amount, description, tenant_email } = await request.json()

    if (!payment_id || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: payment_id, amount' },
        { status: 400 }
      )
    }

    // Antes de cualquier intento de cobro: el cargo debe existir y seguir cobrable
    // (ni pagado ni anulado por el corte de BAW-18).
    const supabase = createServiceClient()
    const { data: charge } = await supabase
      .from('payments')
      .select('id, status')
      .eq('id', payment_id)
      .maybeSingle()
    if (!charge) {
      return NextResponse.json({ error: 'Cargo no encontrado' }, { status: 404 })
    }
    if (!isCollectibleCharge(charge.status)) {
      return NextResponse.json({ error: 'Este cargo ya está pagado o anulado' }, { status: 409 })
    }

    // Create Stripe Payment Intent (amount in centavos MXN)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'mxn',
      description: description || `Pago de renta — BaW OS`,
      metadata: {
        payment_id,
      },
      ...(tenant_email && { receipt_email: tenant_email }),
    })

    // Save the Stripe payment intent ID to the payments table
    await supabase
      .from('payments')
      .update({
        stripe_payment_intent_id: paymentIntent.id,
      })
      .eq('id', payment_id)

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    })
  } catch (err) {
    console.error('[Stripe Checkout]', err)
    return NextResponse.json(
      { error: 'Error creating payment intent' },
      { status: 500 }
    )
  }
}
