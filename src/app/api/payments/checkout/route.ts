import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  try {
    const { payment_id, contract_id, amount, description } = await request.json()

    if (!payment_id || !contract_id || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: payment_id, contract_id, amount' },
        { status: 400 }
      )
    }

    // Create Stripe Payment Intent (amount in centavos MXN)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'mxn',
      description: description || `Pago de renta — contrato ${contract_id}`,
      metadata: {
        payment_id,
        contract_id,
      },
    })

    // Save the Stripe payment intent ID to the payments table
    const supabase = createServiceClient()
    await supabase
      .from('payments')
      .update({
        reference: paymentIntent.id,
        method: 'stripe',
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
