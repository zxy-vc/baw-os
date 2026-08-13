import { describe, expect, it } from 'vitest'
import { computeMonthStatus } from '@/lib/billing'

const today = new Date(2026, 6, 20)

describe('computeMonthStatus — mora persistida', () => {
  it('no proyecta mora si payments todavía tiene late_fee_amount en cero', () => {
    const result = computeMonthStatus({
      monthlyAmount: 10_000,
      paymentDay: 1,
      dueDate: '2026-07-01',
      waterFee: 250,
      payment: { status: 'pending', amount: 10_250, amount_paid: 0, late_fee_amount: 0 },
      today,
    })

    expect(result).toEqual({ status: 'vencido', moraAmount: 0, remaining: 0, owed: 10_250 })
  })

  it('muestra exactamente el recargo persistido, incluido en el saldo', () => {
    const result = computeMonthStatus({
      monthlyAmount: 10_000,
      paymentDay: 1,
      dueDate: '2026-07-01',
      waterFee: 250,
      payment: { status: 'pending', amount: 10_250, amount_paid: 0, late_fee_amount: 1_025 },
      today,
    })

    expect(result).toEqual({ status: 'mora', moraAmount: 1_025, remaining: 0, owed: 11_275 })
  })

  it('incluye la mora persistida al calcular el saldo de un pago parcial', () => {
    const result = computeMonthStatus({
      monthlyAmount: 10_000,
      paymentDay: 1,
      dueDate: '2026-07-01',
      waterFee: 250,
      payment: { status: 'partial', amount: 10_250, amount_paid: 5_000, late_fee_amount: 1_025 },
      today,
    })

    expect(result).toEqual({ status: 'parcial', moraAmount: 0, remaining: 6_275, owed: 6_275 })
  })
})
