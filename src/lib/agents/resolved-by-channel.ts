/**
 * BaW OS — resolved-by-channel helpers
 *
 * Proporciona tipos y builders para la columna `agent_approvals.resolved_by_channel` (jsonb).
 * Diseñado para ser extensible a múltiples canales (Discord, Slack, WhatsApp, etc.)
 * sin romper el schema existente.
 *
 * Forma esperada en DB:
 *   Discord: { "channel": "discord", "external_id": "123456789012345678", "username": "fran#0001" }
 *   Slack:   { "channel": "slack",   "external_id": "U02ABCDEF",           "username": "fran" }
 *   Web:     NULL  (o { "channel": "web", "external_id": null } si se requiere audit trail)
 */

// ─────────────────────────────────────────────────────────────
// Tipo canónico
// ─────────────────────────────────────────────────────────────

export type ResolvedByChannel =
  | { channel: 'discord'; external_id: string; username?: string }
  | { channel: 'slack';   external_id: string; username?: string }
  | { channel: 'web';     external_id?: null }

// ─────────────────────────────────────────────────────────────
// Builders
// ─────────────────────────────────────────────────────────────

/**
 * Construye el objeto `resolved_by_channel` para una resolución vía Discord.
 *
 * @param user - Objeto de usuario Discord (id, username, discriminator opcional).
 *   Si discriminator existe y no es "0" (nuevo formato Discord), se concatena como "#1234".
 *
 * @example
 *   buildDiscordResolvedBy({ id: '123', username: 'fran', discriminator: '0001' })
 *   // → { channel: 'discord', external_id: '123', username: 'fran#0001' }
 *
 *   buildDiscordResolvedBy({ id: '456', username: 'fran' })
 *   // → { channel: 'discord', external_id: '456', username: 'fran' }
 */
export function buildDiscordResolvedBy(user: {
  id: string
  username: string
  discriminator?: string
}): ResolvedByChannel {
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

/**
 * Construye el objeto `resolved_by_channel` para una resolución vía Slack.
 *
 * @param user - Objeto de usuario Slack (id, name).
 *
 * @example
 *   buildSlackResolvedBy({ id: 'U02ABCDEF', name: 'fran' })
 *   // → { channel: 'slack', external_id: 'U02ABCDEF', username: 'fran' }
 */
export function buildSlackResolvedBy(user: {
  id: string
  name: string
}): ResolvedByChannel {
  return {
    channel: 'slack',
    external_id: user.id,
    username: user.name,
  }
}
