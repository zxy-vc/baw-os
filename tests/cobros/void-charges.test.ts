import { describe, expect, it } from 'vitest'
import { computeMonthStatus, isCollectibleCharge, rankPayment, VOID_PAYMENT_STATUS } from '@/lib/billing'
import { computeEstadoCuenta } from '@/lib/estado-cuenta'

// Cargos anulados por el punto de corte de BAW-18 (status 'void'): existen para
// la auditoría, pero nadie los cobra ni los cuenta como deuda.

describe('isCollectibleCharge — cargos que cobranza persigue', () => {
  it('excluye los pagados y los anulados', () => {
    expect(isCollectibleCharge('paid')).toBe(false)
    expect(isCollectibleCharge(VOID_PAYMENT_STATUS)).toBe(false)
  })

  it('sigue persiguiendo pendientes, atrasados y parciales', () => {
    for (const status of ['pending', 'late', 'partial', null, undefined]) {
      expect(isCollectibleCharge(status)).toBe(true)
    }
  })
})

describe('billing — mes con cargo anulado', () => {
  const today = new Date(2026, 9, 16)

  it('un cargo vivo del mismo mes siempre gana al anulado', () => {
    expect(rankPayment(VOID_PAYMENT_STATUS)).toBeLessThan(rankPayment('pending'))
  })

  it('el mes anulado no adeuda nada, aunque tenga mora persistida', () => {
    const result = computeMonthStatus({
      monthlyAmount: 4_500,
      paymentDay: 1,
      dueDate: '2026-07-01',
      waterFee: 250,
      payment: { status: VOID_PAYMENT_STATUS, amount: 4_750, amount_paid: 0, late_fee_amount: 475 },
      today,
    })
    expect(result).toEqual({ status: 'anulado', moraAmount: 0, remaining: 0, owed: 0 })
  })
})

describe('computeEstadoCuenta — ignora cargos anulados', () => {
  it('no los suma al saldo anterior ni a los cargos del periodo', () => {
    const estado = computeEstadoCuenta(
      [
        { id: 'a', due_date: '2026-07-15', amount: 4_750, amount_paid: 0, late_fee_amount: 475, status: VOID_PAYMENT_STATUS },
        { id: 'b', due_date: '2026-09-15', amount: 4_750, amount_paid: 0, late_fee_amount: 475, status: VOID_PAYMENT_STATUS },
        { id: 'c', due_date: '2026-10-15', amount: 5_000, amount_paid: 0, late_fee_amount: 0, status: 'pending' },
      ],
      '2026-10',
    )
    expect(estado.saldoAnterior).toBe(0)
    expect(estado.saldoTotal).toBe(5_000)
  })
})
