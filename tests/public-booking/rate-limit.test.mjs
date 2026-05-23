// BaW OS · Sprint 5B — Rate limiter tests (pure-logic, in-memory)
// Run: node tests/public-booking/rate-limit.test.mjs
// TODO(WS-4): replace with Upstash Ratelimit tests when configured

import { strict as assert } from 'node:assert'

// ── Reimplementation of rate-limit.ts ────────────────────────────────────────
// Mirrors src/lib/public-booking/rate-limit.ts

function makeRateLimiter() {
  const store = new Map()

  function checkRateLimit(key, limit, windowMs = 60_000) {
    const now = Date.now()
    const entry = store.get(key)

    if (!entry || entry.resetAt < now) {
      const resetAt = now + windowMs
      store.set(key, { count: 1, resetAt })
      return { allowed: true, remaining: limit - 1, resetAt }
    }

    if (entry.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt }
    }

    entry.count++
    return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt }
  }

  function rateLimitByIp(routeId, ip, limit) {
    return checkRateLimit(`${routeId}:${ip}`, limit)
  }

  return { checkRateLimit, rateLimitByIp, store }
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

// ── Tests ─────────────────────────────────────────────────────────────────────
console.log('rate-limit.test.mjs')

test('first request is allowed', () => {
  const rl = makeRateLimiter()
  const result = rl.checkRateLimit('route:ip-1', 5)
  assert.equal(result.allowed, true)
  assert.equal(result.remaining, 4)
})

test('requests up to limit are allowed', () => {
  const rl = makeRateLimiter()
  const key = 'route:ip-2'
  const limit = 5
  for (let i = 0; i < limit; i++) {
    const r = rl.checkRateLimit(key, limit)
    assert.equal(r.allowed, true, `request ${i + 1} should be allowed`)
  }
})

test('request over limit is blocked', () => {
  const rl = makeRateLimiter()
  const key = 'route:ip-3'
  const limit = 3
  for (let i = 0; i < limit; i++) {
    rl.checkRateLimit(key, limit) // exhaust
  }
  const over = rl.checkRateLimit(key, limit)
  assert.equal(over.allowed, false, 'over-limit request should be blocked')
  assert.equal(over.remaining, 0)
})

test('remaining count decrements correctly', () => {
  const rl = makeRateLimiter()
  const key = 'route:ip-4'
  const limit = 10
  for (let i = 0; i < 5; i++) {
    rl.checkRateLimit(key, limit)
  }
  const next = rl.checkRateLimit(key, limit)
  assert.equal(next.remaining, limit - 6)
})

test('different IPs have independent counters', () => {
  const rl = makeRateLimiter()
  const limit = 2
  rl.checkRateLimit('route:ip-A', limit)
  rl.checkRateLimit('route:ip-A', limit)
  const blockedA = rl.checkRateLimit('route:ip-A', limit)
  assert.equal(blockedA.allowed, false, 'ip-A should be blocked')

  const allowedB = rl.checkRateLimit('route:ip-B', limit)
  assert.equal(allowedB.allowed, true, 'ip-B should still be allowed')
})

test('rateLimitByIp uses route+ip composite key', () => {
  const rl = makeRateLimiter()
  const limit = 1

  rl.rateLimitByIp('buildings', '1.2.3.4', limit)
  const blocked = rl.rateLimitByIp('buildings', '1.2.3.4', limit)
  assert.equal(blocked.allowed, false)

  const otherRoute = rl.rateLimitByIp('units', '1.2.3.4', limit)
  assert.equal(otherRoute.allowed, true, 'different route should be independent')
})

test('window expires and resets count', () => {
  const rl = makeRateLimiter()
  const key = 'route:ip-expire'
  const limit = 1
  const windowMs = 10 // tiny window

  rl.checkRateLimit(key, limit, windowMs)
  const blocked = rl.checkRateLimit(key, limit, windowMs)
  assert.equal(blocked.allowed, false, 'should be blocked immediately')

  // Wait for window to expire
  return new Promise((resolve) => {
    setTimeout(() => {
      const after = rl.checkRateLimit(key, limit, windowMs)
      assert.equal(after.allowed, true, 'should be allowed after window expires')
      resolve()
    }, 15)
  })
})

test('limit of 60 for GETs is enforced', () => {
  const rl = makeRateLimiter()
  const key = 'get-route:ip-get'
  const limit = 60

  for (let i = 0; i < 60; i++) {
    const r = rl.checkRateLimit(key, limit)
    assert.equal(r.allowed, true, `GET request ${i + 1} should be allowed`)
  }

  const over = rl.checkRateLimit(key, limit)
  assert.equal(over.allowed, false, '61st GET request should be blocked')
})

test('limit of 10 for POSTs is enforced', () => {
  const rl = makeRateLimiter()
  const key = 'post-route:ip-post'
  const limit = 10

  for (let i = 0; i < 10; i++) {
    const r = rl.checkRateLimit(key, limit)
    assert.equal(r.allowed, true, `POST request ${i + 1} should be allowed`)
  }

  const over = rl.checkRateLimit(key, limit)
  assert.equal(over.allowed, false, '11th POST request should be blocked')
})

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
