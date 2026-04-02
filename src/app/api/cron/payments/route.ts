import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// NOTE: CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY must be set as env vars in Vercel dashboard.
// CRON_SECRET: a random string to authenticate cron requests
// SUPABASE_SERVICE_ROLE_KEY: found in Supabase → Settings → API → service_role key

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// This route is called by Vercel Cron on day 1 of each month
// Vercel cron config goes in vercel.json
export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = new Date(year, month, 0).toISOString().split('T')[0]

  const supabase = getSupabase()

  // Get all active and en_renovacion contracts
  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, monthly_amount, payment_day, org_id')
    .in('status', ['active', 'en_renovacion'])

  if (!contracts || contracts.length === 0) {
    return NextResponse.json({ message: 'No active contracts', generated: 0 })
  }

  // Check which ones already have a payment this month
  const { data: existingPayments } = await supabase
    .from('payments')
    .select('contract_id')
    .gte('due_date', monthStart)
    .lte('due_date', monthEnd)

  const existingContractIds = new Set((existingPayments || []).map(p => p.contract_id))

  // Generate pending payments for contracts without one this month
  const toInsert = contracts
    .filter(c => !existingContractIds.has(c.id))
    .map(c => ({
      org_id: c.org_id,
      contract_id: c.id,
      amount: Number(c.monthly_amount) + 250, // rent + water
      rent_amount: Number(c.monthly_amount),
      water_fee: 250,
      due_date: `${year}-${String(month).padStart(2, '0')}-${String(c.payment_day || 5).padStart(2, '0')}`,
      status: 'pending'
    }))

  if (toInsert.length > 0) {
    await supabase.from('payments').insert(toInsert)
  }

  return NextResponse.json({ message: 'OK', generated: toInsert.length })
}
