// BaW OS — Tests de verificación de firma Discord Ed25519 (Sprint 5A WS-1)
// Pure-logic: tests de la lógica de verificación sin deps externas.
// La implementación usa Web Crypto que está disponible en Node.js ≥18.
//
// Run: node tests/agents/discord-verify.test.mjs

import { strict as assert } from 'node:assert'
import { webcrypto } from 'node:crypto'

// Polyfill global crypto para Node entornos donde no está globalizado
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto
}

// ── Reimplementación de discord-verify.ts (pura lógica) ──────────────────────
// Espeja src/lib/agents/discord-verify.ts para test aislado

async function importDiscordPublicKey(publicKeyHex) {
  const bytes = new Uint8Array(
    publicKeyHex.match(/.{1,2}/g).map((b) => parseInt(b, 16))
  )
  return crypto.subtle.importKey('raw', bytes, { name: 'Ed25519' }, false, ['verify'])
}

async function verifyDiscordSignature(signature, timestamp, rawBody, publicKeyHex) {
  try {
    const publicKey = await importDiscordPublicKey(publicKeyHex)
    const sigBytes = new Uint8Array(
      signature.match(/.{1,2}/g).map((b) => parseInt(b, 16))
    )
    const message = new TextEncoder().encode(timestamp + rawBody)
    return await crypto.subtle.verify('Ed25519', publicKey, sigBytes, message)
  } catch {
    return false
  }
}

async function verifyDiscordRequest(headers, bodyText, publicKeyHex) {
  const signature = headers['x-signature-ed25519']
  const timestamp = headers['x-signature-timestamp']
  if (!signature || !timestamp) return { valid: false }
  const ts = parseInt(timestamp, 10)
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return { valid: false }
  const valid = await verifyDiscordSignature(signature, timestamp, bodyText, publicKeyHex)
  return valid ? { valid: true, rawBody: bodyText } : { valid: false }
}

// ── Generación de pares de claves para tests ─────────────────────────────────

async function generateTestKeyPair() {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    'Ed25519',
    true,
    ['sign', 'verify']
  )
  const pubRaw = await crypto.subtle.exportKey('raw', publicKey)
  const pubHex = Array.from(new Uint8Array(pubRaw))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return { privateKey, publicKey, pubHex }
}

async function signDiscordRequest(privateKey, timestamp, body) {
  const message = new TextEncoder().encode(timestamp + body)
  const sigBuf = await crypto.subtle.sign('Ed25519', privateKey, message)
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
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

console.log('discord-verify.test.mjs — Ed25519 signature verification\n')

const { privateKey, pubHex } = await generateTestKeyPair()
const nowTs = Math.floor(Date.now() / 1000).toString()
const testBody = JSON.stringify({ type: 1 })

// ── 1. Firma válida ───────────────────────────────────────────────────────────
await test('válida: PING con firma correcta', async () => {
  const sig = await signDiscordRequest(privateKey, nowTs, testBody)
  const result = await verifyDiscordRequest(
    { 'x-signature-ed25519': sig, 'x-signature-timestamp': nowTs },
    testBody,
    pubHex
  )
  assert.equal(result.valid, true)
})

// ── 2. Firma inválida (firma de otro body) ────────────────────────────────────
await test('inválida: firma no corresponde al body', async () => {
  const sig = await signDiscordRequest(privateKey, nowTs, '{"type":2}')
  const result = await verifyDiscordRequest(
    { 'x-signature-ed25519': sig, 'x-signature-timestamp': nowTs },
    testBody, // body diferente
    pubHex
  )
  assert.equal(result.valid, false)
})

// ── 3. Headers faltantes ──────────────────────────────────────────────────────
await test('inválida: falta x-signature-ed25519', async () => {
  const result = await verifyDiscordRequest(
    { 'x-signature-timestamp': nowTs },
    testBody,
    pubHex
  )
  assert.equal(result.valid, false)
})

await test('inválida: falta x-signature-timestamp', async () => {
  const result = await verifyDiscordRequest(
    { 'x-signature-ed25519': 'deadbeef' },
    testBody,
    pubHex
  )
  assert.equal(result.valid, false)
})

// ── 4. Timestamp expirado (replay attack) ────────────────────────────────────
await test('inválida: timestamp expirado (>5min)', async () => {
  const oldTs = (Math.floor(Date.now() / 1000) - 400).toString() // 400s ago
  const sig = await signDiscordRequest(privateKey, oldTs, testBody)
  const result = await verifyDiscordRequest(
    { 'x-signature-ed25519': sig, 'x-signature-timestamp': oldTs },
    testBody,
    pubHex
  )
  assert.equal(result.valid, false)
})

// ── 5. Signature hex corrupta ─────────────────────────────────────────────────
await test('inválida: firma hex malformada', async () => {
  const result = await verifyDiscordRequest(
    { 'x-signature-ed25519': 'ZZZZZZ', 'x-signature-timestamp': nowTs },
    testBody,
    pubHex
  )
  assert.equal(result.valid, false)
})

// ── 6. Clave pública incorrecta ───────────────────────────────────────────────
await test('inválida: clave pública de otro bot', async () => {
  const { pubHex: otherPub } = await generateTestKeyPair()
  const sig = await signDiscordRequest(privateKey, nowTs, testBody)
  const result = await verifyDiscordRequest(
    { 'x-signature-ed25519': sig, 'x-signature-timestamp': nowTs },
    testBody,
    otherPub // clave diferente
  )
  assert.equal(result.valid, false)
})

// ── 7. Body vacío (PING) ──────────────────────────────────────────────────────
await test('válida: body vacío con firma correcta', async () => {
  const emptyBody = ''
  const sig = await signDiscordRequest(privateKey, nowTs, emptyBody)
  const result = await verifyDiscordRequest(
    { 'x-signature-ed25519': sig, 'x-signature-timestamp': nowTs },
    emptyBody,
    pubHex
  )
  assert.equal(result.valid, true)
})

// ── Resumen ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
