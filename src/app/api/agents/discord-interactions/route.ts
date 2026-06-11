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
import { dispatchApprovedAction } from '@/lib/agents/v1/dispatcher'

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

  // Formato canónico: "baw:<agent_id>:<action>:<payload...>" (ADR-021 D4)
  // Formato legacy: "baw:approval:<grant|deny>:<id>" — sin agent_id, no confundir
  if (customId.startsWith('baw:')) {
    const parts = customId.split(':')
    if (parts[1] && parts[1] !== 'approval') return parts[1]
  }

  // Default: alicia-ops (única agente third-party conectada en Sprint 5A)
  return 'alicia-ops'
}

interface ApprovalCustomId {
  action: 'grant' | 'deny'
  approvalId: string
}

/**
 * Parsea el custom_id de botones de aprobación.
 * Canónico: baw:<agent_id>:approval:<grant|deny>:<approval_id>
 * Legacy:   baw:approval:<grant|deny>:<approval_id>
 */
function parseApprovalCustomId(customId: string): ApprovalCustomId | null {
  if (!customId.startsWith('baw:')) return null
  const parts = customId.split(':')

  let action: string | undefined
  let approvalId: string | undefined
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

/** Respuesta efímera (solo visible para quien hizo click). */
function ephemeralMessage(content: string): NextResponse {
  return NextResponse.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: 64 },
  })
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

    // Procesamos aprobaciones inline (mismo contrato que /v1/approvals/:id/grant|deny)
    const isApprovalComponent =
      customId.startsWith('baw:approval:') || customId.split(':')[2] === 'approval'
    if (isApprovalComponent) {
      const parsed = parseApprovalCustomId(customId)
      if (!parsed) {
        return ephemeralMessage('⚠️ ID de aprobación inválido.')
      }
      const { action, approvalId } = parsed

      try {
        const supabase = createServiceClient()
        const discordUserId =
          interaction.member?.user?.id ?? interaction.user?.id ?? 'unknown'
        const nowIso = new Date().toISOString()

        const { data: approval, error: loadError } = await supabase
          .from('agent_approvals')
          .select('id, org_id, agent_id, action_type, payload, status, expires_at')
          .eq('id', approvalId)
          .maybeSingle()

        if (loadError) throw loadError
        if (!approval) {
          return ephemeralMessage('⚠️ Aprobación no encontrada.')
        }
        if (approval.status !== 'pending') {
          return ephemeralMessage(
            `⚠️ Esta solicitud ya fue resuelta (estado: ${approval.status}).`
          )
        }
        if (new Date(approval.expires_at as string).getTime() < Date.now()) {
          await supabase
            .from('agent_approvals')
            .update({ status: 'expired', resolved_at: nowIso })
            .eq('id', approvalId)
            .eq('status', 'pending')
          return ephemeralMessage('⚠️ La solicitud expiró antes de resolverse.')
        }

        if (action === 'deny') {
          const { error } = await supabase
            .from('agent_approvals')
            .update({
              status: 'denied',
              resolved_at: nowIso,
              resolved_by_discord_user: discordUserId,
            })
            .eq('id', approvalId)
            .eq('status', 'pending') // Solo pendientes — previene doble-click
          if (error) throw error

          return NextResponse.json({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              content: '❌ Solicitud **denegada**.',
              components: [], // Elimina los botones del mensaje original
            },
          })
        }

        // grant: ejecutar la acción aprobada vía dispatcher
        const dispatch = await dispatchApprovedAction({
          approvalId,
          orgId: approval.org_id as string,
          agentId: approval.agent_id as string,
          actionType: approval.action_type as string,
          payload: (approval.payload as Record<string, unknown>) || {},
          resolvedBy: `discord:${discordUserId}`,
        })

        // Persistir resolución (si dispatch falla, mantenemos pending para retry)
        await supabase
          .from('agent_approvals')
          .update({
            status: dispatch.ok ? 'granted' : 'pending',
            resolved_at: dispatch.ok ? nowIso : null,
            resolved_by_discord_user: dispatch.ok ? discordUserId : null,
            result: dispatch.ok
              ? (dispatch.result as object)
              : ({ error: dispatch.error } as object),
          })
          .eq('id', approvalId)
          .eq('status', 'pending')

        // Audit como agent_run + agent_action (mismo patrón que /v1 grant)
        const { data: run } = await supabase
          .from('agent_runs')
          .insert({
            org_id: approval.org_id,
            agent_id: approval.agent_id,
            triggered_by: 'agent',
            status: dispatch.ok ? 'succeeded' : 'failed',
            input: {
              approval_id: approvalId,
              action_type: approval.action_type,
              resolved_via: 'discord',
            } as object,
            output: dispatch.ok
              ? ((dispatch.result || {}) as object)
              : ({ error: dispatch.error } as object),
            finished_at: nowIso,
            error: dispatch.ok ? null : dispatch.error,
          })
          .select('id')
          .single()

        if (run) {
          await supabase.from('agent_actions').insert({
            run_id: run.id as string,
            org_id: approval.org_id,
            agent_id: approval.agent_id,
            action_type: approval.action_type,
            entity_type: dispatch.entityType ?? null,
            entity_id: dispatch.entityId ?? null,
            status: dispatch.ok ? 'ok' : 'failed',
            payload: (approval.payload || {}) as object,
            result: (dispatch.result || {}) as object,
            error: dispatch.error ?? null,
          })
        }

        if (!dispatch.ok) {
          return ephemeralMessage(
            `⚠️ Aprobación recibida pero la ejecución falló: ${dispatch.error}. La solicitud sigue pendiente.`
          )
        }

        return NextResponse.json({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            content: '✅ Solicitud **aprobada** y ejecutada.',
            components: [], // Elimina los botones del mensaje original
          },
        })
      } catch (err) {
        console.error('approval resolution failed:', err)
        return ephemeralMessage('⚠️ Error al procesar la aprobación. Intenta de nuevo.')
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
