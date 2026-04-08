import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/api-auth'

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
    const supabase = createServiceClient()
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
