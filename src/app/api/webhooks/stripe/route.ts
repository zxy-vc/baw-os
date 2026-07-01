import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object
    const paymentId = paymentIntent.metadata?.payment_id

    if (paymentId) {
      const supabase = createServiceClient()

      // Leer el cargo primero para: (1) derivar org_id del PROPIO pago (no de la
      // metadata, que puede faltar → ledger con org_id null), y (2) setear
      // amount_paid = total del cargo (renta+agua+mora). Antes solo se ponía
      // status='paid' sin amount_paid, y billing.ts (fuente única) lo contaba mal.
      const { data: payment } = await supabase
        .from('payments')
        .select('org_id, contract_id, amount, water_fee, late_fee_amount, contract:contracts(unit_id, occupant:occupants(name))')
        .eq('id', paymentId)
        .single()

      const totalDue = payment
        ? Number(payment.amount || 0) + Number(payment.late_fee_amount || 0)
        : null

      await supabase
        .from('payments')
        .update({
          status: 'paid',
          amount_paid: totalDue,
          paid_date: new Date().toISOString().split('T')[0],
          method: 'stripe',
          reference: paymentIntent.id,
          confirmed_by: 'stripe',
          confirmed_at: new Date().toISOString(),
          payment_method: 'stripe',
        })
        .eq('id', paymentId)

      if (payment) {
        const contract = payment.contract as unknown as { unit_id: string; occupant: { name: string } | null } | null
        await supabase.from('payment_ledger').insert({
          org_id: payment.org_id || paymentIntent.metadata?.org_id || null,
          payment_id: paymentId,
          contract_id: payment.contract_id,
          unit_id: contract?.unit_id || null,
          tenant_name: contract?.occupant?.name || null,
          amount: payment.amount - (payment.water_fee || 0),
          water_fee: payment.water_fee || 0,
          total: payment.amount,
          payment_method: 'stripe',
          confirmed_by: 'stripe',
          notes: `Stripe PI: ${paymentIntent.id}`,
        })
      }
    }
  }

  return NextResponse.json({ received: true })
}
