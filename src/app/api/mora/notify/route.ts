import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMoraLevel } from '@/lib/mora-engine'
import { resolveOrgIdForWebhook, listAllOrgIds } from '@/lib/org-context'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Sprint 5 / fix #22: cron multi-tenant.
// - Si el body trae `org_id` o `org_slug`, opera solo sobre ese tenant.
// - Si no, itera sobre TODOS los tenants (default cron sin filtro).

function createMoraClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

interface MoraEntry {
  contractId: string
  unitNumber: string
  tenantName: string
  daysPastDue: number
  totalOverdue: number
  level: string
}

async function notifyForOrg(
  baseUrl: string,
  orgId: string,
  contractIds: string[] | undefined,
): Promise<{ orgId: string; notified: string[] }> {
  const moraRes = await fetch(`${baseUrl}/api/mora?org_id=${orgId}`)
  const moraData = await moraRes.json()
  if (!moraData.success || !moraData.data) {
    return { orgId, notified: [] }
  }

  let toNotify = moraData.data as MoraEntry[]
  if (contractIds && contractIds.length > 0) {
    toNotify = toNotify.filter((m) => contractIds.includes(m.contractId))
  }
  if (toNotify.length === 0) {
    return { orgId, notified: [] }
  }

  const supabase = createMoraClient()
  const notified: string[] = []

  for (const mora of toNotify) {
    const { error } = await supabase.from('audit_log').insert({
      org_id: orgId,
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
    if (!error) notified.push(mora.contractId)
  }

  return { orgId, notified }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { contractIds } = body as { contractIds?: string[] }

    const baseUrl = request.nextUrl.origin

    // Resolver target orgs: explicit > all
    const explicitOrg = await resolveOrgIdForWebhook(request, body)
    const targetOrgs = explicitOrg ? [explicitOrg] : await listAllOrgIds()

    if (targetOrgs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No organizations found' },
        { status: 404 },
      )
    }

    const results = await Promise.all(
      targetOrgs.map((orgId) => notifyForOrg(baseUrl, orgId, contractIds)),
    )

    const totalNotified = results.reduce((sum, r) => sum + r.notified.length, 0)

    return NextResponse.json({
      success: true,
      data: {
        notified: totalNotified,
        per_org: results,
      },
    })
  } catch (err) {
    console.error('Mora notify error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    )
  }
}
