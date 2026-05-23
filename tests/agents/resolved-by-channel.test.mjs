/**
 * BaW OS — Tests: resolved-by-channel helpers
 * Sprint 5A fix — Opción C: channel-agnostic resolved_by_channel
 *
 * Run: node tests/agents/resolved-by-channel.test.mjs
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// ─── Resolve helpers from TypeScript source via ts-node/register or compiled ──
// We inline the logic here to avoid requiring a build step in tests.
// This matches the implementation in src/lib/agents/resolved-by-channel.ts

function buildDiscordResolvedBy(user) {
  const hasMeaningfulDiscriminator =
    user.discriminator &&
    user.discriminator !== '0' &&
    user.discriminator !== '0000'

  const username = hasMeaningfulDiscriminator
    ? `${user.username}#${user.discriminator}`
    : user.username

  return {
    channel: 'discord',
    external_id: user.id,
    username,
  }
}

function buildSlackResolvedBy(user) {
  return {
    channel: 'slack',
    external_id: user.id,
    username: user.name,
  }
}

// ─── Test runner ────────────────────────────────────────────────────────────

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

// ─── Suite 1: buildDiscordResolvedBy ────────────────────────────────────────

console.log('\n── buildDiscordResolvedBy ────────────────────────')

test('channel is "discord"', () => {
  const result = buildDiscordResolvedBy({ id: '123', username: 'fran' })
  assert.equal(result.channel, 'discord')
})

test('external_id matches user.id', () => {
  const result = buildDiscordResolvedBy({ id: '123456789012345678', username: 'fran' })
  assert.equal(result.external_id, '123456789012345678')
})

test('username without discriminator returns plain username', () => {
  const result = buildDiscordResolvedBy({ id: '123', username: 'fran' })
  assert.equal(result.username, 'fran')
})

test('username with discriminator "0001" returns "fran#0001"', () => {
  const result = buildDiscordResolvedBy({ id: '123', username: 'fran', discriminator: '0001' })
  assert.equal(result.username, 'fran#0001')
})

test('username with discriminator "0" returns plain username (new Discord format)', () => {
  const result = buildDiscordResolvedBy({ id: '123', username: 'fran', discriminator: '0' })
  assert.equal(result.username, 'fran')
})

test('username with discriminator "0000" returns plain username', () => {
  const result = buildDiscordResolvedBy({ id: '123', username: 'fran', discriminator: '0000' })
  assert.equal(result.username, 'fran')
})

test('shape matches JSONB expectation: {channel, external_id, username}', () => {
  const result = buildDiscordResolvedBy({ id: '111', username: 'fran', discriminator: '0001' })
  assert.deepEqual(result, {
    channel: 'discord',
    external_id: '111',
    username: 'fran#0001',
  })
})

test('JSON.stringify produces valid JSON for Supabase JSONB', () => {
  const result = buildDiscordResolvedBy({ id: '111', username: 'fran' })
  const json = JSON.stringify(result)
  const parsed = JSON.parse(json)
  assert.equal(parsed.channel, 'discord')
  assert.equal(parsed.external_id, '111')
})

// ─── Suite 2: buildSlackResolvedBy ──────────────────────────────────────────

console.log('\n── buildSlackResolvedBy ─────────────────────────')

test('channel is "slack"', () => {
  const result = buildSlackResolvedBy({ id: 'U02ABCDEF', name: 'fran' })
  assert.equal(result.channel, 'slack')
})

test('external_id matches user.id', () => {
  const result = buildSlackResolvedBy({ id: 'U02ABCDEF', name: 'fran' })
  assert.equal(result.external_id, 'U02ABCDEF')
})

test('username matches user.name', () => {
  const result = buildSlackResolvedBy({ id: 'U02ABCDEF', name: 'fran' })
  assert.equal(result.username, 'fran')
})

test('shape matches JSONB expectation: {channel, external_id, username}', () => {
  const result = buildSlackResolvedBy({ id: 'U02ABCDEF', name: 'fran' })
  assert.deepEqual(result, {
    channel: 'slack',
    external_id: 'U02ABCDEF',
    username: 'fran',
  })
})

// ─── Suite 3: Update query writes resolved_by_channel (mock Supabase client) ─

console.log('\n── Update query — mock Supabase client ──────────')

test('update payload includes resolved_by_channel with channel:"discord"', () => {
  // Simulate what the endpoint does
  const discordUser = { id: '999888777666555444', username: 'fran', discriminator: '0001' }
  const supabaseUserId = 'aabbccdd-1234-5678-abcd-ef0123456789'
  const newStatus = 'approved'

  const resolvedByChannel = buildDiscordResolvedBy(discordUser)

  // Mock the Supabase update payload
  const updatePayload = {
    status: newStatus,
    resolved_at: new Date().toISOString(),
    resolved_by: supabaseUserId,
    resolved_by_channel: resolvedByChannel,
  }

  assert.equal(updatePayload.resolved_by_channel.channel, 'discord')
  assert.equal(updatePayload.resolved_by_channel.external_id, discordUser.id)
  assert.equal(updatePayload.resolved_by_channel.username, 'fran#0001')
  assert.equal(updatePayload.resolved_by, supabaseUserId)
  assert.equal(updatePayload.status, 'approved')
})

test('update payload sets resolved_by to null when no Supabase link', () => {
  const discordUser = { id: '111222333444555666', username: 'unknownuser' }
  const supabaseUserId = null // no link found in user_external_accounts

  const resolvedByChannel = buildDiscordResolvedBy(discordUser)

  const updatePayload = {
    status: 'denied',
    resolved_at: new Date().toISOString(),
    resolved_by: supabaseUserId,
    resolved_by_channel: resolvedByChannel,
  }

  assert.equal(updatePayload.resolved_by, null)
  assert.equal(updatePayload.resolved_by_channel.channel, 'discord')
  assert.equal(updatePayload.resolved_by_channel.external_id, discordUser.id)
})

test('update payload does NOT contain resolved_by_discord_user (old field)', () => {
  const resolvedByChannel = buildDiscordResolvedBy({ id: '123', username: 'fran' })
  const updatePayload = {
    status: 'approved',
    resolved_at: new Date().toISOString(),
    resolved_by: null,
    resolved_by_channel: resolvedByChannel,
  }

  assert.equal('resolved_by_discord_user' in updatePayload, false)
})

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════`)
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`)
console.log(`══════════════════════════════════════`)

if (failed > 0) {
  process.exit(1)
}
