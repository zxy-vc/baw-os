import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMoraLevel } from '@/lib/mora-engine'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const ORG_ID = 'ed4308c7-2bdb-46f2-be69-7c59674838e2'

function createMoraClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { contractIds } = body as { contractIds?: string[] }

    // Fetch mora data from our own API
    const baseUrl = request.nextUrl.origin
    const moraRes = await fetch(`${baseUrl}/api/mora`)
    const moraData = await moraRes.json()

    if (!moraData.success || !moraData.data) {
      return NextResponse.json({ success: false, error: 'Failed to fetch mora data' }, { status: 500 })
    }

    // Filter by contractIds if provided, otherwise notify all non-grace
    let toNotify = moraData.data as Array<{
      contractId: string
      unitNumber: string
      tenantName: string
      daysPastDue: number
      totalOverdue: number
      level: string
    }>

    if (contractIds && contractIds.length > 0) {
      toNotify = toNotify.filter((m) => contractIds.includes(m.contractId))
    }

    if (toNotify.length === 0) {
      return NextResponse.json({ success: true, data: { notified: 0, contracts: [] } })
    }

    const supabase = createMoraClient()
    const notifiedContracts: string[] = []

    for (const mora of toNotify) {
      const { error } = await supabase.from('audit_log').insert({
        org_id: ORG_ID,
        actor_type: 'agent',
        actor_id: 'mora-engine',
        action: 'mora.notificacion_enviada',
        entity_type: 'contract',
        entity_id: mora.contractId,
        metadata: {
          unit_number: mora.unitNumber,
          tenant_name: mora.tenantName,
          days_past_due: mora.daysPastDue,
          total_overdue: mora.totalOverdue,
          level: mora.level,
          notified_at: new Date().toISOString(),
        },
      })

      if (!error) {
        notifiedContracts.push(mora.contractId)
      }
    }

    return NextResponse.json({
      success: true,
      data: { notified: notifiedContracts.length, contracts: notifiedContracts },
    })
  } catch (err) {
    console.error('Mora notify error:', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
