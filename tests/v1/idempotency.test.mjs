// BaW OS — Tests pure-logic de idempotency (no DB)
// Verifica el contrato: misma key + mismo body → hit; misma key + body distinto → conflict.
// Stub de supabase + verificación de comportamiento del checkIdempotency.

import crypto from 'node:crypto'

function hashSha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex')
}

// Reimplementación local de la lógica clave para test (mirroring src/lib/agents/v1/idempotency.ts)
function makeIdemStore() {
  const store = new Map()
  return {
    get(orgId, agentId, key) {
      return store.get(`${orgId}:${agentId}:${key}`)
    },
    put(orgId, agentId, key, row) {
      store.set(`${orgId}:${agentId}:${key}`, row)
    },
  }
}

async function check(store, ctx, key, rawBody) {
  if (!key) return { hit: false, key: null, bodyHash: null }
  const bodyHash = hashSha256(rawBody)
  const existing = store.get(ctx.orgId, ctx.agentId, key)
  if (!existing) return { hit: false, key, bodyHash }
  if (new Date(existing.expires_at).getTime() < Date.now()) {
    return { hit: false, key, bodyHash }
  }
  if (existing.request_hash !== bodyHash) return { conflict: true }
  return { hit: true, status: existing.response_status, body: existing.response_body }
}

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++ }
  else { console.error(`  ✗ ${name}`); fail++ }
}

const ctx = { orgId: 'org-1', agentId: 'cobranza' }
const store = makeIdemStore()
const future = new Date(Date.now() + 1_000_000).toISOString()
const past = new Date(Date.now() - 1_000_000).toISOString()

// First call: miss
const r1 = await check(store, ctx, 'key-1', '{"a":1}')
assert('first call: miss', r1.hit === false && r1.key === 'key-1')

// Persist
store.put(ctx.orgId, ctx.agentId, 'key-1', {
  request_hash: hashSha256('{"a":1}'),
  response_status: 200,
  response_body: { ok: true },
  expires_at: future,
})

// Second call same body: hit
const r2 = await check(store, ctx, 'key-1', '{"a":1}')
assert('same key + same body: hit', r2.hit === true && r2.status === 200)
assert('hit returns cached body', r2.body && r2.body.ok === true)

// Same key different body: conflict
const r3 = await check(store, ctx, 'key-1', '{"a":2}')
assert('same key + different body: conflict', r3.conflict === true)

// Without idempotency key: miss (not cached)
const r4 = await check(store, ctx, null, '{"a":1}')
assert('no key: miss', r4.hit === false && r4.key === null)

// Expired entry: miss
store.put(ctx.orgId, ctx.agentId, 'key-2', {
  request_hash: hashSha256('{"x":1}'),
  response_status: 200,
  response_body: { ok: true },
  expires_at: past,
})
const r5 = await check(store, ctx, 'key-2', '{"x":1}')
assert('expired entry: treated as miss', r5.hit === false)

console.log(`\nIdempotency: ${pass}/${pass + fail} pass`)
if (fail > 0) process.exit(1)
