// BaW OS · Sprint 5B — Pure-logic pricing tests (no DB, no framework)
// Run: node tests/public-booking/pricing.test.mjs

import { strict as assert } from 'node:assert'

// ── Reimport logic inline (mirrors src/lib/public-booking/pricing.ts) ────────
const IVA_RATE = 0.16

function round2(n) {
  return Math.round(n * 100) / 100
}

function countNights(from, to) {
  const msPerDay = 86_400_000
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay)
}

function computeQuote(unit, from, to, guests) {
  if (unit.base_rate_mxn === null || unit.base_rate_mxn === undefined) {
    throw new Error('Unit has no base rate configured')
  }
  if (guests > unit.max_guests) throw new Error(`Unit supports max ${unit.max_guests} guests`)

  const nights = countNights(from, to)
  if (nights < unit.min_nights) throw new Error(`Minimum stay is ${unit.min_nights} night(s)`)
  if (nights <= 0) throw new Error('"to" must be after "from"')

  const baseRate = Number(unit.base_rate_mxn)
  const cleaningFee = Number(unit.cleaning_fee_mxn ?? 0)

  const subtotal = round2(baseRate * nights)
  const preTaxTotal = round2(subtotal + cleaningFee)
  const taxIva = round2(preTaxTotal * IVA_RATE)
  const total = round2(preTaxTotal + taxIva)

  const breakdown = [
    { label: `${nights} noches × $${baseRate}`, amount_mxn: subtotal },
  ]
  if (cleaningFee > 0) breakdown.push({ label: 'Limpieza', amount_mxn: cleaningFee })
  breakdown.push({ label: 'IVA (16%)', amount_mxn: taxIva })

  return { unit_slug: unit.slug, from, to, guests, nights, subtotal_mxn: subtotal, cleaning_fee_mxn: cleaningFee, tax_iva_mxn: taxIva, total_mxn: total, currency: 'MXN', breakdown }
}

// ── Test helpers ──────────────────────────────────────────────────────────────
let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${name}`)
    console.error(`    ${err.message}`)
    failed++
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const baseUnit = {
  slug: 'depa-1a',
  base_rate_mxn: 1000,
  cleaning_fee_mxn: 400,
  max_guests: 4,
  min_nights: 1,
}

// ── Tests ─────────────────────────────────────────────────────────────────────
console.log('pricing.test.mjs')

test('countNights: 3 nights between 2026-06-01 and 2026-06-04', () => {
  assert.equal(countNights('2026-06-01', '2026-06-04'), 3)
})

test('countNights: 1 night', () => {
  assert.equal(countNights('2026-07-15', '2026-07-16'), 1)
})

test('countNights: 7 nights (1 week)', () => {
  assert.equal(countNights('2026-01-01', '2026-01-08'), 7)
})

test('computeQuote: 2 nights × $1000 + $400 cleaning + 16% IVA', () => {
  const q = computeQuote(baseUnit, '2026-06-01', '2026-06-03', 2)
  assert.equal(q.nights, 2)
  assert.equal(q.subtotal_mxn, 2000)
  assert.equal(q.cleaning_fee_mxn, 400)
  // preTax = 2000 + 400 = 2400; IVA = 384; total = 2784
  assert.equal(q.tax_iva_mxn, 384)
  assert.equal(q.total_mxn, 2784)
  assert.equal(q.currency, 'MXN')
})

test('computeQuote: 1 night minimum stay is respected', () => {
  const q = computeQuote(baseUnit, '2026-08-10', '2026-08-11', 1)
  assert.equal(q.nights, 1)
  assert.equal(q.subtotal_mxn, 1000)
})

test('computeQuote: unit with 0 cleaning fee', () => {
  const unit = { ...baseUnit, cleaning_fee_mxn: 0 }
  const q = computeQuote(unit, '2026-06-01', '2026-06-03', 1)
  assert.equal(q.cleaning_fee_mxn, 0)
  // preTax = 2000; IVA = 320; total = 2320
  assert.equal(q.tax_iva_mxn, 320)
  assert.equal(q.total_mxn, 2320)
})

test('computeQuote: breakdown contains correct number of items (3: subtotal, cleaning, IVA)', () => {
  const q = computeQuote(baseUnit, '2026-06-01', '2026-06-03', 2)
  assert.equal(q.breakdown.length, 3)
  assert.equal(q.breakdown[2].label, 'IVA (16%)')
})

test('computeQuote: breakdown without cleaning (2 items: subtotal, IVA)', () => {
  const unit = { ...baseUnit, cleaning_fee_mxn: 0 }
  const q = computeQuote(unit, '2026-06-01', '2026-06-03', 1)
  assert.equal(q.breakdown.length, 2)
})

test('computeQuote: throws when guests exceed max_guests', () => {
  assert.throws(() => computeQuote(baseUnit, '2026-06-01', '2026-06-03', 10), /max/)
})

test('computeQuote: throws when min_nights not met', () => {
  const unit = { ...baseUnit, min_nights: 3 }
  assert.throws(() => computeQuote(unit, '2026-06-01', '2026-06-02', 1), /Minimum stay/)
})

test('computeQuote: throws when base_rate_mxn is null', () => {
  const unit = { ...baseUnit, base_rate_mxn: null }
  assert.throws(() => computeQuote(unit, '2026-06-01', '2026-06-03', 1), /base rate/)
})

test('computeQuote: IVA is 16% of (subtotal + cleaning_fee)', () => {
  const q = computeQuote(baseUnit, '2026-06-01', '2026-06-04', 2) // 3 nights
  const expected = round2((q.subtotal_mxn + q.cleaning_fee_mxn) * 0.16)
  assert.equal(q.tax_iva_mxn, expected)
})

test('computeQuote: total = subtotal + cleaning + IVA', () => {
  const q = computeQuote(baseUnit, '2026-06-01', '2026-06-06', 3) // 5 nights
  const expected = round2(q.subtotal_mxn + q.cleaning_fee_mxn + q.tax_iva_mxn)
  assert.equal(q.total_mxn, expected)
})

test('computeQuote: large reservation (30 nights) rounds correctly', () => {
  const unit = { ...baseUnit, base_rate_mxn: 799, cleaning_fee_mxn: 350 }
  const q = computeQuote(unit, '2026-07-01', '2026-07-31', 2)
  assert.equal(q.nights, 30)
  const expectedSubtotal = round2(799 * 30)  // 23970
  assert.equal(q.subtotal_mxn, expectedSubtotal)
  const expectedTotal = round2((expectedSubtotal + 350) * 1.16)
  assert.equal(q.total_mxn, expectedTotal)
})

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
