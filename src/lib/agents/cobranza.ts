// BaW OS — Agente Cobranza v1 (S4-3)
// Ejecuta dunning sobre payments overdue: detecta mora, escala niveles, registra notificaciones.
// Reutiliza la lógica de mora-engine. v1 = dry-run + audit; v2 enviará emails/whatsapp reales.

import { createServiceClient } from '@/lib/api-auth'
import { getMoraLevel } from '@/lib/mora-engine'
import type { AgentRunContext, AgentRunResult, AgentRunner } from './types'

interface PaymentRow {
  id: string
  contract_id: string | null
  due_date: string
  amount: number | null
  rent_amount: number | null
  water_fee: number | null
  status: string | null
  confirmed_at: string | null
  org_id: string
}

interface ContractRow {
  id: string
  unit_id: string | null
  tenant_name: string | null
  org_id: string
}

interface UnitRow {
  id: string
  unit_number: string | null
  building_id: string | null
}

export const cobranzaRunner: AgentRunner = {
  agentId: 'cobranza',

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const supabase = createServiceClient()
    const dryRun = ctx.input.dry_run !== false // por defecto dry-run en v1
    const today = new Date()

    // 1. Cargar payments overdue (no confirmados, due_date pasado) del org actual
    const { data: payments, error: pErr } = await supabase
      .from('payments')
      .select('id, contract_id, due_date, amount, rent_amount, water_fee, status, confirmed_at, org_id')
      .eq('org_id', ctx.orgId)
      .is('confirmed_at', null)
      .lte('due_date', today.toISOString().slice(0, 10))
      .limit(500)

    if (pErr) {
      await ctx.recordAction({
        action_type: 'cobranza.fetch_payments',
        status: 'failed',
        error: pErr.message,
      })
      return {
        output: { error: 'fetch_payments_failed' },
        metrics: { actions_total: 1, actions_ok: 0, actions_failed: 1 },
      }
    }

    const overdue = (payments || []) as PaymentRow[]

    if (overdue.length === 0) {
      await ctx.recordAction({
        action_type: 'cobranza.scan_complete',
        status: 'ok',
        result: { overdue_count: 0 },
      })
      return {
        output: { message: 'no overdue payments', overdue_count: 0 },
        metrics: { actions_total: 1, actions_ok: 1, actions_failed: 0 },
      }
    }

    // 2. Agrupar por contract_id, calcular días de mora
    const byContract = new Map<string, PaymentRow[]>()
    for (const p of overdue) {
      if (!p.contract_id) continue
      const arr = byContract.get(p.contract_id) || []
      arr.push(p)
      byContract.set(p.contract_id, arr)
    }

    const contractIds = Array.from(byContract.keys())
    let contracts: ContractRow[] = []
    if (contractIds.length > 0) {
      const { data: cRows } = await supabase
        .from('contracts')
        .select('id, unit_id, tenant_name, org_id')
        .in('id', contractIds)
      contracts = (cRows || []) as ContractRow[]
    }

    const unitIds = contracts.map((c) => c.unit_id).filter(Boolean) as string[]
    let units: UnitRow[] = []
    if (unitIds.length > 0) {
      const { data: uRows } = await supabase
        .from('units')
        .select('id, unit_number, building_id')
        .in('id', unitIds)
      units = (uRows || []) as UnitRow[]
    }

    let actionsOk = 0
    let actionsFailed = 0
    let actionsSkipped = 0
    const escalations: Record<string, number> = { grace: 0, warning: 0, critical: 0, legal: 0, abogado: 0 }

    for (const contract of contracts) {
      const contractPayments = byContract.get(contract.id) || []
      const oldest = contractPayments.reduce((acc, p) =>
        new Date(p.due_date) < new Date(acc.due_date) ? p : acc,
      contractPayments[0])

      const daysPastDue = Math.floor((today.getTime() - new Date(oldest.due_date).getTime()) / 86400000)
      const level = getMoraLevel(daysPastDue)
      escalations[level] = (escalations[level] || 0) + 1

      const totalOverdue = contractPayments.reduce((sum, p) => {
        const amount = Number(p.amount || (Number(p.rent_amount || 0) + Number(p.water_fee || 0)))
        return sum + amount
      }, 0)

      const unit = units.find((u) => u.id === contract.unit_id)

      if (level === 'grace') {
        await ctx.recordAction({
          action_type: 'cobranza.skip_grace',
          entity_type: 'contract',
          entity_id: contract.id,
          status: 'skipped',
          payload: { days_past_due: daysPastDue, level },
        })
        actionsSkipped++
        continue
      }

      // v1: registrar acción de notificación (dry-run por defecto)
      const notifyStatus = dryRun ? 'pending_approval' : 'ok'
      await ctx.recordAction({
        action_type: 'cobranza.notify',
        entity_type: 'contract',
        entity_id: contract.id,
        status: notifyStatus,
        payload: {
          dry_run: dryRun,
          tenant_name: contract.tenant_name,
          unit_number: unit?.unit_number,
          days_past_due: daysPastDue,
          level,
          total_overdue: totalOverdue,
          payments_count: contractPayments.length,
        },
        result: dryRun
          ? { message: 'dry-run: notificación NO enviada, requiere aprobación humana' }
          : { message: 'notificación registrada en audit' },
      })

      // En no-dry-run, además escribimos a audit_log para backward-compat con /api/mora/notify
      if (!dryRun) {
        await supabase.from('audit_log').insert({
          org_id: ctx.orgId,
          actor_type: 'agent',
          actor_id: 'cobranza',
          action: 'mora.notificacion_enviada',
          entity_type: 'contract',
          entity_id: contract.id,
          metadata: {
            unit_number: unit?.unit_number,
            tenant_name: contract.tenant_name,
            days_past_due: daysPastDue,
            total_overdue: totalOverdue,
            level,
            run_id: ctx.runId,
          },
        })
      }

      actionsOk++
    }

    return {
      output: {
        overdue_count: overdue.length,
        contracts_processed: contracts.length,
        escalations,
        dry_run: dryRun,
      },
      metrics: {
        actions_total: actionsOk + actionsFailed + actionsSkipped,
        actions_ok: actionsOk,
        actions_failed: actionsFailed,
        actions_skipped: actionsSkipped,
      },
    }
  },
}
