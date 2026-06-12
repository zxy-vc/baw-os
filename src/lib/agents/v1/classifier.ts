// BaW OS — Action classifier (Fase 2 + Fase 4)
// Resuelve la clasificación AUTO / LOG / REQUIRE_APPROVAL de una acción para
// un (org, agent, action_type). Combina:
//   1. Default por action_type (tabla canónica DEFAULT_ACTION_CLASSIFICATION)
//   2. agent_policies.per_action override (Fase 4)
//   3. agent_policies.autonomy_level (Fase 4)
//
// Contrato: ver docs/AGENT_INTEGRATION.md "Clasificación AUTO/LOG/REQUIRE_APPROVAL"

import { createServiceClient } from '@/lib/supabase'

export type Classification = 'AUTO' | 'LOG' | 'REQUIRE_APPROVAL' | 'DISABLED'

/**
 * Tabla canónica de clasificación por acción.
 * Si una action no aparece, default es REQUIRE_APPROVAL (conservador).
 */
export const DEFAULT_ACTION_CLASSIFICATION: Record<string, Classification> = {
  // Read
  'unit.read': 'LOG',
  'reservation.read': 'LOG',
  'payment.read': 'LOG',
  'contract.read': 'LOG',
  'incident.read': 'LOG',
  'task.read': 'LOG',
  'run.read': 'LOG',
  'insight.read': 'LOG',

  // Unit writes
  'unit.create': 'REQUIRE_APPROVAL',
  'unit.update_metadata': 'AUTO',
  'unit.update_status': 'REQUIRE_APPROVAL',
  'unit.update_pricing': 'REQUIRE_APPROVAL',

  // Reservation writes
  'reservation.create': 'REQUIRE_APPROVAL',
  'reservation.cancel': 'REQUIRE_APPROVAL',

  // Payments
  // payment.record = registrar un pago YA recibido (efectivo/transferencia).
  //   Es contabilidad reversible, NO cobra una tarjeta → baseline approval,
  //   pero si Fran lo pide directo (trigger=human) se ejecuta.
  // payment.charge/refund = movimiento de dinero externo (Stripe) → lock duro.
  'payment.record': 'REQUIRE_APPROVAL',
  'payment.charge': 'REQUIRE_APPROVAL',
  'payment.refund': 'REQUIRE_APPROVAL',

  // Occupants / inquilinos (registro interno reversible)
  'occupant.create': 'REQUIRE_APPROVAL',
  'occupant.update': 'REQUIRE_APPROVAL',

  // Incidents
  'incident.create': 'AUTO',
  'incident.update_status': 'AUTO',
  'incident.assign': 'AUTO',
  'incident.resolve': 'LOG',

  // Tasks
  'task.create': 'AUTO',
  'task.update': 'AUTO',
  'task.assign': 'AUTO',
  'task.complete': 'LOG',

  // Messages
  'message.send_to_tenant': 'REQUIRE_APPROVAL',
  'message.send_internal': 'LOG',

  // Contracts
  // contract.create/update = crear/editar el REGISTRO del contrato en la DB
  //   (reversible) → baseline approval, ejecuta si Fran lo pide directo.
  // contract.sign/terminate = firma e-firma / terminación legal → lock duro.
  'contract.draft': 'AUTO',
  'contract.create': 'REQUIRE_APPROVAL',
  'contract.update': 'REQUIRE_APPROVAL',
  'contract.sign': 'REQUIRE_APPROVAL',
  'contract.terminate': 'REQUIRE_APPROVAL',

  // Fiscal — cero margen
  'cfdi.emit': 'REQUIRE_APPROVAL',

  // Agents
  'agent.run': 'LOG',
  'policy.modify': 'REQUIRE_APPROVAL',
}

/**
 * Mapeo autonomy_level → ajuste sobre el default de la acción.
 *
 * - L0 disabled    → DISABLED (siempre)
 * - L1 suggest only→ todo write se eleva a REQUIRE_APPROVAL; reads quedan igual
 * - L2 approve each→ se respeta el default
 * - L3 approve batch→ default que sea REQUIRE_APPROVAL puede degradarse a AUTO
 *                    SI el per_action override lo permite (no auto-degradamos sin override)
 * - L4 full auto   → REQUIRE_APPROVAL → AUTO automático, excepto irreversibles externos
 */
const IRREVERSIBLE_EXTERNAL = new Set([
  'payment.charge',
  'payment.refund',
  'cfdi.emit',
  'contract.sign',
  'contract.terminate',
  'policy.modify',
])

/**
 * Origen del disparo de una acción.
 * - 'human': Fran lo pidió directamente (p.ej. comando en Discord). Modelo de
 *   Fran: "lo que yo le pida, lo ejecuta". Las acciones reversibles se degradan
 *   a AUTO.
 * - 'auto': la acción la detonó un trigger externo/autónomo (cron, webhook, la
 *   propia lógica del agente). Modelo de Fran: "pide una autorización breve",
 *   salvo whitelist (per_action override).
 * Default conservador: 'auto'.
 */
export type TriggerSource = 'human' | 'auto'

export interface ResolvedClassification {
  classification: Classification
  source:
    | 'default'
    | 'per_action_override'
    | 'autonomy_adjusted'
    | 'irreversible_lock'
    | 'human_initiated'
  autonomyLevel: number
}

export async function resolveActionClassification(
  orgId: string,
  agentId: string,
  actionType: string,
  triggerSource: TriggerSource = 'auto'
): Promise<ResolvedClassification> {
  const resolved = await resolveBaseClassification(orgId, agentId, actionType)

  // Modelo de autonomía de Fran (por origen del disparo): si la acción la pidió
  // Fran directamente y NO es un irreversible externo, se ejecuta sin aprobación.
  // Los irreversibles externos (Stripe, CFDI, firma) conservan su guardrail.
  if (
    triggerSource === 'human' &&
    resolved.classification === 'REQUIRE_APPROVAL' &&
    !IRREVERSIBLE_EXTERNAL.has(actionType)
  ) {
    return {
      classification: 'AUTO',
      source: 'human_initiated',
      autonomyLevel: resolved.autonomyLevel,
    }
  }

  return resolved
}

async function resolveBaseClassification(
  orgId: string,
  agentId: string,
  actionType: string
): Promise<ResolvedClassification> {
  const baseDefault: Classification =
    DEFAULT_ACTION_CLASSIFICATION[actionType] ?? 'REQUIRE_APPROVAL'

  const supabase = createServiceClient()
  const { data: policy } = await supabase
    .from('agent_policies')
    .select('autonomy_level, per_action, active')
    .eq('org_id', orgId)
    .eq('agent_id', agentId)
    .maybeSingle()

  const autonomyLevel = (policy?.autonomy_level as number | undefined) ?? 1
  const isActive = policy?.active !== false
  const perAction = (policy?.per_action as Record<string, Classification> | null) || {}

  // Si la policy está inactiva, comportamiento más conservador: siempre approval
  if (!isActive) {
    return {
      classification: baseDefault === 'LOG' ? 'LOG' : 'REQUIRE_APPROVAL',
      source: 'default',
      autonomyLevel,
    }
  }

  // L0 disabled
  if (autonomyLevel === 0) {
    return { classification: 'DISABLED', source: 'autonomy_adjusted', autonomyLevel }
  }

  // Override explícito gana sobre todo (excepto irreversibles externos)
  if (perAction[actionType]) {
    const override = perAction[actionType]
    if (
      IRREVERSIBLE_EXTERNAL.has(actionType) &&
      override !== 'REQUIRE_APPROVAL'
    ) {
      // Locked: no se puede bajar el guardrail de irreversibles externos
      return {
        classification: 'REQUIRE_APPROVAL',
        source: 'irreversible_lock',
        autonomyLevel,
      }
    }
    return {
      classification: override,
      source: 'per_action_override',
      autonomyLevel,
    }
  }

  // Sin override: ajuste por autonomy_level
  const isRead = baseDefault === 'LOG' && actionType.endsWith('.read')

  // L1: todo write → REQUIRE_APPROVAL
  if (autonomyLevel === 1 && !isRead && baseDefault === 'AUTO') {
    return {
      classification: 'REQUIRE_APPROVAL',
      source: 'autonomy_adjusted',
      autonomyLevel,
    }
  }

  // L4: REQUIRE_APPROVAL → AUTO, excepto irreversibles externos
  if (autonomyLevel === 4 && baseDefault === 'REQUIRE_APPROVAL') {
    if (IRREVERSIBLE_EXTERNAL.has(actionType)) {
      return {
        classification: 'REQUIRE_APPROVAL',
        source: 'irreversible_lock',
        autonomyLevel,
      }
    }
    return { classification: 'AUTO', source: 'autonomy_adjusted', autonomyLevel }
  }

  // L2/L3 sin override: respeta default
  return { classification: baseDefault, source: 'default', autonomyLevel }
}
