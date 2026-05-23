// BaW OS — Tests de autenticación de agentes (Sprint 5A WS-1)
// Pure-logic: tests de hashApiKey, generateApiKey, timingSafeEqual, scope checks.
// Los tests de DB se hacen con mocks inline.
//
// Run: node tests/agents/auth.test.mjs

import { strict as assert } from 'node:assert'
import { webcrypto } from 'node:crypto'

if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto
}

// ── Reimplementación de las funciones pure de auth.ts ────────────────────────

const KEY_PREFIX_LIVE = 'sk_live_'
const KEY_PREFIX_TEST = 'sk_test_'
const PREFIX_LOOKUP_LEN = 12

async function hashApiKey(plainKey) {
  const enc = new TextEncoder().encode(plainKey)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateApiKey(env = 'live') {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const random = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const fullPrefix = env === 'live' ? KEY_PREFIX_LIVE : KEY_PREFIX_TEST
  const plainKey = `${fullPrefix}${random}`
  return { plainKey, prefix: plainKey.slice(0, PREFIX_LOOKUP_LEN) }
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function hasRequiredScopes(grantedScopes, requiredScopes) {
  if (grantedScopes.includes('*')) return { ok: true, missing: [] }
  const missing = requiredScopes.filter((s) => !grantedScopes.includes(s))
  return { ok: missing.length === 0, missing }
}

// ── Simulador de authenticateAgentRequest con DB mock ────────────────────────

function createMockAuthenticator(dbRows) {
  return async function authenticate(plainKey, requiredScopes = []) {
    if (!plainKey.startsWith(KEY_PREFIX_LIVE) && !plainKey.startsWith(KEY_PREFIX_TEST)) {
      return { ok: false, status: 401, code: 'invalid_credential_format' }
    }

    const prefix = plainKey.slice(0, PREFIX_LOOKUP_LEN)
    const hash = await hashApiKey(plainKey)

    const activeRows = dbRows.filter(
      (r) => r.api_key_prefix === prefix && r.status === 'active'
    )
    const matched = activeRows.find((r) => timingSafeEqual(r.api_key_hash, hash))

    if (!matched) {
      return { ok: false, status: 401, code: 'invalid_credential' }
    }

    if (matched.expires_at && Date.now() > new Date(matched.expires_at).getTime()) {
      return { ok: false, status: 401, code: 'credential_expired' }
    }

    const { ok, missing } = hasRequiredScopes(matched.scopes, requiredScopes)
    if (!ok) {
      return { ok: false, status: 403, code: 'forbidden_scope', missing }
    }

    return {
      ok: true,
      agentId: matched.agent_id,
      orgId: matched.org_id,
      credentialId: matched.id,
      scopes: matched.scopes,
      rateLimitTier: matched.rate_limit_tier ?? 'standard',
    }
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

async function test(name, fn) {
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

console.log('auth.test.mjs — Agent bearer token authentication\n')

// ── Setup: generar claves de test ─────────────────────────────────────────────
const { plainKey: liveKey, prefix: livePrefix } = generateApiKey('live')
const { plainKey: testKey, prefix: testPrefix } = generateApiKey('test')
const liveHash = await hashApiKey(liveKey)
const testHash = await hashApiKey(testKey)
const { plainKey: revokedKey, prefix: revokedPrefix } = generateApiKey('live')
const revokedHash = await hashApiKey(revokedKey)

const mockDb = [
  {
    id: 'cred-001',
    org_id: 'org-baw-operations',
    agent_id: 'alicia-ops',
    api_key_prefix: livePrefix,
    api_key_hash: liveHash,
    scopes: ['incidents:read', 'incidents:write', 'units:read'],
    status: 'active',
    expires_at: null,
    rate_limit_tier: 'standard',
  },
  {
    id: 'cred-002',
    org_id: 'org-baw-operations',
    agent_id: 'alicia-ops',
    api_key_prefix: testPrefix,
    api_key_hash: testHash,
    scopes: ['incidents:read'],
    status: 'active',
    expires_at: null,
    rate_limit_tier: 'standard',
  },
  {
    id: 'cred-003',
    org_id: 'org-baw-operations',
    agent_id: 'alicia-ops',
    api_key_prefix: revokedPrefix,
    api_key_hash: revokedHash,
    scopes: ['incidents:read'],
    status: 'revoked',
    expires_at: null,
    rate_limit_tier: 'standard',
  },
]

const authenticate = createMockAuthenticator(mockDb)

// ── 1. Bearer válido ──────────────────────────────────────────────────────────
await test('válido: sk_live_ con scopes correctos', async () => {
  const result = await authenticate(liveKey, ['incidents:read'])
  assert.equal(result.ok, true)
  assert.equal(result.agentId, 'alicia-ops')
  assert.ok(result.scopes.includes('incidents:read'))
})

// ── 2. Bearer válido sin scopes requeridos ────────────────────────────────────
await test('válido: sin scopes requeridos (acceso público de agente)', async () => {
  const result = await authenticate(liveKey, [])
  assert.equal(result.ok, true)
})

// ── 3. Bearer con scope insuficiente ─────────────────────────────────────────
await test('forbidden: scope insuficiente (sk_test_ pide incidents:write)', async () => {
  const result = await authenticate(testKey, ['incidents:write'])
  assert.equal(result.ok, false)
  assert.equal(result.status, 403)
  assert.equal(result.code, 'forbidden_scope')
  assert.ok(result.missing.includes('incidents:write'))
})

// ── 4. Bearer revocado ────────────────────────────────────────────────────────
await test('inválido: credential revocada', async () => {
  const result = await authenticate(revokedKey, [])
  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
  assert.equal(result.code, 'invalid_credential')
})

// ── 5. Bearer completamente inventado ────────────────────────────────────────
await test('inválido: token inventado', async () => {
  const result = await authenticate('sk_live_' + 'ff'.repeat(24), [])
  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
})

// ── 6. Token con formato incorrecto ──────────────────────────────────────────
await test('inválido: formato incorrecto (sin prefix sk_live_/sk_test_)', async () => {
  const result = await authenticate('baw_pat_live_xxx', [])
  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
  assert.equal(result.code, 'invalid_credential_format')
})

// ── 7. Token expirado ────────────────────────────────────────────────────────
await test('inválido: credential expirada', async () => {
  const { plainKey: expiredKey, prefix: expiredPrefix } = generateApiKey('live')
  const expiredHash = await hashApiKey(expiredKey)
  const dbWithExpired = [
    ...mockDb,
    {
      id: 'cred-expired',
      org_id: 'org-baw-operations',
      agent_id: 'alicia-ops',
      api_key_prefix: expiredPrefix,
      api_key_hash: expiredHash,
      scopes: ['incidents:read'],
      status: 'active', // status 'active' pero expires_at en el pasado
      expires_at: new Date(Date.now() - 3600_000).toISOString(), // 1h ago
      rate_limit_tier: 'standard',
    },
  ]
  const authenticateWithExpired = createMockAuthenticator(dbWithExpired)
  const result = await authenticateWithExpired(expiredKey, [])
  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
  assert.equal(result.code, 'credential_expired')
})

// ── 8. Scopes con wildcard (*) ────────────────────────────────────────────────
await test('válido: scope wildcard (*) concede acceso a cualquier scope', async () => {
  const { plainKey: superKey, prefix: superPrefix } = generateApiKey('live')
  const superHash = await hashApiKey(superKey)
  const dbWithSuper = [
    ...mockDb,
    {
      id: 'cred-super',
      org_id: 'org-baw-operations',
      agent_id: 'alicia-ops',
      api_key_prefix: superPrefix,
      api_key_hash: superHash,
      scopes: ['*'],
      status: 'active',
      expires_at: null,
      rate_limit_tier: 'unlimited',
    },
  ]
  const authenticateWithSuper = createMockAuthenticator(dbWithSuper)
  const result = await authenticateWithSuper(superKey, [
    'contracts:write',
    'payments:write',
    'cfdi:emit',
  ])
  assert.equal(result.ok, true)
})

// ── 9. hashApiKey determinístico ──────────────────────────────────────────────
await test('hashApiKey es determinístico (mismo input = mismo hash)', async () => {
  const h1 = await hashApiKey('sk_live_test_key_123')
  const h2 = await hashApiKey('sk_live_test_key_123')
  assert.equal(h1, h2)
})

// ── 10. hashApiKey distingue keys similares ────────────────────────────────
await test('hashApiKey distingue claves similares', async () => {
  const h1 = await hashApiKey('sk_live_test_key_123')
  const h2 = await hashApiKey('sk_live_test_key_124')
  assert.notEqual(h1, h2)
})

// ── 11. generateApiKey formato correcto ───────────────────────────────────────
await test('generateApiKey: formato sk_live_ correcto', () => {
  const { plainKey, prefix } = generateApiKey('live')
  assert.ok(plainKey.startsWith('sk_live_'))
  assert.equal(prefix, plainKey.slice(0, PREFIX_LOOKUP_LEN))
  assert.equal(prefix.length, 12)
})

await test('generateApiKey: formato sk_test_ correcto', () => {
  const { plainKey } = generateApiKey('test')
  assert.ok(plainKey.startsWith('sk_test_'))
})

// ── 12. timingSafeEqual resiste comparación de diferente largo ────────────────
await test('timingSafeEqual: diferente largo retorna false', () => {
  assert.equal(timingSafeEqual('abc', 'abcd'), false)
})

// ── Resumen ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
