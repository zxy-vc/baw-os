// BaW OS — Cálculo del estado de cuenta del propietario (ADR-022 §3.2)
//
// Lógica PURA (sin React ni DB), estilo billing.ts: los endpoints de
// /api/liquidaciones juntan los datos y esta función produce los totales que
// se persisten en owner_statements. Extraída y evolucionada del endpoint
// legacy por token (api/owner/[token]) — la diferencia clave es que la
// comisión ya no es 10% fijo: viene de management_agreements (base 10%,
// personalizable por edificio/propietario — decisión de Fran 2026-07-04).

export type FeeType = 'percent_collected' | 'percent_billed' | 'flat_monthly'

export interface AgreementTerms {
  feeType: FeeType
  feeValue: number
  /** 'default' = no hay acuerdo en DB y se usó el 10% base */
  source: 'agreement' | 'default'
  agreementId?: string
}

export const DEFAULT_AGREEMENT: AgreementTerms = {
  feeType: 'percent_collected',
  feeValue: 10,
  source: 'default',
}

/** Línea por unidad del edificio en el mes. Montos ya agregados por unidad. */
export interface UnitLine {
  unitId: string
  unitNumber: string
  tenantName: string | null
  /** Renta facturable del mes (contrato activo; 0 si vacante) */
  expected: number
  /** Cobrado real del mes (abonos + pagos directos sin abonos) */
  collected: number
  /** Gastos capturados a esta unidad en el mes */
  unitExpenses: number
  /** Prorrateo de gastos generales que le toca a esta unidad */
  generalShare: number
  /** Costo de incidencias del mes en esta unidad */
  maintenance: number
}

export interface StatementTotals {
  grossExpected: number
  grossCollected: number
  adminFee: number
  expenses: number
  maintenance: number
  /** Neto del edificio completo (antes del % de propiedad) */
  buildingNet: number
  /** Neto que le corresponde a este propietario (× ownership %) */
  netPayout: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function computeAdminFee(
  terms: AgreementTerms,
  grossCollected: number,
  grossExpected: number,
): number {
  switch (terms.feeType) {
    case 'percent_collected':
      return round2((grossCollected * terms.feeValue) / 100)
    case 'percent_billed':
      return round2((grossExpected * terms.feeValue) / 100)
    case 'flat_monthly':
      return round2(terms.feeValue)
  }
}

/**
 * Totales del statement de un (edificio × propietario × mes).
 * La comisión y los costos se calculan sobre el edificio completo y el neto
 * se reparte por ownership % (decisión abierta §6.2-3 del ADR: una fila por
 * propietario × edificio × mes).
 */
export function computeStatement(
  lines: UnitLine[],
  terms: AgreementTerms,
  ownershipPct: number,
): StatementTotals {
  const grossExpected = round2(lines.reduce((s, l) => s + l.expected, 0))
  const grossCollected = round2(lines.reduce((s, l) => s + l.collected, 0))
  const expenses = round2(
    lines.reduce((s, l) => s + l.unitExpenses + l.generalShare, 0),
  )
  const maintenance = round2(lines.reduce((s, l) => s + l.maintenance, 0))
  const adminFee = computeAdminFee(terms, grossCollected, grossExpected)
  const buildingNet = round2(grossCollected - adminFee - expenses - maintenance)
  const netPayout = round2((buildingNet * ownershipPct) / 100)
  return {
    grossExpected,
    grossCollected,
    adminFee,
    expenses,
    maintenance,
    buildingNet,
    netPayout,
  }
}

/**
 * Resuelve el acuerdo vigente para (building, owner) en un periodo dado a
 * partir de las filas de management_agreements de la org. Preferencia:
 * acuerdo específico del propietario > acuerdo genérico del edificio; a
 * igualdad, el de effective_from más reciente. Sin acuerdo → 10% base.
 */
export interface AgreementRow {
  id: string
  building_id: string
  owner_id: string | null
  fee_type: FeeType
  fee_value: number
  effective_from: string
  effective_to: string | null
}

export function resolveAgreement(
  rows: AgreementRow[],
  buildingId: string,
  ownerId: string,
  period: string, // 'YYYY-MM'
): AgreementTerms {
  const monthStart = `${period}-01`
  const candidates = rows.filter(
    (r) =>
      r.building_id === buildingId &&
      (r.owner_id === null || r.owner_id === ownerId) &&
      r.effective_from <= `${period}-31` &&
      (r.effective_to === null || r.effective_to >= monthStart),
  )
  if (candidates.length === 0) return DEFAULT_AGREEMENT
  candidates.sort((a, b) => {
    // Específico del owner gana sobre genérico del edificio
    const aSpecific = a.owner_id ? 1 : 0
    const bSpecific = b.owner_id ? 1 : 0
    if (aSpecific !== bSpecific) return bSpecific - aSpecific
    return b.effective_from.localeCompare(a.effective_from)
  })
  const win = candidates[0]
  return {
    feeType: win.fee_type,
    feeValue: Number(win.fee_value),
    source: 'agreement',
    agreementId: win.id,
  }
}

/** Rango [inicio, fin] (inclusive) de un periodo 'YYYY-MM'. */
export function periodRange(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number)
  const start = `${period}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${period}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}
