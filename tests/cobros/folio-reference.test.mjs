// BaW OS — Regresión: folio y referencia ordenados (candado del bug PR #95)
//
// Antes: el folio del estado de cuenta usaba 4 chars del UUID (EC-2026-02-AB12),
// que se veía aleatorio, y la referencia del pago quedaba vacía. Ahora ambos se
// derivan de forma determinista de depto + periodo, y deben ser estables:
// mismo depto + mismo mes => mismo identificador.
//
// Pure-logic: espejeamos folioFor() de src/lib/estado-cuenta.ts:276 y
// referenceFor() de src/app/cobros/page.tsx. Cuando entre vitest (Fase 1),
// importar las funciones reales en vez de re-declararlas.
//
// Run: node tests/cobros/folio-reference.test.mjs

import { strict as assert } from 'node:assert'

// ── Mirror de src/lib/estado-cuenta.ts:folioFor ──────────────────────────────
function folioFor(unitNumber, periodo) {
  const depto = (unitNumber || '').trim().replace(/\s+/g, '') || 'SN'
  return `EC-${depto}-${periodo}`
}

// ── Mirror de src/app/cobros/page.tsx:referenceFor ───────────────────────────
function referenceFor(unitNumber, month) {
  const depto = (unitNumber || '').trim().replace(/\s+/g, '') || 'SN'
  return `${depto}-${month}`
}

let passed = 0
function check(name, fn) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// 1. Formato legible y ordenado, no aleatorio.
check('folio = EC-{depto}-{periodo}', () => {
  assert.equal(folioFor('D102', '2026-02'), 'EC-D102-2026-02')
})
check('referencia = {depto}-{periodo}', () => {
  assert.equal(referenceFor('D102', '2026-02'), 'D102-2026-02')
})

// 2. Determinismo: mismo depto + mes => mismo identificador (clave del pedido).
check('folio es determinista (mismo input => mismo folio)', () => {
  assert.equal(folioFor('D102', '2026-02'), folioFor('D102', '2026-02'))
})

// 3. INVARIANTE: nada de fragmentos de UUID ni aleatoriedad. Solo depto + fecha.
check('no quedan rastros aleatorios en el folio', () => {
  const folio = folioFor('D102', '2026-02')
  assert.ok(/^EC-[A-Za-z0-9]+-\d{4}-\d{2}$/.test(folio), `folio con forma inesperada: ${folio}`)
})

// 4. Fallback defensivo cuando falta el número de depto.
check('sin depto usa SN como marcador, no truena', () => {
  assert.equal(folioFor(null, '2026-02'), 'EC-SN-2026-02')
  assert.equal(referenceFor('  ', '2026-02'), 'SN-2026-02')
})

console.log(`\nfolio-reference.test.mjs: ${passed} checks passed.`)
