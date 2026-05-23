/**
 * BaW OS — Discord Interactions Endpoint (Sprint 5A WS-1)
 * POST /api/agents/discord-interactions
 *
 * Arquitectura:
 *  1. Verifica firma Ed25519 (Web Crypto, sin deps externas)
 *  2. Responde PING de Discord (health check)
 *  3. Para APPLICATION_COMMAND y MESSAGE_COMPONENT:
 *     - Responde inmediatamente con DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE (dentro de 3s)
 *     - Loggea interacción en agent_interactions
 *     - Despacha procesamiento async (fire-and-forget, no bloquea la respuesta)
 *  4. Route al handler según agent_id (custom_id o channel_id)
 *
 * Ref: https://discord.com/developers/docs/interactions/receiving-and-responding
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { verifyDiscordRequest } from '@/lib/agents/discord-verify'
import { getAgentDisplayName } from '@/lib/agents/attribution'
import { buildDiscordResolvedBy } from '@/lib/agents/resolved-by-channel'

export const runtime = 'nodejs'

// ─────────────────────────────────────────────────────────────
// Tipos Discord (subset de la API necesario para este endpoint)
// ─────────────────────────────────────────────────────────────

const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
} as const

interface DiscordInteraction {
  id: string
  type: number
  token: string
  application_id: string
  guild_id?: string
  channel_id?: string
  member?: { user?: { id: string; username: string } }
  user?: { id: string; username: string }
  data?: {
    id?: string
    name?: string
    custom_id?: string
    component_type?: number
    options?: Array<{ name: string; value: unknown }>
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Resuelve el agent_id desde la interacción Discord.
 * Estrategia: busca en custom_id (componentes) → guild custom data → default Alicia.
 * En Sprint 5A solo Alicia está conectada.
 */
function resolveAgentId(interaction: DiscordInteraction): string {
  const customId = interaction.data?.custom_id ?? ''

  // Formato custom_id: "baw:<agent_id>:<action>:<payload...>"
  if (customId.startsWith('baw:')) {
    const parts = customId.split(':')
    if (parts[1]) return parts[1]
  }

  // Default: alicia-ops (única agente third-party conectada en Sprint 5A)
  return 'alicia-ops'
}

/**
 * Loggea la interacción en la tabla agent_interactions (fire-and-forget).
 * No lanza errores — el endpoint no debe fallar por un log.
 */
async function logInteraction(
  interaction: DiscordInteraction,
  agentId: string,
  typeName: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from('agent_interactions').insert({
      agent_id: agentId,
      channel: 'discord',
      channel_id: interaction.channel_id ?? null,
      interaction_type: typeName,
      interaction_id: interaction.id,
      discord_guild_id: interaction.guild_id ?? null,
      discord_user_id:
        interaction.member?.user?.id ?? interaction.user?.id ?? null,
      payload,
      status: 'deferred',
    })
  } catch (err) {
    console.error('agent_interactions log failed:', err)
  }
}

/**
 * Despacha el procesamiento async de la interacción.
 * En Vercel (serverless), usamos un fetch a la propia API para que el
 * procesamiento ocurra en una función separada sin bloquear los 3s Discord.
 *
 * El token Discord se necesita para el followup via Discord webhook.
 */
async function dispatchAsync(
  interaction: DiscordInteraction,
  agentId: string,
  rawBody: string
): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://baw-os.vercel.app'
    // Este endpoint lo crearemos en WS-1 continuación (procesamiento async)
    await fetch(`${baseUrl}/api/agents/discord-interactions/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.INTERNAL_WEBHOOK_SECRET ?? ''}`,
      },
      body: JSON.stringify({
        interaction_id: interaction.id,
        interaction_token: interaction.token,
        agent_id: agentId,
        raw_interaction: JSON.parse(rawBody),
      }),
      // No esperamos respuesta — fire and forget
      signal: AbortSignal.timeout(100),
    }).catch(() => {
      // El timeout intencional hace que este catch se dispare; es OK
    })
  } catch {
    // Silencio intencional — no bloquear respuesta Discord
  }
}

// ─────────────────────────────────────────────────────────────
// Route handler principal
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const publicKeyHex = process.env.DISCORD_PUBLIC_KEY

  if (!publicKeyHex) {
    console.error('DISCORD_PUBLIC_KEY env var not set')
    return NextResponse.json(
      { error: 'Server misconfiguration' },
      { status: 500 }
    )
  }

  // ── 1. Verificar firma Ed25519 ────────────────────────────
  const verification = await verifyDiscordRequest(req, publicKeyHex)

  if (!verification.valid) {
    return NextResponse.json(
      { error: 'Invalid request signature' },
      { status: 401 }
    )
  }

  const { rawBody } = verification

  let interaction: DiscordInteraction
  try {
    interaction = JSON.parse(rawBody) as DiscordInteraction
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // ── 2. PING — respuesta obligatoria para activar bot Discord ──
  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG })
  }

  // ── 3. APPLICATION_COMMAND ────────────────────────────────
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const agentId = resolveAgentId(interaction)
    const agentName = getAgentDisplayName(agentId as Parameters<typeof getAgentDisplayName>[0])

    void logInteraction(
      interaction,
      agentId,
      'APPLICATION_COMMAND',
      JSON.parse(rawBody) as Record<string, unknown>
    )

    void dispatchAsync(interaction, agentId, rawBody)

    // Responder en <3s con deferred — Alicia procesará y hará followup
    return NextResponse.json({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: 0, // 64 = ephemeral; 0 = visible en canal
      },
    })
  }

  // ── 4. MESSAGE_COMPONENT (botones Aprobar/Denegar) ────────
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const agentId = resolveAgentId(interaction)
    const customId = interaction.data?.custom_id ?? ''

    void logInteraction(
      interaction,
      agentId,
      'MESSAGE_COMPONENT',
      JSON.parse(rawBody) as Record<string, unknown>
    )

    // Procesamos aprobaciones inline (grant/deny son idempotentes y rápidos)
    if (customId.startsWith('baw:approval:')) {
      // Formato: baw:approval:grant:<approval_id> | baw:approval:deny:<approval_id>
      const parts = customId.split(':')
      const action = parts[2] as 'grant' | 'deny'
      const approvalId = parts[3]

      if (!approvalId || !['grant', 'deny'].includes(action)) {
        return NextResponse.json(
          {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '⚠️ ID de aprobación inválido.',
              flags: 64, // ephemeral
            },
          }
        )
      }

      // Ejecutar grant/deny en agent_approvals
      try {
        const supabase = createServiceClient()
        const newStatus = action === 'grant' ? 'approved' : 'denied'

        const discordUser = interaction.member?.user ?? interaction.user
        const discordUserId = discordUser?.id ?? 'unknown'

        // Lookup Supabase user vinculado al ID de Discord (si existe)
        let supabaseUserId: string | null = null
        if (discordUserId !== 'unknown') {
          const { data: externalAccount } = await supabase
            .from('user_external_accounts')
            .select('user_id')
            .eq('provider', 'discord')
            .eq('external_id', discordUserId)
            .maybeSingle()
          supabaseUserId = externalAccount?.user_id ?? null
        }

        const resolvedByChannel = buildDiscordResolvedBy({
          id: discordUserId,
          username: discordUser?.username ?? 'unknown',
          discriminator: (discordUser as { id: string; username: string; discriminator?: string } | undefined)?.discriminator,
        })

        const { error } = await supabase
          .from('agent_approvals')
          .update({
            status: newStatus,
            resolved_at: new Date().toISOString(),
            resolved_by: supabaseUserId,
            resolved_by_channel: resolvedByChannel,
          })
          .eq('id', approvalId)
          .eq('status', 'pending') // Solo pendientes — previene doble-click

        if (error) throw error

        const emoji = action === 'grant' ? '✅' : '❌'
        const label = action === 'grant' ? 'aprobado' : 'denegado'

        return NextResponse.json({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            content: `${emoji} Solicitud **${label}**.`,
            components: [], // Elimina los botones del mensaje original
          },
        })
      } catch (err) {
        console.error('approval resolution failed:', err)
        return NextResponse.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '⚠️ Error al procesar la aprobación. Intenta de nuevo.',
            flags: 64,
          },
        })
      }
    }

    // Otros componentes: deferred
    void dispatchAsync(interaction, agentId, rawBody)
    return NextResponse.json({
      type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
    })
  }

  // ── 5. Tipos no soportados ────────────────────────────────
  return NextResponse.json(
    { error: `Interaction type ${interaction.type} not handled` },
    { status: 400 }
  )
}
