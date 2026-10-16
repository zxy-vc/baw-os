// BaW OS — Tests del parser de custom_id de aprobaciones Discord (Sprint 5A MVP)
// Pure-logic: espejo de parseApprovalCustomId/resolveAgentId en
// src/app/api/agents/discord-interactions/route.ts — mantener en sync.
//
// Run: node tests/agents/discord-custom-id.test.mjs

import { strict as assert } from 'node:assert'

// ── Reimplementación (pure logic) ─────────────────────────────────────────────

function parseApprovalCustomId(customId) {
  if (!customId.startsWith('baw:')) return null
  const parts = customId.split(':')

  let action
  let approvalId
  if (parts[1] === 'approval') {
    action = parts[2]
    approvalId = parts[3]
  } else if (parts[2] === 'approval') {
    action = parts[3]
    approvalId = parts[4]
  } else {
    return null
  }

  if (!approvalId || (action !== 'grant' && action !== 'deny')) return null
  return { action, approvalId }
}

// BAW-26: el default es el operador (Hugo) y los agentes retirados (Alicia) se
// enrutan al operador. Espejo de OPERATOR_AGENT_ID / RETIRED_AGENT_IDS en
// src/lib/agents/roster.ts.
const OPERATOR_AGENT_ID = 'hugo-cos'
const RETIRED_AGENT_IDS = new Set(['alicia-ops'])

function resolveAgentId(customId) {
  if (customId.startsWith('baw:')) {
    const parts = customId.split(':')
    if (parts[1] && parts[1] !== 'approval') {
      return RETIRED_AGENT_IDS.has(parts[1]) ? OPERATOR_AGENT_ID : parts[1]
    }
  }
  return OPERATOR_AGENT_ID
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed += 1
    console.error(`  ✗ ${name}`)
    console.error(`    ${err.message}`)
  }
}

const APPROVAL_ID = 'a1b2c3d4-0000-0000-0000-000000000000'

test('canónico grant: baw:<agent_id>:approval:grant:<id>', () => {
  const r = parseApprovalCustomId(`baw:alicia-ops:approval:grant:${APPROVAL_ID}`)
  assert.deepEqual(r, { action: 'grant', approvalId: APPROVAL_ID })
})

test('canónico deny: baw:<agent_id>:approval:deny:<id>', () => {
  const r = parseApprovalCustomId(`baw:alicia-ops:approval:deny:${APPROVAL_ID}`)
  assert.deepEqual(r, { action: 'deny', approvalId: APPROVAL_ID })
})

test('legacy grant: baw:approval:grant:<id>', () => {
  const r = parseApprovalCustomId(`baw:approval:grant:${APPROVAL_ID}`)
  assert.deepEqual(r, { action: 'grant', approvalId: APPROVAL_ID })
})

test('legacy deny: baw:approval:deny:<id>', () => {
  const r = parseApprovalCustomId(`baw:approval:deny:${APPROVAL_ID}`)
  assert.deepEqual(r, { action: 'deny', approvalId: APPROVAL_ID })
})

test('acción inválida → null', () => {
  assert.equal(parseApprovalCustomId(`baw:alicia-ops:approval:explode:${APPROVAL_ID}`), null)
  assert.equal(parseApprovalCustomId(`baw:approval:explode:${APPROVAL_ID}`), null)
})

test('sin approval_id → null', () => {
  assert.equal(parseApprovalCustomId('baw:approval:grant'), null)
  assert.equal(parseApprovalCustomId('baw:alicia-ops:approval:grant'), null)
})

test('custom_id no-approval → null', () => {
  assert.equal(parseApprovalCustomId('baw:alicia-ops:task:view:123'), null)
  assert.equal(parseApprovalCustomId('otracosa:approval:grant:123'), null)
})

test('resolveAgentId: canónico devuelve el agent_id', () => {
  assert.equal(resolveAgentId(`baw:hugo-cos:approval:grant:${APPROVAL_ID}`), 'hugo-cos')
})

test('resolveAgentId: legacy NO devuelve "approval" como agent_id', () => {
  assert.equal(resolveAgentId(`baw:approval:grant:${APPROVAL_ID}`), 'hugo-cos')
})

test('resolveAgentId: custom_id vacío → default hugo-cos (operador)', () => {
  assert.equal(resolveAgentId(''), 'hugo-cos')
})

test('resolveAgentId: botón viejo de Alicia (retirada) → hugo-cos', () => {
  assert.equal(resolveAgentId('baw:alicia-ops:task:view:123'), 'hugo-cos')
})

console.log('')
console.log(`${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
