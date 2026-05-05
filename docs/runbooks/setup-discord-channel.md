# Runbook — Discord channel `#baw-os-operations`

**Audience**: Fran (or delegated to Hugo)
**Estimated time**: 15 min
**Sprint**: 5A
**Prerequisite**: ZXY Ventures Discord server admin access

## Why

Sprint 5A connects Alicia (the only ZXY agent connecting to BaW OS) via a dedicated Discord channel. This is the primary operational interface during Sprint 5A. Fran types natural-language instructions; Alicia executes against BaW OS API.

## Steps

### 1. Create channel

Inside the ZXY Ventures Discord server:

- Create category: **`📦 BaW OS`** (if not present)
- Inside it, create text channel: **`#baw-os-operations`**
- Topic: `Operación BaW OS vía Alicia (ZXY Agent OS). Instrucciones en lenguaje natural.`
- Slow mode: off
- Permissions: only Fran (read/write), Alicia bot (read/write/embed/use-application-commands), Hugo bot (read-only — observe for cross-agent memory).

### 2. Confirm Alicia bot has access

- Alicia's existing bot user (the one running on M1) should be invited to this channel.
- Required permissions in the channel:
  - Read Messages
  - Send Messages
  - Embed Links
  - Attach Files
  - Use External Emojis
  - Use Application Commands (for the approval buttons)
  - Add Reactions

### 3. Get the channel ID

- In Discord, enable Developer Mode (User Settings → Advanced → Developer Mode ON)
- Right-click `#baw-os-operations` → "Copy Channel ID"
- Save it. We'll need it for the Alicia skill config:
  ```
  BAW_OS_DISCORD_CHANNEL_ID=<paste here>
  ```

### 4. Pin a welcome message

Pin the following message in the channel for context (paste as Fran):

> 🏗️ **Canal de operación BaW OS vía Alicia**
>
> Aquí puedes pedirle a Alicia que opere la plataforma en lenguaje natural.
>
> Ejemplos:
> - `alicia, ¿qué incidencias hay abiertas en D104?`
> - `alicia, agrega incidencia "fuga lavabo" en D104, prioridad alta`
> - `alicia, lista las tareas pendientes de housekeeping`
> - `alicia, ¿cuál es el estado de cobranza del mes?`
>
> Las acciones que requieren aprobación llegan con botones inline. Las acciones automáticas (lectura, registros menores) se ejecutan directo.
>
> Toda actividad queda registrada en BaW OS con badge "via Alicia · ZXY Agent OS · Discord".

## Done when

- [ ] Channel `#baw-os-operations` exists in ZXY Ventures Discord
- [ ] Alicia bot is in the channel with required permissions
- [ ] Channel ID copied and shared with Computer (paste in next message)
- [ ] Welcome message pinned

## Notes

- This channel will eventually be replicated for other agents in Sprint 5B+ (e.g. `#baw-os-finance` for Beto, `#baw-os-legal` for Maribel) but **NOT in Sprint 5A**.
- The channel name follows the convention `#baw-os-<scope>`. Future PM Company Owners using OpenClaw will follow their own conventions in their own Discord servers.
