// BaW OS — Agente Cobranza v2 (Bloque 1: cobranza viva)
// Dunning sobre payments: recordatorio preventivo (antes de vencer) + aviso de
// mora escalado (después de vencer), con envío real por WhatsApp Business
// gateado por COBRANZA_WHATSAPP_ENABLED. Si el gate está apagado o falta el
// teléfono, registra la acción en audit sin enviar (comportamiento dry-run).
//
// Fix 2026-06-15: la v1 seleccionaba contracts.tenant_name y units.unit_number
// (columnas inexistentes — son occupant_id y number), por lo que nunca resolvía
// al inquilino y no podía notificar. Ahora resuelve vía occupants.

import { createServiceClient } from '@/lib/api-auth'
import { calcMoraSurcharge, getMoraLevelOrder, type MoraLevel } from '@/lib/mora-engine'
import {
  sendWhatsAppText,
  whatsAppConfigured,
  buildReminderMessage,
  buildDunningMessage,
} from '@/lib/whatsapp'
import type { AgentRunContext, AgentRunResult, AgentRunner } from './types'

const REMINDER_DAYS = 5 // recordatorio preventivo N días antes del vencimiento

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
  occupant_id: string | null
  org_id: string
}

function paymentAmount(p: PaymentRow): number {
  return Number(p.amount || Number(p.rent_amount || 0) + Number(p.water_fee || 0))
}

function dayDiff(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

export const cobranzaRunner: AgentRunner = {
  agentId: 'cobranza',

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const supabase = createServiceClient()
    const dryRun = ctx.input.dry_run !== false // por defecto dry-run
    const canSend = !dryRun && whatsAppConfigured()
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const horizon = new Date(today.getTime() + REMINDER_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10)

    // 1. Pagos sin confirmar con vencimiento hasta REMINDER_DAYS en el futuro:
    //    cubre tanto vencidos (mora) como próximos a vencer (recordatorio).
    const { data: payments, error: pErr } = await supabase
      .from('payments')
      .select('id, contract_id, due_date, amount, rent_amount, water_fee, status, confirmed_at, org_id')
      .eq('org_id', ctx.orgId)
      .is('confirmed_at', null)
      .neq('status', 'paid')
      .lte('due_date', horizon)
      .limit(1000)

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

    const rows = (payments || []) as PaymentRow[]
    if (rows.length === 0) {
      await ctx.recordAction({
        action_type: 'cobranza.scan_complete',
        status: 'ok',
        result: { pending_count: 0 },
      })
      return {
        output: { message: 'no pending payments', pending_count: 0 },
        metrics: { actions_total: 1, actions_ok: 1, actions_failed: 0 },
      }
    }

    // 2. Agrupar por contrato
    const byContract = new Map<string, PaymentRow[]>()
    for (const p of rows) {
      if (!p.contract_id) continue
      const arr = byContract.get(p.contract_id) || []
      arr.push(p)
      byContract.set(p.contract_id, arr)
    }
    const contractIds = Array.from(byContract.keys())

    const { data: cRows } = await supabase
      .from('contracts')
      .select('id, unit_id, occupant_id, org_id')
      .in('id', contractIds.length ? contractIds : ['00000000-0000-0000-0000-000000000000'])
    const contracts = (cRows || []) as ContractRow[]

    // 3. Resolver inquilinos (nombre + teléfono) y unidades (número)
    const occupantIds = contracts.map((c) => c.occupant_id).filter(Boolean) as string[]
    const unitIds = contracts.map((c) => c.unit_id).filter(Boolean) as string[]

    const occupantsMap = new Map<string, { name: string; phone: string | null }>()
    if (occupantIds.length) {
      const { data } = await supabase
        .from('occupants')
        .select('id, name, phone')
        .in('id', occupantIds)
      for (const o of data || []) {
        occupantsMap.set(o.id as string, { name: (o.name as string) || 'inquilino', phone: (o.phone as string) || null })
      }
    }
    const unitsMap = new Map<string, string>()
    if (unitIds.length) {
      const { data } = await supabase.from('units').select('id, number').in('id', unitIds)
      for (const u of data || []) unitsMap.set(u.id as string, (u.number as string) || '—')
    }

    let actionsOk = 0
    let actionsFailed = 0
    let actionsSkipped = 0
    let sentCount = 0
    const escalations: Record<string, number> = { reminder: 0, warning: 0, critical: 0, legal: 0, abogado: 0 }

    for (const contract of contracts) {
      const cps = byContract.get(contract.id) || []
      if (cps.length === 0) continue
      const occupant = contract.occupant_id ? occupantsMap.get(contract.occupant_id) : undefined
      const unitNumber = contract.unit_id ? unitsMap.get(contract.unit_id) ?? '—' : '—'
      const name = occupant?.name ?? 'inquilino'
      const phone = occupant?.phone ?? null

      const overdue = cps.filter((p) => new Date(p.due_date) <= today)
      const upcoming = cps.filter((p) => new Date(p.due_date) > today)

      // ── Caso A: hay pagos vencidos → aplicar mora + aviso escalado ─────
      if (overdue.length > 0) {
        let totalDue = 0
        let worstLevel: MoraLevel = 'grace'
        let maxDays = 0

        for (const p of overdue) {
          const days = dayDiff(new Date(p.due_date), today)
          const base = paymentAmount(p)
          const { level, amount: fee } = calcMoraSurcharge(base, days)
          // Persistir el cargo (solo en modo real; dry-run no muta saldos).
          // Idempotente: cada corrida fija el cargo del nivel ACTUAL del pago,
          // no lo acumula día a día.
          if (!dryRun) {
            await supabase
              .from('payments')
              .update({
                late_fee_amount: fee,
                late_fee_level: level,
                late_fee_updated_at: new Date().toISOString(),
              })
              .eq('id', p.id)
          }
          totalDue += base + fee
          if (getMoraLevelOrder(level) < getMoraLevelOrder(worstLevel)) worstLevel = level
          if (days > maxDays) maxDays = days
        }

        // En gracia (1-5 días): no se molesta al inquilino todavía.
        if (worstLevel === 'grace') {
          await ctx.recordAction({
            action_type: 'cobranza.skip_grace',
            entity_type: 'contract',
            entity_id: contract.id,
            status: 'skipped',
            payload: { days_past_due: maxDays, level: worstLevel },
          })
          actionsSkipped++
          continue
        }

        escalations[worstLevel] = (escalations[worstLevel] || 0) + 1
        const message = buildDunningMessage({ name, unit: unitNumber, amount: totalDue, daysPastDue: maxDays, level: worstLevel })
        await dispatch({
          ctx, supabase, kind: 'dunning', contract, name, unitNumber,
          phone, message, canSend, daysPastDue: maxDays, level: worstLevel, totalDue,
          onSent: () => sentCount++,
          onResult: (ok) => (ok ? actionsOk++ : actionsFailed++),
        })
        continue
      }

      // ── Caso B: solo pagos próximos → recordatorio preventivo ─────────
      if (upcoming.length > 0) {
        const soonest = upcoming.reduce((acc, p) => (new Date(p.due_date) < new Date(acc.due_date) ? p : acc), upcoming[0])
        const daysUntil = -dayDiff(new Date(soonest.due_date), today)
        const amount = paymentAmount(soonest)
        const message = buildReminderMessage({ name, unit: unitNumber, amount, daysUntil })
        escalations.reminder++
        await dispatch({
          ctx, supabase, kind: 'reminder', contract, name, unitNumber,
          phone, message, canSend, daysPastDue: -daysUntil, level: 'reminder', totalDue: amount,
          onSent: () => sentCount++,
          onResult: (ok) => (ok ? actionsOk++ : actionsFailed++),
        })
      }
    }

    return {
      output: {
        pending_count: rows.length,
        contracts_processed: contracts.length,
        escalations,
        sent_count: sentCount,
        dry_run: dryRun,
        whatsapp_enabled: canSend,
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

// Envía (o registra en dry-run) una notificación de cobranza y la audita.
async function dispatch(args: {
  ctx: AgentRunContext
  supabase: ReturnType<typeof createServiceClient>
  kind: 'reminder' | 'dunning'
  contract: ContractRow
  name: string
  unitNumber: string
  phone: string | null
  message: string
  canSend: boolean
  daysPastDue: number
  level: string
  totalDue: number
  onSent: () => void
  onResult: (ok: boolean) => void
}): Promise<void> {
  const { ctx, supabase, kind, contract, name, unitNumber, phone, message, canSend, daysPastDue, level, totalDue } = args

  let sent = false
  let sendError: string | undefined
  if (canSend && phone) {
    const res = await sendWhatsAppText(phone, message)
    sent = res.ok
    sendError = res.error
    if (sent) args.onSent()
  }

  const status: 'ok' | 'skipped' | 'failed' = sent
    ? 'ok'
    : canSend && phone
      ? 'failed' // intentó enviar y falló
      : 'skipped' // dry-run o sin teléfono

  await ctx.recordAction({
    action_type: kind === 'reminder' ? 'cobranza.reminder' : 'cobranza.notify',
    entity_type: 'contract',
    entity_id: contract.id,
    status,
    payload: {
      channel: 'whatsapp',
      tenant_name: name,
      unit_number: unitNumber,
      has_phone: !!phone,
      days_past_due: daysPastDue,
      level,
      total_due: totalDue,
      sent,
    },
    result: sent
      ? { message: 'WhatsApp enviado', preview: message.slice(0, 120) }
      : { message: canSend ? (phone ? `envío falló: ${sendError}` : 'sin teléfono') : 'dry-run: no enviado', preview: message.slice(0, 120) },
    error: status === 'failed' ? sendError : undefined,
  })

  if (sent) {
    await supabase.from('audit_log').insert({
      org_id: contract.org_id,
      actor_type: 'agent',
      actor_id: 'cobranza',
      action: kind === 'reminder' ? 'cobranza.recordatorio_enviado' : 'mora.notificacion_enviada',
      entity_type: 'contract',
      entity_id: contract.id,
      metadata: { unit_number: unitNumber, tenant_name: name, days_past_due: daysPastDue, level, total_due: totalDue, run_id: ctx.runId },
    })
  }

  args.onResult(status !== 'failed')
}
