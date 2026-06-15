// BaW OS — Agente Renovaciones (Bloque 2: ciclo de vida del contrato).
// Detecta contratos que vencen pronto o que ya vencieron sin renovar y los pasa a
// 'en_renovacion', SIN cortar la facturación (decisión de Fran 2026-06-15: cubre la
// tácita reconducción — el inquilino que sigue viviendo se mantiene cobrado).
// Nunca pone 'expired' solo (eso detiene la renta mensual y es decisión humana).
//
// Gate: igual que cobranza. En dry-run no muta estado ni envía WhatsApp; solo
// registra en audit lo que HARÍA. En modo real (COBRANZA_WHATSAPP_ENABLED='true')
// hace el flip de estado y manda el aviso de renovación al inquilino.

import { createServiceClient } from '@/lib/api-auth'
import { sendWhatsAppText, whatsAppConfigured, buildRenewalMessage } from '@/lib/whatsapp'
import type { AgentRunContext, AgentRunResult, AgentRunner } from './types'

const RENEWAL_WINDOW_DAYS = 30 // marca en_renovacion desde 30 días antes del vencimiento

interface ContractRow {
  id: string
  unit_id: string | null
  occupant_id: string | null
  org_id: string
  end_date: string | null
  status: string | null
}

function dayDiff(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

export const renovacionesRunner: AgentRunner = {
  agentId: 'renovaciones',

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const supabase = createServiceClient()
    const dryRun = ctx.input.dry_run !== false
    const canSend = !dryRun && whatsAppConfigured()
    const today = new Date()
    const horizon = new Date(today.getTime() + RENEWAL_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10)

    // Contratos activos con fin de vigencia hasta el horizonte (incluye ya vencidos).
    const { data: cRows, error } = await supabase
      .from('contracts')
      .select('id, unit_id, occupant_id, org_id, end_date, status')
      .eq('org_id', ctx.orgId)
      .eq('status', 'active')
      .not('end_date', 'is', null)
      .lte('end_date', horizon)
      .limit(1000)

    if (error) {
      await ctx.recordAction({ action_type: 'renovaciones.fetch', status: 'failed', error: error.message })
      return { output: { error: 'fetch_failed' }, metrics: { actions_total: 1, actions_ok: 0, actions_failed: 1 } }
    }

    const contracts = (cRows || []) as ContractRow[]
    if (contracts.length === 0) {
      await ctx.recordAction({ action_type: 'renovaciones.scan_complete', status: 'ok', result: { due_count: 0 } })
      return { output: { message: 'no contracts due for renewal', due_count: 0 }, metrics: { actions_total: 1, actions_ok: 1, actions_failed: 0 } }
    }

    // Resolver inquilinos y unidades para el aviso.
    const occupantIds = contracts.map((c) => c.occupant_id).filter(Boolean) as string[]
    const unitIds = contracts.map((c) => c.unit_id).filter(Boolean) as string[]
    const occupantsMap = new Map<string, { name: string; phone: string | null }>()
    if (occupantIds.length) {
      const { data } = await supabase.from('occupants').select('id, name, phone').in('id', occupantIds)
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
    let sentCount = 0
    let flippedCount = 0

    for (const contract of contracts) {
      if (!contract.end_date) continue
      const occupant = contract.occupant_id ? occupantsMap.get(contract.occupant_id) : undefined
      const unitNumber = contract.unit_id ? unitsMap.get(contract.unit_id) ?? '—' : '—'
      const name = occupant?.name ?? 'inquilino'
      const phone = occupant?.phone ?? null
      const daysUntil = -dayDiff(today, new Date(contract.end_date))
      const expired = daysUntil < 0

      // 1. Flip de estado a en_renovacion (solo en modo real). Mantiene la facturación.
      if (!dryRun) {
        const { error: upErr } = await supabase
          .from('contracts')
          .update({ status: 'en_renovacion' })
          .eq('id', contract.id)
        if (upErr) {
          await ctx.recordAction({
            action_type: 'renovaciones.flip_status',
            entity_type: 'contract',
            entity_id: contract.id,
            status: 'failed',
            error: upErr.message,
          })
          actionsFailed++
          continue
        }
        flippedCount++
      }

      // 2. Aviso de renovación al inquilino (gated; no rompe si falta teléfono).
      let sent = false
      if (canSend && phone) {
        const message = buildRenewalMessage({ name, unit: unitNumber, endDate: contract.end_date, daysUntil })
        const res = await sendWhatsAppText(phone, message)
        sent = res.ok
        if (res.ok) sentCount++
      }

      await ctx.recordAction({
        action_type: 'renovaciones.flag',
        entity_type: 'contract',
        entity_id: contract.id,
        status: 'ok',
        payload: { end_date: contract.end_date, days_until: daysUntil, expired, dry_run: dryRun },
        result: { flipped: !dryRun, notified: sent },
      })
      actionsOk++
    }

    return {
      output: {
        message: dryRun ? 'dry-run: no se mutó estado ni se envió' : 'renovaciones procesadas',
        due_count: contracts.length,
        flipped: flippedCount,
        notified: sentCount,
      },
      metrics: { actions_total: actionsOk + actionsFailed, actions_ok: actionsOk, actions_failed: actionsFailed },
    }
  },
}
