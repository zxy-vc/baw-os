/**
 * BaW OS — Agent Attribution (Sprint 5A WS-1)
 *
 * Helpers para agregar el badge "via Alicia" a respuestas Discord y
 * a campos de notas/metadata cuando un agente third-party crea registros.
 *
 * Principio (Fran verbatim): "Solo existe un humano, que soy yo."
 * — los agentes NUNCA se refieren a sí mismos como personas.
 */

import type { AgentId } from './types'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

export interface AgentAttribution {
  agentId: AgentId
  /** Nombre display del agente para UI/mensajes */
  agentDisplayName: string
  /** Canal desde el que operó el agente */
  channel: 'discord' | 'slack' | 'api' | 'whatsapp' | 'telegram'
  /** URL del mensaje Discord original (si aplica) */
  discordMessageUrl?: string
  /** ID de la interacción Discord (para linking back) */
  interactionId?: string
}

/** Metadata que se almacena en JSONB de registros (reservations, incidents, tasks) */
export interface AgentAttributionMeta {
  agent_id: string
  agent_display_name: string
  channel: string
  discord_message_url?: string
  interaction_id?: string
  attributed_at: string // ISO timestamp
}

// ─────────────────────────────────────────────────────────────
// Display names canónicos (sincronizados con tabla agents)
// ─────────────────────────────────────────────────────────────

const AGENT_DISPLAY_NAMES: Partial<Record<AgentId, string>> = {
  'alicia-ops': 'Alicia',
  'hugo-cos': 'Hugo',
  'conta-beto': 'Beto',
  'maribel-law': 'Maribel',
  'luis-growth': 'Luis',
  'andres-tech': 'Andrés',
}

export function getAgentDisplayName(agentId: AgentId): string {
  return AGENT_DISPLAY_NAMES[agentId] ?? agentId
}

// ─────────────────────────────────────────────────────────────
// Attribution para mensajes Discord (embed footer)
// ─────────────────────────────────────────────────────────────

/**
 * Genera el texto de footer para respuestas Discord de agentes.
 * Ejemplo: "via Alicia · BaW OS Agent · Discord"
 */
export function discordAttributionFooter(attr: AgentAttribution): string {
  const name = attr.agentDisplayName || getAgentDisplayName(attr.agentId)
  const channel = channelLabel(attr.channel)
  return `via ${name} · BaW OS Agent · ${channel}`
}

/**
 * Construye un embed Discord con footer de atribución de agente.
 * Compatible con Discord Interactions API (embeds en respuestas).
 */
export function withAgentDiscordEmbed(
  embed: DiscordEmbed,
  attr: AgentAttribution
): DiscordEmbed {
  const footer: DiscordEmbedFooter = {
    text: discordAttributionFooter(attr),
  }

  const enrichedEmbed: DiscordEmbed = {
    ...embed,
    footer,
    timestamp: new Date().toISOString(),
  }

  if (attr.discordMessageUrl) {
    enrichedEmbed.url = attr.discordMessageUrl
  }

  return enrichedEmbed
}

/**
 * Agrega atribución como mensaje de texto plano con footer.
 * Útil cuando el agente responde con content (no embed).
 */
export function withAgentAttribution(
  message: string,
  attr: AgentAttribution
): string {
  const footer = discordAttributionFooter(attr)
  return `${message}\n\n-# ${footer}`
}

// ─────────────────────────────────────────────────────────────
// Attribution metadata para DB (JSONB)
// ─────────────────────────────────────────────────────────────

/**
 * Genera el objeto de metadata que se almacena en el campo JSONB
 * de un registro (incidents.metadata, tasks.metadata, etc.)
 * para atribución de agente.
 */
export function buildAttributionMeta(attr: AgentAttribution): AgentAttributionMeta {
  return {
    agent_id: attr.agentId,
    agent_display_name: attr.agentDisplayName || getAgentDisplayName(attr.agentId),
    channel: attr.channel,
    discord_message_url: attr.discordMessageUrl,
    interaction_id: attr.interactionId,
    attributed_at: new Date().toISOString(),
  }
}

/**
 * Merge de attribution metadata con metadata existente de un registro.
 * Preserva campos existentes.
 */
export function mergeAttributionIntoMeta(
  existingMeta: Record<string, unknown> | null | undefined,
  attr: AgentAttribution
): Record<string, unknown> {
  return {
    ...(existingMeta ?? {}),
    agent_attribution: buildAttributionMeta(attr),
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────

function channelLabel(channel: AgentAttribution['channel']): string {
  const labels: Record<AgentAttribution['channel'], string> = {
    discord: 'Discord',
    slack: 'Slack',
    api: 'API',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
  }
  return labels[channel] ?? channel
}

// ─────────────────────────────────────────────────────────────
// Tipos Discord mínimos (no depende de lib externa)
// ─────────────────────────────────────────────────────────────

export interface DiscordEmbedFooter {
  text: string
  icon_url?: string
}

export interface DiscordEmbedField {
  name: string
  value: string
  inline?: boolean
}

export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
  footer?: DiscordEmbedFooter
  fields?: DiscordEmbedField[]
  timestamp?: string
  thumbnail?: { url: string }
  image?: { url: string }
}
