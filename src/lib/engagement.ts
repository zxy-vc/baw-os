// BaW OS — Cuenta combinada (engagement): estado de cuenta consolidado.
//
// Un engagement agrupa N contratos bajo un mismo pagador (spec
// people-crm-stays-model §6, p.ej. Natturaly Complements = D102+D202+D201).
// Este módulo deriva el saldo del POOL de los movimientos reales de cada
// contrato miembro — no hay "ajuste inicial": el historial manda (decisión
// Fran 2026-07-02). Reusa computeEstadoCuenta para que el consolidado cuadre
// exactamente con los estados de cuenta individuales.
//
// `computeEstadoCuentaCombinado` es PURA (sin I/O) → testeable.
// `getEstadoCuentaCombinadoData` hace el fetch a Supabase y arma el documento.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeEstadoCuenta,
  periodEndOf,
  type EstadoCuenta,
  type EstadoCuentaPayment,
} from '@/lib/estado-cuenta'

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface EngagementMemberInput {
  contractId: string
  unitNumber: string
  tenantName: string
  contractStatus: string
  payments: EstadoCuentaPayment[]
}

export interface EngagementMemberSummary {
  contractId: string
  unitNumber: string
  tenantName: string
  contractStatus: string
  saldoTotal: number
}

export interface EstadoCuentaCombinado {
  /** Consolidado del pool: movimientos de todos los contratos mezclados por
   *  fecha, con la unidad como prefijo del concepto. */
  data: EstadoCuenta
  /** Saldo individual de cada contrato miembro (mismo motor, mismo corte). */
  members: EngagementMemberSummary[]
}

export interface EstadoCuentaCombinadoDoc extends EstadoCuentaCombinado {
  engagementId: string
  engagementName: string
  payerName: string | null
  buildingName: string
  periodo: string
  folio: string
  emittedAt: string // ISO
}

// ── Núcleo puro ─────────────────────────────────────────────────────────────

/** Folio determinista del consolidado: EC-CC-<nombre-compacto>-<periodo>. */
export function folioCombinadoFor(engagementName: string, periodo: string): string {
  const compact = (engagementName || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 10) || 'POOL'
  return `EC-CC-${compact}-${periodo}`
}

/**
 * Consolida los estados de cuenta de los contratos miembros de un engagement.
 * El pool se calcula pasando TODOS los renglones (etiquetados con su unidad)
 * por el mismo motor que un contrato individual, así:
 *   saldo del pool === Σ saldos individuales (mismo corte, mismos criterios).
 */
export function computeEstadoCuentaCombinado(
  members: EngagementMemberInput[],
  periodo: string,
  corteISO?: string,
): EstadoCuentaCombinado {
  const corte = corteISO ?? periodEndOf(periodo)

  const merged: EstadoCuentaPayment[] = members.flatMap((m) =>
    m.payments.map((p) => ({ ...p, conceptPrefix: m.unitNumber })),
  )

  return {
    data: computeEstadoCuenta(merged, periodo, corte),
    members: members.map((m) => ({
      contractId: m.contractId,
      unitNumber: m.unitNumber,
      tenantName: m.tenantName,
      contractStatus: m.contractStatus,
      saldoTotal: computeEstadoCuenta(m.payments, periodo, corte).saldoTotal,
    })),
  }
}

// ── Capa de datos ───────────────────────────────────────────────────────────

const PAYMENT_COLUMNS =
  'id, contract_id, due_date, paid_date, amount, rent_amount, water_fee, amount_paid, late_fee_amount, late_fee_level, status, ancillary_charge_id, notes'

/**
 * Carga el engagement con sus contratos miembros y arma el documento
 * consolidado. Filtra SIEMPRE por el org_id dado (invariante multi-tenant):
 * el caller pasa el org del contexto autenticado.
 */
export async function getEstadoCuentaCombinadoData(
  supabase: SupabaseClient,
  orgId: string,
  engagementId: string,
  periodo: string,
): Promise<EstadoCuentaCombinadoDoc | null> {
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, org_id, name, payer_occupant_id, payer:occupants(name)')
    .eq('id', engagementId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!engagement) return null

  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, status, unit:units(number, building_id), occupant:occupants(name)')
    .eq('engagement_id', engagementId)
    .eq('org_id', orgId)
  const memberContracts = contracts || []
  if (memberContracts.length === 0) return null

  const corte = periodEndOf(periodo)
  const { data: payments } = await supabase
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .in('contract_id', memberContracts.map((c) => c.id))
    .eq('org_id', orgId)
    .lte('due_date', corte)
    .order('due_date', { ascending: true })

  const paymentsByContract = new Map<string, EstadoCuentaPayment[]>()
  for (const p of (payments || []) as Array<EstadoCuentaPayment & { contract_id: string }>) {
    const list = paymentsByContract.get(p.contract_id) || []
    list.push(p)
    paymentsByContract.set(p.contract_id, list)
  }

  const one = <T,>(v: unknown): T | null => (Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null))

  const members: EngagementMemberInput[] = memberContracts.map((c) => {
    const unit = one<{ number: string; building_id: string | null }>(c.unit)
    const occupant = one<{ name: string }>(c.occupant)
    return {
      contractId: c.id,
      unitNumber: unit?.number || '—',
      tenantName: occupant?.name || 'Sin inquilino',
      contractStatus: c.status,
      payments: paymentsByContract.get(c.id) || [],
    }
  })
  // Orden estable por unidad para que el documento sea reproducible.
  members.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber))

  let buildingName = 'Edificio'
  const firstUnit = one<{ building_id: string | null }>(memberContracts[0]?.unit)
  if (firstUnit?.building_id) {
    const { data: building } = await supabase
      .from('buildings')
      .select('name')
      .eq('id', firstUnit.building_id)
      .maybeSingle()
    if (building?.name) buildingName = building.name
  }

  const payer = one<{ name: string }>(engagement.payer)
  const combinado = computeEstadoCuentaCombinado(members, periodo, corte)

  return {
    ...combinado,
    engagementId: engagement.id,
    engagementName: engagement.name,
    payerName: payer?.name ?? null,
    buildingName,
    periodo,
    folio: folioCombinadoFor(engagement.name, periodo),
    emittedAt: new Date().toISOString(),
  }
}
