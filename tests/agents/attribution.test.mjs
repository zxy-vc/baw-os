// BaW OS — Tests de atribución de agentes (Sprint 5A WS-1)
// Pure-logic: tests de discordAttributionFooter, withAgentAttribution, buildAttributionMeta.
//
// Run: node tests/agents/attribution.test.mjs

import { strict as assert } from 'node:assert'

// ── Reimplementación de attribution.ts (pure logic) ──────────────────────────

const AGENT_DISPLAY_NAMES = {
  'alicia-ops': 'Alicia',
  'hugo-cos': 'Hugo',
  'conta-beto': 'Beto',
  'maribel-law': 'Maribel',
  'luis-growth': 'Luis',
  'andres-tech': 'Andrés',
}

function getAgentDisplayName(agentId) {
  return AGENT_DISPLAY_NAMES[agentId] ?? agentId
}

function channelLabel(channel) {
  const labels = {
    discord: 'Discord',
    slack: 'Slack',
    api: 'API',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
  }
  return labels[channel] ?? channel
}

function discordAttributionFooter(attr) {
  const name = attr.agentDisplayName || getAgentDisplayName(attr.agentId)
  const channel = channelLabel(attr.channel)
  return `via ${name} · BaW OS Agent · ${channel}`
}

function withAgentAttribution(message, attr) {
  const footer = discordAttributionFooter(attr)
  return `${message}\n\n-# ${footer}`
}

function withAgentDiscordEmbed(embed, attr) {
  const footer = { text: discordAttributionFooter(attr) }
  const enrichedEmbed = { ...embed, footer, timestamp: new Date().toISOString() }
  if (attr.discordMessageUrl) enrichedEmbed.url = attr.discordMessageUrl
  return enrichedEmbed
}

function buildAttributionMeta(attr) {
  return {
    agent_id: attr.agentId,
    agent_display_name: attr.agentDisplayName || getAgentDisplayName(attr.agentId),
    channel: attr.channel,
    discord_message_url: attr.discordMessageUrl,
    interaction_id: attr.interactionId,
    attributed_at: new Date().toISOString(),
  }
}

function mergeAttributionIntoMeta(existingMeta, attr) {
  return { ...(existingMeta ?? {}), agent_attribution: buildAttributionMeta(attr) }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

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

console.log('attribution.test.mjs — Agent attribution badges\n')

const aliciaAttr = {
  agentId: 'alicia-ops',
  agentDisplayName: 'Alicia',
  channel: 'discord',
  discordMessageUrl: 'https://discord.com/channels/123/456/789',
  interactionId: 'discord-interaction-001',
}

// ── 1. Footer text correcto ───────────────────────────────────────────────────
test('discordAttributionFooter: formato correcto para Alicia', () => {
  const footer = discordAttributionFooter(aliciaAttr)
  assert.equal(footer, 'via Alicia · BaW OS Agent · Discord')
})

// ── 2. Footer usa agentId como fallback si no hay displayName ─────────────────
test('discordAttributionFooter: usa agentId si no hay displayName', () => {
  const footer = discordAttributionFooter({ agentId: 'alicia-ops', channel: 'discord' })
  assert.equal(footer, 'via Alicia · BaW OS Agent · Discord')
})

test('discordAttributionFooter: agentId desconocido se usa literal', () => {
  const footer = discordAttributionFooter({ agentId: 'unknown-agent', channel: 'slack' })
  assert.equal(footer, 'via unknown-agent · BaW OS Agent · Slack')
})

// ── 3. withAgentAttribution agrega footer al mensaje ─────────────────────────
test('withAgentAttribution: footer se agrega con formato markdown', () => {
  const result = withAgentAttribution('Lista de incidencias: D104 - Fuga', aliciaAttr)
  assert.ok(result.startsWith('Lista de incidencias: D104 - Fuga'))
  assert.ok(result.includes('-# via Alicia · BaW OS Agent · Discord'))
})

// ── 4. Alicia no es referenciada como humana ──────────────────────────────────
test('attribution NO usa "persona" ni "humano" en el texto', () => {
  const footer = discordAttributionFooter(aliciaAttr)
  const msg = withAgentAttribution('Test', aliciaAttr)
  assert.ok(!footer.toLowerCase().includes('persona'))
  assert.ok(!footer.toLowerCase().includes('humano'))
  assert.ok(!msg.toLowerCase().includes('persona'))
  // Verifica que dice "Agent" (no "Human" ni "Person")
  assert.ok(footer.includes('Agent'))
})

// ── 5. withAgentDiscordEmbed preserva el embed original ──────────────────────
test('withAgentDiscordEmbed: preserva título y description originales', () => {
  const original = {
    title: 'Incidencias D104',
    description: '2 incidencias abiertas',
    color: 0xff0000,
  }
  const enriched = withAgentDiscordEmbed(original, aliciaAttr)
  assert.equal(enriched.title, 'Incidencias D104')
  assert.equal(enriched.description, '2 incidencias abiertas')
  assert.equal(enriched.color, 0xff0000)
})

test('withAgentDiscordEmbed: agrega footer con texto correcto', () => {
  const enriched = withAgentDiscordEmbed({}, aliciaAttr)
  assert.ok(enriched.footer)
  assert.equal(enriched.footer.text, 'via Alicia · BaW OS Agent · Discord')
})

test('withAgentDiscordEmbed: agrega url del mensaje Discord si disponible', () => {
  const enriched = withAgentDiscordEmbed({}, aliciaAttr)
  assert.equal(enriched.url, 'https://discord.com/channels/123/456/789')
})

test('withAgentDiscordEmbed: no agrega url si no hay discordMessageUrl', () => {
  const enriched = withAgentDiscordEmbed({}, {
    agentId: 'alicia-ops',
    agentDisplayName: 'Alicia',
    channel: 'discord',
  })
  assert.equal(enriched.url, undefined)
})

test('withAgentDiscordEmbed: agrega timestamp ISO', () => {
  const enriched = withAgentDiscordEmbed({}, aliciaAttr)
  assert.ok(enriched.timestamp)
  assert.ok(!isNaN(new Date(enriched.timestamp).getTime()))
})

// ── 6. buildAttributionMeta para DB ──────────────────────────────────────────
test('buildAttributionMeta: estructura correcta', () => {
  const meta = buildAttributionMeta(aliciaAttr)
  assert.equal(meta.agent_id, 'alicia-ops')
  assert.equal(meta.agent_display_name, 'Alicia')
  assert.equal(meta.channel, 'discord')
  assert.equal(meta.discord_message_url, 'https://discord.com/channels/123/456/789')
  assert.equal(meta.interaction_id, 'discord-interaction-001')
  assert.ok(meta.attributed_at)
  assert.ok(!isNaN(new Date(meta.attributed_at).getTime()))
})

// ── 7. mergeAttributionIntoMeta preserva metadata existente ──────────────────
test('mergeAttributionIntoMeta: preserva campos existentes', () => {
  const existing = { source: 'manual', priority: 'high' }
  const merged = mergeAttributionIntoMeta(existing, aliciaAttr)
  assert.equal(merged.source, 'manual')
  assert.equal(merged.priority, 'high')
  assert.ok(merged.agent_attribution)
  assert.equal(merged.agent_attribution.agent_id, 'alicia-ops')
})

test('mergeAttributionIntoMeta: funciona con metadata null', () => {
  const merged = mergeAttributionIntoMeta(null, aliciaAttr)
  assert.ok(merged.agent_attribution)
})

test('mergeAttributionIntoMeta: funciona con metadata undefined', () => {
  const merged = mergeAttributionIntoMeta(undefined, aliciaAttr)
  assert.ok(merged.agent_attribution)
})

// ── 8. Channel labels ────────────────────────────────────────────────────────
test('channel label Discord correcto', () => {
  assert.equal(channelLabel('discord'), 'Discord')
})
test('channel label Slack correcto', () => {
  assert.equal(channelLabel('slack'), 'Slack')
})
test('channel label API correcto', () => {
  assert.equal(channelLabel('api'), 'API')
})
test('channel label desconocido: se usa literal', () => {
  assert.equal(channelLabel('matrix'), 'matrix')
})

// ── Resumen ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
