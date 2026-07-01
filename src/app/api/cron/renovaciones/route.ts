// BaW OS — GET /api/cron/renovaciones · ciclo de vida del contrato.
// El cron diario detecta contratos por vencer (≤30 días) o ya vencidos sin renovar
// y los pasa a 'en_renovacion' sin cortar la facturación, avisando al inquilino.
// Modo real vs dry-run lo controla COBRANZA_WHATSAPP_ENABLED (mismo gate que cobranza):
//   - flag 'true'  → flip de estado + WhatsApp real (salvo ?dry_run=true)
//   - flag ausente → dry-run (solo registra en audit, no muta ni envía)
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { renovacionesRunner } from '@/lib/agents/renovaciones'
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
      const result = await executeAgentRun(renovacionesRunner, {
        orgId,
        agentId: 'renovaciones',
        triggeredBy: 'cron',
        input: { dry_run: dryRun },
      })
      runs.push({ org_id: orgId, run_id: result.runId, status: result.status })
    } catch (e) {
      runs.push({ org_id: orgId, status: 'failed', error: e instanceof Error ? e.message : 'run_failed' })
    }
  }

  return NextResponse.json({ message: 'OK', dry_run: dryRun, runs })
}
