# ADR-021 — Third-Party Agent Discord Interactions (Sprint 5A WS-1)

**Status**: Accepted
**Date**: 2026-05-23
**Authors**: Computer (AI), supervised by Fran (único humano)
**Supersedes**: N/A — extiende ADR-016 con decisiones de implementación concretas
**Related**: ADR-016 (Third-Party Agent Integration Model)

---

## Contexto

ADR-016 estableció el modelo arquitectural para agentes third-party: clase separada de agentes nativos BaW OS, bearer tokens propios, canales Discord-first, skip doble-escritura, atribución bidireccional. Sprint 5A WS-1 es la **primera implementación concreta** de ese modelo — conectando únicamente a Alicia (ZXY Agent OS, `id = alicia-ops`) vía Discord Interactions API.

Este ADR captura las decisiones de implementación específicas que ADR-016 dejó abiertas.

---

## Decisiones

### D1 — Verificación de firma Ed25519 con Web Crypto (no tweetnacl)

**Decisión**: Usar `crypto.subtle` (Web Crypto API nativa) en lugar de `tweetnacl` u otra lib.

**Rationale**:
- Web Crypto está disponible en Node.js ≥18 (el runtime de Next.js 14) y en Edge Runtime.
- Elimina una dependencia externa con su propia supply chain.
- La API `crypto.subtle.verify('Ed25519', ...)` es el mismo algoritmo que Discord usa para firmar.
- Congruente con el patrón ya establecido en `auth.ts` (SHA-256 vía Web Crypto sin deps).
- "Lo que sea más sólido, no más simple" — la implementación nativa es más auditable.

**Consecuencia**: No se agrega `tweetnacl` al `package.json`. Si en el futuro se necesita firmar (no solo verificar), o si el runtime cambia, la evaluación se reabre.

### D2 — Endpoint en `/api/agents/discord-interactions` (no `/api/discord/interactions`)

**Decisión**: Path `src/app/api/agents/discord-interactions/route.ts`.

**Rationale**:
- Agrupa bajo `/api/agents/` junto con los endpoints existentes (`/api/agents/[id]/run`, `/api/agents/route.ts`).
- Deja claro que este endpoint pertenece a la capa de agentes, no a Discord en general.
- Si en el futuro se conecta Slack u otro canal, el path sería `/api/agents/slack-interactions` — consistente.

**Divergencia de ADR-016**: ADR-016 mencionaba `/api/discord/interactions`. Esta decisión corrige ese path para mantener consistencia con la estructura del repo.

### D3 — Respuesta DEFERRED dentro de 3s para todos los comandos (salvo botones de aprobación)

**Decisión**: `APPLICATION_COMMAND` siempre responde con `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`. Los botones de aprobación (`MESSAGE_COMPONENT` con custom_id `baw:approval:*`) se procesan inline y responden con `UPDATE_MESSAGE` directo.

**Rationale**:
- Discord requiere respuesta en <3s o marca el comando como fallido.
- El procesamiento de comandos (parsear intención, llamar BaW OS API, formatear respuesta) tarda >3s.
- Los botones de aprobación son operaciones simples DB (UPDATE agent_approvals), típicamente <100ms.
- Separar los dos casos evita UI de "pensando..." en botones simples.

### D4 — custom_id convention: `baw:<agent_id>:<action>:<payload>`

**Decisión**: Los componentes Discord (botones, selects) usan el formato `baw:<agent_id>:<action>:<entity_id>`.

Ejemplos:
- `baw:alicia-ops:approval:grant:uuid-de-la-aprobacion`
- `baw:alicia-ops:approval:deny:uuid-de-la-aprobacion`
- `baw:alicia-ops:confirm:incident:uuid-del-incidente`

**Rationale**:
- Discord permite hasta 100 caracteres en custom_id.
- El prefix `baw:` permite distinguir botones de BaW OS de otros bots en el servidor.
- El `agent_id` en posición 2 permite routing multi-agente futuro desde el mismo endpoint.
- Namespacing explícito previene colisiones entre acciones.

### D5 — `agent_interactions` es la tabla de log de Discord (nueva), distinta de `agent_runs`

**Decisión**: Crear tabla `agent_interactions` separada de `agent_runs`.

**Rationale**:
- `agent_runs` registra ejecuciones de agentes nativos BaW OS con schema completo (input, output, metrics, duration).
- Las interacciones Discord tienen un modelo diferente: son eventos HTTP externos de Discord con su propio ID de interacción, guild, channel, user.
- Fusionar los dos modelos en una tabla requeriría muchos campos nullable en `agent_runs`, degradando su schema.
- `agent_interactions` puede crecer con campos Discord-specific (message_id, guild_id, component_type) sin afectar el schema de runs de agentes nativos.

### D6 — `created_by_agent_id` en reservations, incidents, tasks (no solo en bookings)

**Decisión**: Agregar columna `created_by_agent_id TEXT REFERENCES agents(id)` en las 3 tablas donde Alicia puede crear registros.

**Rationale**:
- La tarea especificaba `bookings`, pero BaW OS usa `reservations` (no existe tabla `bookings`).
- Alicia también puede crear incidencias y tareas — aplicar atribución en las 3 tablas es más completo que solo en reservas.
- El campo es `TEXT` (no UUID) porque `agents.id` es TEXT (ej. `'alicia-ops'`), consistente con el schema existente.

### D7 — `idempotency_key` en `agent_runs` + unique constraint

**Decisión**: Agregar columna `idempotency_key TEXT` con unique index (WHERE NOT NULL) a `agent_runs`.

**Rationale**:
- ADR-016 D4 exige idempotencia: `Alicia-{uuid_v4}` en cada request.
- Con unique constraint en DB, un segundo request con el mismo key falla a nivel DB antes de ejecutar la acción.
- Complementa el middleware de idempotency que ya existe (`idempotency_keys` table) con tracking en el run level.

### D8 — `resolved_by_discord_user` en agent_approvals (campo nuevo sin migración separada)

**Decisión**: Usar `UPDATE agent_approvals SET status='approved', resolved_at=now(), resolved_by_discord_user=:discord_user_id` al procesar botones.

**Nota**: Si `resolved_by_discord_user` no existe en `agent_approvals`, el UPDATE ignorará el campo silenciosamente en Supabase. En la migración `20260523_agents_discord_interactions.sql` NO se agrega este campo porque no tenemos el schema exacto de `agent_approvals`. **Acción pendiente**: verificar schema de `agent_approvals` y agregar el campo si falta en la próxima migración.

---

## Consecuencias

### Positivas
- Verificación de firma robusta sin deps externas, auditablemente simple.
- Atribución trazable en ambas direcciones (Discord message URL ↔ BaW OS record).
- Schema DB limpio: `agent_interactions` para Discord, `agent_runs` para agentes nativos.
- Idempotencia respaldada por unique constraint en DB.

### Negativas / Pendientes
- El endpoint `/api/agents/discord-interactions/process` (procesamiento async para followup Discord) no se construye en WS-1 — requiere la integración con la skill OpenClaw de Alicia (WS-2).
- El campo `resolved_by_discord_user` en `agent_approvals` requiere verificación de schema antes de aplicar.

### Decisiones futuras que este ADR deja abiertas
- Rate limiting por agente en el endpoint Discord (Sprint 5B).
- Webhook de regreso a Alicia (`POST https://alicia.zxy.vc/incoming/baw-os`) — Sprint 5A WS-3.
- Rotación forzada de bearer tokens (90 días) — Sprint 5C.
- Soporte multi-tenant para el wizard de conexión de agentes — Sprint 7+.

---

## Referencias

- ADR-016: `/docs/adr/ADR-016-third-party-agent-integration.md`
- Sprint 5A Plan: `/docs/sprints/SPRINT_5A_PLAN.md`
- Discord Interactions docs: https://discord.com/developers/docs/interactions/receiving-and-responding
- Web Crypto Ed25519: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify
- Implementación: `src/app/api/agents/discord-interactions/route.ts`
- Verificación: `src/lib/agents/discord-verify.ts`
- Autenticación: `src/lib/agents/auth.ts` (verifyAgentBearer + requireAgentAuth HOF)
- Atribución: `src/lib/agents/attribution.ts`
- Migración: `supabase/migrations/20260523_agents_discord_interactions.sql`
- Tests: `tests/agents/` (39 tests, 3 suites)
