// BaW OS · Sprint 5B — Idempotency logic tests (no DB, pure-logic)
// Run: node tests/public-booking/idempotency.test.mjs
// TODO(WS-4): expand with real DB integration tests once env is available

import { strict as assert } from 'node:assert'

// ── Reimplementation of checkout idempotency logic ────────────────────────────
// Mirrors the logic in /api/public/v1/bookings/checkout/route.ts
function makeIdemStore() {
  const store = new Map()
  return {
    get(key) {
      const entry = store.get(key)
      if (!entry) return null
      if (new Date(entry.expires_at) < new Date()) {
        store.delete(key)
        return null
      }
      return entry
    },
    set(key, response, ttlMs = 24 * 60 * 60 * 1000) {
      store.set(key, {
        key,
        response,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
      })
    },
    size() {
      return store.size
    },
  }
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

async function testAsync(name, fn) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${name}`)
    console.error(`    ${err.message}`)
    failed++
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
console.log('idempotency.test.mjs')

test('same key returns cached response', () => {
  const store = makeIdemStore()
  const key = 'test-key-001'
  const response = { checkout_url: 'https://stripe.com/c/test', session_id: 'cs_001', hold_id: 'hold_001', expires_at: '2026-06-01T12:00:00Z' }

  store.set(key, response)

  const cached = store.get(key)
  assert.ok(cached, 'should return cached entry')
  assert.deepEqual(cached.response, response)
})

test('different key does not return cached response', () => {
  const store = makeIdemStore()
  store.set('key-A', { checkout_url: 'https://stripe.com/A' })

  const result = store.get('key-B')
  assert.equal(result, null, 'different key should return null')
})

test('expired entry returns null', () => {
  const store = makeIdemStore()
  const key = 'expired-key'

  // Set with -1ms TTL (already expired)
  store.set(key, { checkout_url: 'https://stripe.com/exp' }, -1)

  const result = store.get(key)
  assert.equal(result, null, 'expired entry should return null')
})

test('missing key returns null', () => {
  const store = makeIdemStore()
  assert.equal(store.get('nonexistent-key'), null)
})

test('same key called twice returns identical response', () => {
  const store = makeIdemStore()
  const key = 'idempotent-key-002'
  const response = { checkout_url: 'https://stripe.com/c/abc123', session_id: 'cs_abc', hold_id: 'hold_abc', expires_at: '2026-07-01T00:00:00Z' }

  store.set(key, response)

  const first = store.get(key)
  const second = store.get(key)

  assert.deepEqual(first, second, 'both calls should return identical response')
  assert.equal(first?.response.session_id, 'cs_abc')
})

test('store correctly records expires_at in future', () => {
  const store = makeIdemStore()
  const key = 'future-key'
  const before = Date.now()
  store.set(key, { msg: 'test' }, 3600_000) // 1 hour
  const entry = store.get(key)
  assert.ok(entry)
  const expiresAt = new Date(entry.expires_at).getTime()
  assert.ok(expiresAt > before, 'expires_at should be in the future')
})

test('multiple keys are independent', () => {
  const store = makeIdemStore()
  store.set('key-1', { session_id: 'cs_1' })
  store.set('key-2', { session_id: 'cs_2' })
  store.set('key-3', { session_id: 'cs_3' })

  assert.equal(store.get('key-1')?.response.session_id, 'cs_1')
  assert.equal(store.get('key-2')?.response.session_id, 'cs_2')
  assert.equal(store.get('key-3')?.response.session_id, 'cs_3')
  assert.equal(store.size(), 3)
})

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
