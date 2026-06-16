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

interface AncillaryCharge {
  id: string
  org_id: string
  contract_id: string
  amount: number
  quantity: number
  cadence: 'monthly' | 'annual'
  billing_day: number
  effective_from: string
  effective_to: string | null
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

  // Existing payments this month, split by source (rent vs ancillary) so each
  // generator only dedups against its own kind of row.
  const { data: existingPayments } = await supabase
    .from('payments')
    .select('contract_id, ancillary_charge_id')
    .gte('due_date', monthStart)
    .lte('due_date', monthEnd)

  const rentDoneContractIds = new Set(
    (existingPayments || []).filter(p => !p.ancillary_charge_id).map(p => p.contract_id)
  )
  const ancillaryDoneChargeIds = new Set(
    (existingPayments || []).filter(p => p.ancillary_charge_id).map(p => p.ancillary_charge_id)
  )

  // ── 1) Renta mensual ────────────────────────────────────────────────────
  // STR (renta corta) se cobra por reserva, no por mes → se excluye.
  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, monthly_amount, payment_day, org_id, rent_type')
    .in('status', ['active', 'en_renovacion'])
    .neq('rent_type', 'STR')

  const rentToInsert = (contracts || [])
    .filter(c => !rentDoneContractIds.has(c.id))
    .map(c => ({
      org_id: c.org_id,
      contract_id: c.id,
      amount: Number(c.monthly_amount) + 250, // rent + water
      rent_amount: Number(c.monthly_amount),
      water_fee: 250,
      due_date: `${year}-${String(month).padStart(2, '0')}-${String(c.payment_day || 5).padStart(2, '0')}`,
      status: 'pending',
    }))

  // ── 2) Cargos accesorios (estacionamiento extra, espectaculares) ─────────
  // Activos y vigentes este mes. Mensuales: cada mes. Anuales: solo en su mes
  // aniversario (el mes de effective_from).
  const { data: charges } = await supabase
    .from('ancillary_charges')
    .select('id, org_id, contract_id, amount, quantity, cadence, billing_day, effective_from, effective_to')
    .eq('status', 'active')
    .lte('effective_from', monthEnd)
    .or(`effective_to.is.null,effective_to.gte.${monthStart}`)

  const ancillaryToInsert = ((charges || []) as AncillaryCharge[])
    .filter(c => {
      if (ancillaryDoneChargeIds.has(c.id)) return false
      if (c.cadence === 'annual') {
        // Solo en el mes aniversario (mes de effective_from)
        const anniversaryMonth = new Date(c.effective_from).getUTCMonth() + 1
        if (anniversaryMonth !== month) return false
      }
      return true
    })
    .map(c => ({
      org_id: c.org_id,
      contract_id: c.contract_id,
      ancillary_charge_id: c.id,
      amount: Number(c.amount) * (c.quantity || 1),
      due_date: `${year}-${String(month).padStart(2, '0')}-${String(c.billing_day || 1).padStart(2, '0')}`,
      status: 'pending',
    }))

  const toInsert = [...rentToInsert, ...ancillaryToInsert]
  if (toInsert.length > 0) {
    await supabase.from('payments').insert(toInsert)
  }

  return NextResponse.json({
    message: 'OK',
    generated: toInsert.length,
    rent: rentToInsert.length,
    ancillary: ancillaryToInsert.length,
  })
}
