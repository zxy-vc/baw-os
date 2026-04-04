import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMoraLevel, type MoraStatus } from '@/lib/mora-engine'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function createMoraClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key')
  const expected = process.env.BAWOS_API_KEY
  if (!expected || apiKey !== expected) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createMoraClient()
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    // 1. Fetch overdue unconfirmed payments
    const { data: payments, error: paymentsErr } = await supabase
      .from('payments')
      .select('id, contract_id, due_date, amount, status, confirmed_by')
      .in('status', ['pending', 'late'])
      .lt('due_date', todayStr)

    if (paymentsErr) {
      return NextResponse.json({ success: false, error: paymentsErr.message }, { status: 500 })
    }

    // Filter: only unconfirmed (confirmed_by IS NULL or "system")
    const overduePayments = (payments || []).filter(
      (p: { confirmed_by: string | null }) => !p.confirmed_by || p.confirmed_by === 'system'
    )

    if (overduePayments.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    // 2. Group by contract_id
    const byContract = new Map<string, typeof overduePayments>()
    for (const p of overduePayments) {
      const existing = byContract.get(p.contract_id) || []
      existing.push(p)
      byContract.set(p.contract_id, existing)
    }

    // 3. Fetch contract + unit + occupant data
    const contractIds = Array.from(byContract.keys())
    const { data: contracts, error: contractsErr } = await supabase
      .from('contracts')
      .select('id, unit_id, occupant_id, status')
      .in('id', contractIds)
      .in('status', ['active', 'en_renovacion'])

    if (contractsErr) {
      return NextResponse.json({ success: false, error: contractsErr.message }, { status: 500 })
    }

    const activeContracts = contracts || []
    const unitIds = activeContracts.map((c: { unit_id: string }) => c.unit_id).filter(Boolean)
    const occupantIds = activeContracts.map((c: { occupant_id: string }) => c.occupant_id).filter(Boolean)

    const [unitsRes, occupantsRes] = await Promise.all([
      unitIds.length > 0
        ? supabase.from('units').select('id, number').in('id', unitIds)
        : { data: [], error: null },
      occupantIds.length > 0
        ? supabase.from('occupants').select('id, name').in('id', occupantIds)
        : { data: [], error: null },
    ])

    const unitMap = new Map((unitsRes.data || []).map((u: { id: string; number: string }) => [u.id, u]))
    const occupantMap = new Map((occupantsRes.data || []).map((o: { id: string; name: string }) => [o.id, o]))

    // 4. Build MoraStatus for each contract
    const results: MoraStatus[] = []

    for (const contract of activeContracts) {
      const contractPayments = byContract.get(contract.id)
      if (!contractPayments || contractPayments.length === 0) continue

      const unit = unitMap.get(contract.unit_id) as { id: string; number: string } | undefined
      const occupant = occupantMap.get(contract.occupant_id) as { id: string; name: string } | undefined

      // Calculate days past due from the oldest overdue payment
      const paymentDetails = contractPayments.map((p: { id: string; due_date: string; amount: number }) => {
        const daysLate = Math.floor(
          (now.getTime() - new Date(p.due_date).getTime()) / (1000 * 60 * 60 * 24)
        )
        return {
          id: p.id,
          due_date: p.due_date,
          amount: Number(p.amount),
          days_late: daysLate,
        }
      })

      const maxDaysLate = Math.max(...paymentDetails.map((p) => p.days_late))
      const totalOverdue = paymentDetails.reduce((sum, p) => sum + p.amount, 0)
      const level = getMoraLevel(maxDaysLate)

      // Filter: only return non-grace (> 5 days)
      if (level === 'grace') continue

      results.push({
        contractId: contract.id,
        unitId: unit?.id || '',
        unitNumber: unit?.number || 'N/A',
        tenantName: occupant?.name || 'Sin nombre',
        daysPastDue: maxDaysLate,
        totalOverdue,
        level,
        payments: paymentDetails.sort((a, b) => b.days_late - a.days_late),
      })
    }

    // 5. Sort by daysPastDue DESC
    results.sort((a, b) => b.daysPastDue - a.daysPastDue)

    return NextResponse.json({ success: true, data: results })
  } catch (err) {
    console.error('Mora engine error:', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
