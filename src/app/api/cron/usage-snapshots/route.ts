// BaW OS — GET /api/cron/usage-snapshots · Fase 2 ADR-022
//
// Cron mensual (día 1) que llena org_usage_snapshots con las bases de cobro
// candidatas de los revenue streams (§3.4 del ADR) para el MES ANTERIOR
// (mes cerrado). Override manual: ?month=YYYY-MM. Idempotente: upsert por
// (org, period) — re-correrlo recalcula el snapshot.
//
// GMV cobrado: mismo criterio anti doble conteo que liquidaciones-server —
// abonos del mes (payment_receipts) + payments pagados en el mes que no
// tienen ningún abono (Stripe/conserje/legacy marcan payments directo).
import { NextResponse } from 'next/server'
import { createServiceClient, timingSafeEqualStr } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

function prevMonth(): string {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 7)
}

function monthRange(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { start: `${period}-01`, end: `${period}-${String(lastDay).padStart(2, '0')}` }
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET || ''
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/, '')
  if (!cronSecret || !timingSafeEqualStr(token, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const monthParam = url.searchParams.get('month')
  const period = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : prevMonth()
  const { start, end } = monthRange(period)

  const supabase = createServiceClient()
  const { data: orgs, error: orgsErr } = await supabase.from('organizations').select('id')
  if (orgsErr) return NextResponse.json({ error: orgsErr.message }, { status: 500 })

  const results: Array<{ org_id: string; status: string; error?: string }> = []

  for (const org of orgs ?? []) {
    const orgId = org.id as string
    try {
      const [unitsR, usersR, contractsR, receiptsR, paidR, runsR, cfdiR] =
        await Promise.all([
          supabase
            .from('units')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .is('archived_at', null),
          supabase
            .from('org_members')
            .select('user_id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('is_active', true),
          supabase
            .from('contracts')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .in('status', ['active', 'en_renovacion']),
          supabase
            .from('payment_receipts')
            .select('amount')
            .eq('org_id', orgId)
            .gte('paid_date', start)
            .lte('paid_date', end),
          supabase
            .from('payments')
            .select('id, amount_paid')
            .eq('org_id', orgId)
            .gte('paid_date', start)
            .lte('paid_date', end)
            .gt('amount_paid', 0),
          supabase
            .from('agent_runs')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .gte('started_at', `${start}T00:00:00`)
            .lte('started_at', `${end}T23:59:59`),
          supabase
            .from('invoices')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .gte('created_at', `${start}T00:00:00`)
            .lte('created_at', `${end}T23:59:59`),
        ])

      // Payments pagados en el mes con algún abono: ya cuentan vía receipts.
      const paidIds = (paidR.data ?? []).map((p) => p.id)
      let withReceipts = new Set<string>()
      if (paidIds.length > 0) {
        const { data: recForPaid } = await supabase
          .from('payment_receipts')
          .select('payment_id')
          .in('payment_id', paidIds)
        withReceipts = new Set((recForPaid ?? []).map((r) => r.payment_id))
      }
      const receiptsSum = (receiptsR.data ?? []).reduce(
        (s, r) => s + Number(r.amount || 0),
        0,
      )
      const directSum = (paidR.data ?? [])
        .filter((p) => !withReceipts.has(p.id))
        .reduce((s, p) => s + Number(p.amount_paid || 0), 0)
      const gmv = Math.round((receiptsSum + directSum) * 100) / 100

      const { error: upsertErr } = await supabase.from('org_usage_snapshots').upsert(
        {
          org_id: orgId,
          period,
          active_units: unitsR.count ?? 0,
          active_users: usersR.count ?? 0,
          active_contracts: contractsR.count ?? 0,
          gmv_collected_mxn: gmv,
          agent_runs: runsR.count ?? 0,
          cfdi_count: cfdiR.count ?? 0,
          computed_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,period' },
      )
      if (upsertErr) throw new Error(upsertErr.message)
      results.push({ org_id: orgId, status: 'ok' })
    } catch (e) {
      results.push({
        org_id: orgId,
        status: 'failed',
        error: e instanceof Error ? e.message : 'snapshot_failed',
      })
    }
  }

  return NextResponse.json({ message: 'OK', period, results })
}
