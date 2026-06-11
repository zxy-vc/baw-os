/**
 * BaW OS — Procesamiento async de interacciones Discord (Sprint 5A MVP)
 * POST /api/agents/discord-interactions/process
 *
 * Lo invoca el endpoint principal de Discord Interactions vía dispatchAsync()
 * (fire-and-forget, autenticado con INTERNAL_WEBHOOK_SECRET). Flujo:
 *  1. Valida el bearer interno (timing-safe).
 *  2. Marca la interacción como 'processing' y backfillea org_id.
 *  3. Push webhooks-first al runtime del agente (ALICIA_WEBHOOK_URL, tunnel
 *     Cloudflare). El runtime procesa y responde a Discord vía followup.
 *  4. Si el push falla (runtime dormido/inaccesible), deja la interacción en
 *     'deferred' — la recoge el long-poll del skill (GET /v1/interactions) —
 *     y avisa en Discord que la solicitud quedó en cola.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { withAgentAttribution, getAgentDisplayName } from '@/lib/agents/attribution'
import type { AgentId } from '@/lib/agents/types'

export const runtime = 'nodejs'

const AGENT_PUSH_TIMEOUT_MS = 5_000

interface ProcessBody {
  interaction_id?: string
  interaction_token?: string
  agent_id?: string
  raw_interaction?: Record<string, unknown>
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_WEBHOOK_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return false
  return timingSafeEqual(auth.slice('Bearer '.length), secret)
}

/**
 * Followup a Discord usando el token de la interacción (válido 15 min).
 * Best-effort: un fallo aquí no debe romper el pipeline.
 */
async function discordFollowup(
  applicationId: string,
  interactionToken: string,
  content: string
): Promise<void> {
  try {
    await fetch(
      `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: AbortSignal.timeout(5_000),
      }
    )
  } catch (err) {
    console.error('discord followup failed:', err)
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: ProcessBody
  try {
    body = (await req.json()) as ProcessBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { interaction_id: interactionId, interaction_token: interactionToken } = body
  const agentId = body.agent_id ?? 'alicia-ops'
  const rawInteraction = body.raw_interaction ?? {}

  if (!interactionId || !interactionToken) {
    return NextResponse.json(
      { error: 'interaction_id and interaction_token are required' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  // ── 2. Backfill org_id + marcar processing ────────────────
  // logInteraction() inserta con org_id null; aquí lo resolvemos. MVP: una
  // sola org Discord-conectada (BaW Operations) vía env. El mapeo
  // guild_id → org queda como follow-up multi-tenant.
  const defaultOrgId = process.env.DISCORD_DEFAULT_ORG_ID ?? null

  const { data: interaction } = await supabase
    .from('agent_interactions')
    .update({
      status: 'processing',
      ...(defaultOrgId ? { org_id: defaultOrgId } : {}),
    })
    .eq('interaction_id', interactionId)
    .select('id, org_id, agent_id, payload')
    .maybeSingle()

  if (!interaction) {
    return NextResponse.json(
      { error: `interaction ${interactionId} not found` },
      { status: 404 }
    )
  }

  // ── 3. Push webhooks-first al runtime del agente ──────────
  const agentWebhookUrl = process.env.ALICIA_WEBHOOK_URL ?? ''
  let pushed = false

  if (agentWebhookUrl) {
    try {
      const res = await fetch(agentWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interaction_id: interactionId,
          interaction_token: interactionToken,
          agent_id: agentId,
          raw_interaction: rawInteraction,
        }),
        signal: AbortSignal.timeout(AGENT_PUSH_TIMEOUT_MS),
      })
      pushed = res.ok
    } catch {
      pushed = false
    }
  }

  if (pushed) {
    // El runtime confirmó recepción; él hace el followup a Discord y luego
    // cierra la interacción vía PATCH /v1/interactions/:id.
    return NextResponse.json({ ok: true, delivery: 'push' })
  }

  // ── 4. Fallback: deferred + aviso en Discord ──────────────
  await supabase
    .from('agent_interactions')
    .update({ status: 'deferred' })
    .eq('id', interaction.id as string)

  const applicationId =
    typeof rawInteraction.application_id === 'string'
      ? rawInteraction.application_id
      : null
  if (applicationId) {
    const displayName = getAgentDisplayName(agentId as AgentId)
    const content = withAgentAttribution(
      `⏳ ${displayName} está fuera de línea en este momento. Tu solicitud quedó en cola y se procesará en cuanto se reconecte.`,
      {
        agentId: agentId as AgentId,
        agentDisplayName: displayName,
        channel: 'discord',
        interactionId,
      }
    )
    await discordFollowup(applicationId, interactionToken, content)
  }

  return NextResponse.json({ ok: true, delivery: 'deferred' })
}
