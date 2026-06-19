// BaW OS — Regresión: mapeo de método de pago (candado del bug PR #94)
//
// Bug original: el modal de cobros enviaba el label en español ("Transferencia")
// a la columna payments.method, que es un ENUM en inglés (transfer/cash/stripe…).
// Postgres rechazaba el insert y el pago "no guardaba". El typecheck no lo veía
// porque era un string válido en TS. Esta es justo la clase de bug que solo se
// atrapa con un test del contrato app↔DB.
//
// Pure-logic: espejeamos el mapeo de src/app/cobros/page.tsx:331-333.
// Cuando se integre vitest (Fase 1 de QA), este test debe IMPORTAR el helper
// real en vez de re-declararlo, para que cubra el source y no solo la copia.
//
// Run: node tests/cobros/payment-method.test.mjs

import { strict as assert } from 'node:assert'

// ── Valores válidos del enum payment_method en la DB (inglés) ────────────────
// Si la app envía algo fuera de este set a payments.method, Postgres revienta.
const PAYMENT_METHOD_ENUM = new Set(['cash', 'transfer', 'stripe', 'other'])

// ── Mirror de src/app/cobros/page.tsx:331-333 ────────────────────────────────
function mapMethod(uiLabel) {
  const m = String(uiLabel).toLowerCase()
  const methodEnum = m === 'efectivo' ? 'cash' : 'transfer' // transferencia y depósito → transfer
  const paymentMethodEs =
    m === 'efectivo' ? 'efectivo' : m === 'transferencia' ? 'transferencia' : 'otro'
  return { methodEnum, paymentMethodEs }
}

let passed = 0
function check(name, fn) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// 1. Los labels de la UI mapean al enum inglés correcto.
check('Transferencia → transfer', () => {
  assert.equal(mapMethod('Transferencia').methodEnum, 'transfer')
})
check('Efectivo → cash', () => {
  assert.equal(mapMethod('Efectivo').methodEnum, 'cash')
})
check('Depósito (u otro) cae en transfer', () => {
  assert.equal(mapMethod('Depósito').methodEnum, 'transfer')
})

// 2. INVARIANTE DEL BUG: method NUNCA debe llevar un valor en español.
check('method siempre es un valor válido del enum (nunca español)', () => {
  for (const label of ['Transferencia', 'Efectivo', 'Depósito', 'Otro', '']) {
    const { methodEnum } = mapMethod(label)
    assert.ok(
      PAYMENT_METHOD_ENUM.has(methodEnum),
      `method="${methodEnum}" no está en el enum de la DB (regresión del bug #94)`,
    )
  }
})

// 3. La columna paralela payment_method (TEXT, español) sí conserva el español.
check('payment_method conserva el español para reportes', () => {
  assert.equal(mapMethod('Transferencia').paymentMethodEs, 'transferencia')
  assert.equal(mapMethod('Efectivo').paymentMethodEs, 'efectivo')
  assert.equal(mapMethod('Depósito').paymentMethodEs, 'otro')
})

console.log(`\npayment-method.test.mjs: ${passed} checks passed.`)
