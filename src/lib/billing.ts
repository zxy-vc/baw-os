// BaW OS — Lógica de facturación compartida (fuente única de verdad).
//
// Cobros, Mission Control y Morosidad deben contar lo mismo. Antes Cobros
// proyectaba los adeudos desde el calendario del contrato, mientras el dashboard
// contaba solo filas de pago materializadas (y subcontaba). Esta librería pura
// centraliza el cálculo: dado un contrato y un mes, ¿cuál es su estatus y cuánto
// se debe? Sin React ni DB.

export type BillingStatus = 'pagado' | 'parcial' | 'pendiente' | 'vencido' | 'mora' | 'verbal' | 'anulado'

export const MAX_MONTHS_BACK = 24

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Meses 'YYYY-MM' desde el inicio (o billing_start) hasta el mes de corte
 * (inclusive), acotado a los últimos MAX_MONTHS_BACK meses.
 */
export function scheduleMonths(startISO: string | null, cutoff: string): string[] {
  const [cy, cm] = cutoff.split('-').map(Number)
  let y: number
  let m: number
  if (startISO) {
    // Derivar el mes del string 'YYYY-MM-DD' para no desfasar por zona horaria.
    const [sy, sm] = startISO.slice(0, 7).split('-').map(Number)
    y = sy
    m = sm
  } else {
    y = cy
    m = cm
  }
  const out: string[] = []
  while (y < cy || (y === cy && m <= cm)) {
    out.push(`${y}-${pad2(m)}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out.slice(-MAX_MONTHS_BACK)
}

/**
 * Cargo anulado por el punto de corte de BAW-18 (nunca se borra). Solo existe en el
 * ENUM payment_status tras la migración 20261015010000; por eso se filtra en JS y no
 * en PostgREST (un filtro con una etiqueta inexistente truena la consulta).
 */
export const VOID_PAYMENT_STATUS = 'void'

export function isVoidCharge(status: string | null | undefined): boolean {
  return status === VOID_PAYMENT_STATUS
}

/** ¿Cobranza debe perseguir este cargo? Ni los pagados ni los anulados. */
export function isCollectibleCharge(status: string | null | undefined): boolean {
  return status !== 'paid' && !isVoidCharge(status)
}

/**
 * Rank para elegir el pago representativo de un mes (paid > partial > otros >
 * anulado): un cargo vivo del mismo mes siempre gana a uno anulado.
 */
export function rankPayment(status: string): number {
  if (status === 'paid') return 3
  if (status === 'partial') return 2
  if (isVoidCharge(status)) return 0
  return 1
}

export type MonthStatusInput = {
  monthlyAmount: number
  paymentDay: number | null
  dueDate: string // 'YYYY-MM-DD'
  waterFee: number
  payment: { status: string; amount: number | null; amount_paid: number | null; late_fee_amount: number | null } | null
  today: Date
}

export type MonthStatusResult = {
  status: BillingStatus
  moraAmount: number
  remaining: number // saldo vivo en pagos parciales
  owed: number // lo que se adeuda hoy (morosidad): vencido/mora = base+mora, parcial = saldo, resto = 0
}

/** Estatus y adeudo de UN mes de UN contrato. Misma lógica que usa la tabla de Cobros. */
export function computeMonthStatus(i: MonthStatusInput): MonthStatusResult {
  const base = i.payment?.amount ?? i.monthlyAmount + i.waterFee
  const fee = Number(i.payment?.late_fee_amount || 0)
  const paid = Number(i.payment?.amount_paid || 0)
  const hasCollection = i.payment != null && (i.payment.status === 'paid' || i.payment.status === 'partial')
  const todayMid = new Date(i.today.getFullYear(), i.today.getMonth(), i.today.getDate())

  // Mes anulado (BAW-18): el cargo existe para la auditoría, pero no se cobra.
  if (i.payment != null && isVoidCharge(i.payment.status)) {
    return { status: 'anulado', moraAmount: 0, remaining: 0, owed: 0 }
  }
  if (hasCollection) {
    const remaining = Math.max(0, base + fee - paid)
    return { status: remaining > 0.001 ? 'parcial' : 'pagado', moraAmount: 0, remaining, owed: remaining }
  }
  if (!i.paymentDay) {
    return { status: 'verbal', moraAmount: 0, remaining: 0, owed: 0 }
  }
  const due = new Date(`${i.dueDate}T00:00:00`)
  if (todayMid < due) {
    return { status: 'pendiente', moraAmount: 0, remaining: 0, owed: 0 }
  }
  // El recargo es un hecho contable persistido por el cron diario. La UI no lo
  // proyecta: así nunca muestra un saldo distinto al guardado en payments.
  if (fee > 0) {
    return { status: 'mora', moraAmount: fee, remaining: 0, owed: base + fee }
  }
  return { status: 'vencido', moraAmount: 0, remaining: 0, owed: base }
}
