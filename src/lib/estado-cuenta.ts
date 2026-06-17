// BaW OS — Motor de Estado de Cuenta por inquilino (Bloque 1: cobranza).
//
// Agrega los renglones de `payments` de un contrato en un estado de cuenta:
// saldo anterior, cargos del periodo, pagos recibidos (incluye parciales),
// recargos por mora y saldo total, más un ledger de movimientos y la
// antigüedad del saldo (aging). Reusa los mismos criterios que el runner de
// cobranza (`paymentAmount`, `dayDiff`, recargos persistidos en
// `late_fee_amount`) para que el documento cuadre con lo que el sistema cobra.
//
// La función `computeEstadoCuenta` es PURA (sin I/O) → testeable.
// `getEstadoCuentaData` hace el fetch a Supabase y arma el header.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MoraLevel } from '@/lib/mora-engine'

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface EstadoCuentaPayment {
  id: string
  due_date: string
  paid_date?: string | null
  amount?: number | null
  rent_amount?: number | null
  water_fee?: number | null
  amount_paid?: number | null
  late_fee_amount?: number | null
  late_fee_level?: string | null
  status: string
  ancillary_charge_id?: string | null
  notes?: string | null
}

export type MovimientoKind =
  | 'opening'
  | 'rent'
  | 'ancillary'
  | 'late_fee'
  | 'payment'

export interface Movimiento {
  date: string // YYYY-MM-DD
  concept: string
  charge: number // cargo (0 si es abono)
  credit: number // abono (0 si es cargo)
  balance: number // saldo corriente tras el movimiento
  kind: MovimientoKind
  daysLate?: number
  level?: MoraLevel
  partial?: boolean
}

export interface AgingBuckets {
  corriente: number // aún no vence (due_date > corte)
  d1_15: number
  d16_30: number
  d31_plus: number
}

export interface EstadoCuenta {
  periodo: string // 'YYYY-MM'
  periodStart: string // 'YYYY-MM-01'
  corte: string // 'YYYY-MM-DD' (fin de periodo)
  saldoAnterior: number
  cargosPeriodo: number
  pagosRecibidos: number
  recargos: number
  saldoTotal: number
  diasAtrasoMax: number
  movimientos: Movimiento[]
  aging: AgingBuckets
}

export interface EstadoCuentaHeader {
  buildingName: string
  buildingAddress?: string | null
  tenantName: string
  tenantPhone?: string | null
  unitNumber: string
  contractId: string
  folio: string
}

export interface EstadoCuentaDoc extends EstadoCuentaHeader {
  data: EstadoCuenta
  emittedAt: string // ISO
}

// ── Helpers (mismos criterios que cobranza.ts) ──────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Monto base del renglón (renta = amount, o rent_amount + water_fee). */
export function paymentAmount(p: EstadoCuentaPayment): number {
  return Number(p.amount || Number(p.rent_amount || 0) + Number(p.water_fee || 0))
}

function dayDiff(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

/** Primer día del mes del periodo 'YYYY-MM'. */
function periodStartOf(periodo: string): string {
  return `${periodo}-01`
}

/** Último día del mes del periodo 'YYYY-MM' como 'YYYY-MM-DD'. */
function periodEndOf(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${periodo}-${String(last).padStart(2, '0')}`
}

function conceptFor(p: EstadoCuentaPayment): string {
  if (p.ancillary_charge_id) return p.notes || 'Cargo accesorio'
  const hasWater = Number(p.water_fee || 0) > 0
  if (Number(p.rent_amount || 0) > 0 && hasWater) return 'Renta + servicios'
  if (hasWater && !Number(p.rent_amount || 0)) return 'Servicios'
  return 'Renta mensual'
}

// ── Núcleo: agregación pura ─────────────────────────────────────────────────

/**
 * Construye el estado de cuenta de un contrato a partir de sus renglones de
 * pago, para el periodo dado. `corte` (default: fin del periodo) marca la fecha
 * con la que se calcula la antigüedad del saldo.
 *
 * Cada renglón se atribuye a su periodo por `due_date`, lo que hace que el
 * resumen cuadre exactamente:
 *   saldoTotal = saldoAnterior + cargosPeriodo + recargos − pagosRecibidos
 */
export function computeEstadoCuenta(
  payments: EstadoCuentaPayment[],
  periodo: string,
  corteISO?: string,
): EstadoCuenta {
  const periodStart = periodStartOf(periodo)
  const corte = corteISO ?? periodEndOf(periodo)
  const corteDate = new Date(corte)

  // Solo renglones con due_date <= corte entran al documento.
  const rows = payments
    .filter((p) => p.due_date <= corte)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))

  let saldoAnterior = 0
  let cargosPeriodo = 0
  let pagosRecibidos = 0
  let recargos = 0
  let diasAtrasoMax = 0

  const aging: AgingBuckets = { corriente: 0, d1_15: 0, d16_30: 0, d31_plus: 0 }
  const movimientos: Movimiento[] = []

  // Saldo anterior: neto pendiente de renglones previos al periodo.
  for (const p of rows) {
    if (p.due_date >= periodStart) continue
    const base = paymentAmount(p)
    const fee = Number(p.late_fee_amount || 0)
    const paid = Number(p.amount_paid || 0)
    saldoAnterior += base + fee - paid
  }
  saldoAnterior = round2(saldoAnterior)

  // Ledger: arranca en el saldo anterior y aplica los movimientos del periodo.
  let balance = saldoAnterior
  if (saldoAnterior !== 0) {
    movimientos.push({
      date: periodStart,
      concept: 'Saldo anterior',
      charge: 0,
      credit: 0,
      balance,
      kind: 'opening',
    })
  }

  for (const p of rows) {
    if (p.due_date < periodStart) continue // ya contabilizado en saldoAnterior

    const base = paymentAmount(p)
    const fee = Number(p.late_fee_amount || 0)
    const paid = Number(p.amount_paid || 0)

    cargosPeriodo += base
    recargos += fee
    pagosRecibidos += paid

    // Cargo (renta / accesorio).
    balance = round2(balance + base)
    movimientos.push({
      date: p.due_date,
      concept: conceptFor(p),
      charge: base,
      credit: 0,
      balance,
      kind: p.ancillary_charge_id ? 'ancillary' : 'rent',
    })

    // Abono (pago, incluye parciales).
    if (paid > 0) {
      balance = round2(balance - paid)
      const partial = paid + 0.001 < base + fee
      movimientos.push({
        date: p.paid_date || p.due_date,
        concept: partial ? 'Pago recibido (parcial)' : 'Pago recibido',
        charge: 0,
        credit: paid,
        balance,
        kind: 'payment',
        partial,
      })
    }

    // Recargo por mora.
    if (fee > 0) {
      const days = dayDiff(new Date(p.due_date), corteDate)
      balance = round2(balance + fee)
      movimientos.push({
        date: p.due_date,
        concept: `Recargo por mora — ${days} días`,
        charge: fee,
        credit: 0,
        balance,
        kind: 'late_fee',
        daysLate: days,
        level: (p.late_fee_level as MoraLevel) || undefined,
      })
    }
  }

  // Antigüedad del saldo: neto pendiente de cada renglón clasificado por días.
  for (const p of rows) {
    const base = paymentAmount(p)
    const fee = Number(p.late_fee_amount || 0)
    const paid = Number(p.amount_paid || 0)
    const net = round2(base + fee - paid)
    if (net <= 0) continue

    const days = dayDiff(new Date(p.due_date), corteDate)
    if (days > diasAtrasoMax) diasAtrasoMax = days
    if (days <= 0) aging.corriente += net
    else if (days <= 15) aging.d1_15 += net
    else if (days <= 30) aging.d16_30 += net
    else aging.d31_plus += net
  }

  const saldoTotal = round2(saldoAnterior + cargosPeriodo + recargos - pagosRecibidos)

  return {
    periodo,
    periodStart,
    corte,
    saldoAnterior,
    cargosPeriodo: round2(cargosPeriodo),
    pagosRecibidos: round2(pagosRecibidos),
    recargos: round2(recargos),
    saldoTotal,
    diasAtrasoMax: Math.max(0, diasAtrasoMax),
    movimientos,
    aging: {
      corriente: round2(aging.corriente),
      d1_15: round2(aging.d1_15),
      d16_30: round2(aging.d16_30),
      d31_plus: round2(aging.d31_plus),
    },
  }
}

// ── Capa de datos ───────────────────────────────────────────────────────────

/** Folio determinista por contrato + periodo (no se persiste). */
export function folioFor(contractId: string, periodo: string): string {
  const short = contractId.replace(/-/g, '').slice(0, 4).toUpperCase()
  return `EC-${periodo}-${short}`
}

/**
 * Carga datos reales y arma el documento. Filtra SIEMPRE por org_id del
 * contrato (invariante multi-tenant). Usa un client con permiso de lectura
 * sobre las tablas (server/service).
 */
export async function getEstadoCuentaData(
  supabase: SupabaseClient,
  contractId: string,
  periodo: string,
): Promise<EstadoCuentaDoc | null> {
  const { data: contract } = await supabase
    .from('contracts')
    .select('id, org_id, occupant_id, unit_id')
    .eq('id', contractId)
    .maybeSingle()
  if (!contract) return null

  const corte = periodEndOf(periodo)

  const [{ data: occupant }, { data: unit }, { data: payments }] = await Promise.all([
    contract.occupant_id
      ? supabase.from('occupants').select('name, phone').eq('id', contract.occupant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    contract.unit_id
      ? supabase.from('units').select('number, building_id').eq('id', contract.unit_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('payments')
      .select(
        'id, due_date, paid_date, amount, rent_amount, water_fee, amount_paid, late_fee_amount, late_fee_level, status, ancillary_charge_id, notes',
      )
      .eq('contract_id', contractId)
      .eq('org_id', contract.org_id)
      .lte('due_date', corte)
      .order('due_date', { ascending: true }),
  ])

  let buildingName = 'Edificio'
  let buildingAddress: string | null = null
  if (unit?.building_id) {
    const { data: building } = await supabase
      .from('buildings')
      .select('name, address')
      .eq('id', unit.building_id)
      .maybeSingle()
    if (building?.name) buildingName = building.name
    buildingAddress = (building?.address as string) || null
  }

  const data = computeEstadoCuenta((payments as EstadoCuentaPayment[]) || [], periodo, corte)

  return {
    buildingName,
    buildingAddress,
    tenantName: (occupant?.name as string) || 'Inquilino',
    tenantPhone: (occupant?.phone as string) || null,
    unitNumber: (unit?.number as string) || '—',
    contractId,
    folio: folioFor(contractId, periodo),
    data,
    emittedAt: new Date().toISOString(),
  }
}
