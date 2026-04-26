export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAlertLevel, type ContractAlert, type AlertLevel } from '@/lib/contract-alerts'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data, error } = await supabase
    .from('contracts')
    .select('id, unit_id, end_date, occupant:occupants(name), unit:units(number)')
    .in('status', ['active', 'en_renovacion'])
    .not('end_date', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const alerts: ContractAlert[] = []

  for (const c of data || []) {
    const level = getAlertLevel(c.end_date)
    if (!level) continue

    const end = new Date(c.end_date!)
    const diffDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    alerts.push({
      contractId: c.id,
      unitId: c.unit_id,
      unitNumber: (c as any).unit?.number || '—',
      tenantName: (c as any).occupant?.name || 'Sin inquilino',
      endDate: c.end_date!,
      daysUntilExpiry: diffDays,
      level: level as AlertLevel,
    })
  }

  alerts.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)

  return NextResponse.json(alerts)
}
