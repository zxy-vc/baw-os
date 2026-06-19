// BaW OS — Regresión: mapeo de método de pago (candado del bug PR #94).
//
// A diferencia del .mjs anterior (que copiaba la lógica), este test IMPORTA el
// código real. Si alguien rompe el mapeo en src/lib/cobros.ts, este test falla.
//
// Bug original: el modal enviaba "Transferencia" (español) a payments.method,
// un ENUM en inglés → Postgres rechazaba el insert y el pago no se guardaba.

import { describe, it, expect } from 'vitest'
import { mapPaymentMethod, PAYMENT_METHOD_ENUM } from '@/lib/cobros'

describe('mapPaymentMethod', () => {
  it('mapea los labels de la UI al enum inglés correcto', () => {
    expect(mapPaymentMethod('Transferencia').methodEnum).toBe('transfer')
    expect(mapPaymentMethod('Efectivo').methodEnum).toBe('cash')
    expect(mapPaymentMethod('Depósito').methodEnum).toBe('transfer')
  })

  it('INVARIANTE: method nunca lleva un valor en español (bug #94)', () => {
    for (const label of ['Transferencia', 'Efectivo', 'Depósito', 'Otro', '']) {
      const { methodEnum } = mapPaymentMethod(label)
      expect(PAYMENT_METHOD_ENUM).toContain(methodEnum)
    }
  })

  it('payment_method conserva el español para reportes', () => {
    expect(mapPaymentMethod('Transferencia').paymentMethodEs).toBe('transferencia')
    expect(mapPaymentMethod('Efectivo').paymentMethodEs).toBe('efectivo')
    expect(mapPaymentMethod('Depósito').paymentMethodEs).toBe('otro')
  })
})
