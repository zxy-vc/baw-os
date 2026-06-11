// BaW OS — GET /api/cron/cobranza · automatización interna de mora
// Sprint 5A MVP: el runner de cobranza ya no se invoca desde la UI de agentes
// (catálogo muestra solo third-party); este cron diario lo mantiene operando
// como automatización del sistema. Dry-run por defecto (v1 del runner);
// ejecutar con ?dry_run=false para escalar mora de verdad.
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { cobranzaRunner } from '@/lib/agents/cobranza'
import { executeAgentRun } from '@/lib/agents/runner'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dry_run') !== 'false'

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
