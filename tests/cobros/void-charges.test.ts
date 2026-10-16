import { describe, expect, it } from 'vitest'
import { isCollectibleCharge, VOID_PAYMENT_STATUS } from '@/lib/billing'

describe('isCollectibleCharge — cargos que cobranza persigue', () => {
  it('excluye los pagados y los anulados por el punto de corte (BAW-18)', () => {
    expect(isCollectibleCharge('paid')).toBe(false)
    expect(isCollectibleCharge(VOID_PAYMENT_STATUS)).toBe(false)
  })

  it('sigue persiguiendo pendientes, atrasados y parciales', () => {
    for (const status of ['pending', 'late', 'partial', null, undefined]) {
      expect(isCollectibleCharge(status)).toBe(true)
    }
  })
})
