// BaW OS — GET /api/cron/cobranza · automatización de cobranza (recordatorios + mora)
// El cron diario manda recordatorios preventivos y avisos de mora por WhatsApp.
// Modo real vs dry-run lo controla COBRANZA_WHATSAPP_ENABLED:
//   - flag 'true'  → el cron envía WhatsApp real (a menos que se fuerce ?dry_run=true)
//   - flag ausente → dry-run (solo registra en audit, no envía)
// Override manual disponible con ?dry_run=true|false.
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { cobranzaRunner } from '@/lib/agents/cobranza'
import { executeAgentRun } from '@/lib/agents/runner'
import { cobranzaWhatsAppEnabled } from '@/lib/whatsapp'
import { timingSafeEqualStr } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET || ''
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/, '')
  if (!cronSecret || !timingSafeEqualStr(token, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const override = url.searchParams.get('dry_run')
  // Default: real si el flag está encendido; dry-run si no. Override con query.
  const dryRun = override !== null ? override !== 'false' : !cobranzaWhatsAppEnabled()

  const supabase = createServiceClient()
  const { data: orgs, error } = await supabase.from('organizations').select('id')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ message: 'No organizations', runs: [] })
  }

  const runs: Array<{ org_id: string; run_id?: string; status: string; error?: string }> = []
  for (const org of orgs) {
    const orgId = org.id as string
    try {
      const result = await executeAgentRun(cobranzaRunner, {
        orgId,
        agentId: 'cobranza',
        triggeredBy: 'cron',
        input: { dry_run: dryRun },
      })
      runs.push({ org_id: orgId, run_id: result.runId, status: result.status })
    } catch (e) {
      runs.push({
        org_id: orgId,
        status: 'failed',
        error: e instanceof Error ? e.message : 'run_failed',
      })
    }
  }

  return NextResponse.json({ message: 'OK', dry_run: dryRun, runs })
}
