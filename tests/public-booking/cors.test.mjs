// BaW OS · Sprint 5B — CORS helper tests (pure-logic, no HTTP)
// Run: node tests/public-booking/cors.test.mjs
// TODO(WS-4): expand with actual HTTP integration tests against the running server

import { strict as assert } from 'node:assert'

// ── Reimplementation of cors.ts getAllowedOrigin logic ────────────────────────
// Mirrors src/lib/public-booking/cors.ts

function getAllowedOrigin(requestOrigin, allowedEnv, nodeEnv = 'production') {
  if (!requestOrigin) return null

  const allowed = (allowedEnv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // In development, allow localhost and vercel previews
  if (nodeEnv === 'development') {
    if (
      requestOrigin.startsWith('http://localhost') ||
      requestOrigin.startsWith('http://127.0.0.1') ||
      requestOrigin.endsWith('.vercel.app')
    ) {
      return requestOrigin
    }
  }

  if (allowed.includes(requestOrigin)) return requestOrigin
  return null
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
console.log('cors.test.mjs')

const allowedEnv = 'https://809.mx,https://baw-os.vercel.app'

test('allowed origin returns origin string', () => {
  const result = getAllowedOrigin('https://809.mx', allowedEnv)
  assert.equal(result, 'https://809.mx')
})

test('second allowed origin is accepted', () => {
  const result = getAllowedOrigin('https://baw-os.vercel.app', allowedEnv)
  assert.equal(result, 'https://baw-os.vercel.app')
})

test('unknown origin returns null in production', () => {
  const result = getAllowedOrigin('https://evil.com', allowedEnv, 'production')
  assert.equal(result, null)
})

test('null origin returns null', () => {
  const result = getAllowedOrigin(null, allowedEnv)
  assert.equal(result, null)
})

test('empty origin string returns null', () => {
  const result = getAllowedOrigin('', allowedEnv)
  assert.equal(result, null)
})

test('localhost is allowed in development', () => {
  const result = getAllowedOrigin('http://localhost:3000', allowedEnv, 'development')
  assert.equal(result, 'http://localhost:3000')
})

test('127.0.0.1 is allowed in development', () => {
  const result = getAllowedOrigin('http://127.0.0.1:3000', allowedEnv, 'development')
  assert.equal(result, 'http://127.0.0.1:3000')
})

test('vercel preview is allowed in development', () => {
  const result = getAllowedOrigin('https://my-branch.vercel.app', allowedEnv, 'development')
  assert.equal(result, 'https://my-branch.vercel.app')
})

test('localhost is NOT allowed in production unless whitelisted', () => {
  const result = getAllowedOrigin('http://localhost:3000', allowedEnv, 'production')
  assert.equal(result, null)
})

test('http variant of allowed https origin is rejected', () => {
  // https://809.mx is allowed but http://809.mx should not be
  const result = getAllowedOrigin('http://809.mx', allowedEnv, 'production')
  assert.equal(result, null)
})

test('subdomain of allowed origin is rejected in production', () => {
  // api.809.mx is NOT https://809.mx
  const result = getAllowedOrigin('https://api.809.mx', allowedEnv, 'production')
  assert.equal(result, null)
})

test('empty allowedEnv rejects all origins in production', () => {
  const result = getAllowedOrigin('https://809.mx', '', 'production')
  assert.equal(result, null)
})

test('comma-separated env with spaces is parsed correctly', () => {
  const env = '  https://809.mx , https://baw-os.vercel.app  '
  const result = getAllowedOrigin('https://809.mx', env, 'production')
  assert.equal(result, 'https://809.mx')
})

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
