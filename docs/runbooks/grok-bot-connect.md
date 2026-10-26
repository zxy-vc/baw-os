# Runbook — Conectar Grok Bot a BaW OS (servidor MCP)

**Audience**: Fran
**Estimated time**: 10 min
**Issue**: BAW-11 (habilita BAW-25 y BAW-26 — Hugo/OpenClaw usa la misma puerta)
**Prerequisite**:
- PR de BAW-11 mergeado y deployado en `https://baw-os.vercel.app`
- Migración `supabase/migrations/20261016020000_agents_grok_bot.sql` aplicada en Supabase
  (da de alta `grok-bot` en el catálogo; sin ella no se le pueden emitir credenciales).
  Solo depende de `20260620020000_agents_catalog_fields.sql` (columnas `is_connectable`,
  `role_label`), ya aplicada (está en el manifiesto). No depende de
  `20261014010000_public_booking_payment_integrity.sql` (BAW-15), que sigue pendiente en
  prod; si se usa `supabase db push`, aplicar esa primero (orden de versión) o usar
  `--include-all`. Desde el SQL editor se puede aplicar sola.
- Tras aplicarla, agregar su línea al manifiesto de BAW-3
  (`supabase/ci/applied-migrations.sha256`) en un commit aparte:
  `1e300649e80994162672d1f93768cca9251d9b0bac7febafe3f05d53702ef162  20261016020000_agents_grok_bot.sql`
- `GET /v1/payments` (y la tool `listar_pagos`) ahora lee `payments.late_fee_amount`, de
  `20260615030000_payments_late_fee.sql` (en el manifiesto; Cobros ya la usa en prod).

## Cómo funciona

Grok Bot no tiene API pública, pero sí acepta **servidores MCP remotos** (URL HTTPS
pública + API key en un header). BaW OS expone uno en:

```
POST https://baw-os.vercel.app/api/mcp      (Streamable HTTP, stateless)
```

- **Auth:** `Authorization: Bearer sk_live_…` **o** `x-api-key: sk_live_…`. Es una
  credencial de agente normal (`agent_credentials`), con org y scopes propios.
- **Tools:** cada tool envuelve un endpoint `/api/v1/*` existente y pasa por el mismo
  camino que REST: scopes, idempotencia, clasificador AUTO/LOG/REQUIRE_APPROVAL,
  `agent_approvals` y auditoría en `agent_runs`/`agent_actions`.
- **Scopes = tools visibles.** `tools/list` solo muestra lo que permiten los scopes
  de la credencial; llamar una tool fuera de scope da error.
- **Aprobaciones:** si una escritura cae en REQUIRE_APPROVAL, Grok Bot recibe
  «Pendiente de aprobación de Fran (id …)» y **no se ejecuta nada** hasta que la
  apruebes (Discord o `/agents`).
- **Origen del disparo:** por MCP el clasificador siempre ve `auto` (una API key no
  prueba que la orden vino de ti). Para que algo se ejecute directo, súbelo en la
  política del agente (paso 2).

| Tool | Qué hace | Scope |
|---|---|---|
| `resumen_operativo` | Unidades, contratos, pagos por estado, incidencias y tareas | `insights:read` |
| `listar_unidades` | Unidades y su estado | `units:read` |
| `listar_contratos` | Contratos de renta | `contracts:read` |
| `listar_ocupantes` | Inquilinos/huéspedes/contactos | `occupants:read` |
| `listar_pagos` | Cargos y pagos con mora (filtra `pending`/`late`/`partial`) | `payments:read` |
| `listar_incidencias` | Incidencias de mantenimiento | `incidents:read` |
| `listar_tareas` | Tareas operativas | `tasks:read` |
| `listar_ejecuciones` | Runs de agentes | `runs:read` |
| `listar_aprobaciones` / `ver_aprobacion` | Cola de aprobaciones y estado de una | `approvals:read` |
| `crear_incidencia` | `incident.create` | `incidents:write` |
| `crear_tarea` | `task.create` | `tasks:write` |
| `registrar_pago_recibido` | `payment.record` (efectivo/transferencia; **no** cobra tarjeta) | `payments:write` |
| `crear_ocupante` | `occupant.create` | `occupants:write` |
| `enviar_mensaje_inquilino` | `message.send_to_tenant` | `messages:send` |

No hay tools para cobrar (`payment.charge`), facturar (`cfdi.emit`), firmar o terminar
contratos, resolver aprobaciones ni archivar. Eso sigue siendo solo tuyo.

## Steps

### 1. Emitir la credencial de Grok Bot

1. Entra a `https://baw-os.vercel.app/agents/grok-bot/credentials` (sesión owner/admin,
   org **BaW Operations** activa).
2. Crea una credencial con label `grok` y estos scopes (quita los de escritura que no
   quieras darle):
   - Lectura: `insights:read`, `units:read`, `contracts:read`, `occupants:read`,
     `payments:read`, `incidents:read`, `tasks:read`, `runs:read`, `approvals:read`
   - Escritura: `incidents:write`, `tasks:write`, `payments:write`, `occupants:write`,
     `messages:send`
3. Copia la key `sk_live_…` — **se muestra una sola vez**.

### 2. (Opcional) Ajustar autonomía

Sin política, Grok Bot queda en autonomía **L1**: **toda** escritura espera tu
aprobación. Si quieres que incidencias y tareas se creen directo:

1. Entra a `https://baw-os.vercel.app/agents/grok-bot/policies`.
2. Sube la autonomía a **L2**. Con eso `incident.create` y `task.create` son AUTO;
   `payment.record`, `occupant.create` y `message.send_to_tenant` siguen pidiendo
   aprobación. Los candados duros (`payment.charge`, `cfdi.emit`, `contract.sign`…)
   no se pueden bajar desde ahí.

### 3. Agregar el servidor en Grok Bot

En el chat de Grok Bot:

> Add a custom MCP server called **baw-os** at **https://baw-os.vercel.app/api/mcp**

Cuando pida autenticación, elige **API key en header** y captura:

- Header: `Authorization`
- Valor: `Bearer sk_live_…` (la key del paso 1)

(Si Grok Bot solo deja poner el valor sin «Bearer», usa el header `x-api-key` con la
key tal cual.)

### 4. Probarlo

Pregúntale a Grok Bot:

> ¿cuánto me deben en el 809?

Debe llamar `listar_pagos` y contestar con un **estimado** a partir de los cargos (`amount`,
`amount_paid`, `late_fee_amount`, `status`), aclarando que el saldo oficial está en Cobros. Las
tools aún no exponen el adeudo canónico de Cobros (`computeMonthStatus`: contratos sin día de
pago, saldo mínimo 0, etc.), así que compara el estimado con `/cobros`. Luego prueba una escritura:

> Crea una incidencia: fuga en el baño del 809-3

- Con L1 (default): responde «Pendiente de aprobación de Fran (id …)» y te llega la
  aprobación. Nada se crea hasta que apruebes.
- Con L2: responde «Incidencia creada (id …)» y aparece en `/maintenance`.

**Limitación actual:** los endpoints v1 no filtran por edificio. «En el 809» hoy se
contesta con los datos de toda la org (809 + 2020). Filtro por edificio en v1/MCP es
follow-up.

### 5. Verificación con curl (opcional)

```bash
KEY="sk_live_..."
URL="https://baw-os.vercel.app/api/mcp"
H=(-H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")

# Debe responder serverInfo.name = "baw-os"
curl -s "${H[@]}" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}' "$URL"

# Lista solo las tools que permiten los scopes
curl -s "${H[@]}" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' "$URL"

# Sin credencial → 401 con error JSON-RPC
curl -s -i -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' "$URL"
```

## Revocar

`/agents/grok-bot/credentials` → Revocar. A partir de ese momento cualquier llamada
de Grok Bot recibe 401. Quita también el servidor en Grok Bot.

## Otros clientes con la misma puerta

Mismo URL y misma credencial de agente (cada uno con la suya en `/agents/<agente>/credentials`):

| Cliente | Dónde va la credencial |
|---|---|
| Grok Bot | Header que el bot guarda en la entrada del servidor (paso 3) |
| Hermes Agent | `~/.hermes/config.yaml` → `headers: { Authorization: "Bearer sk_live_…" }` |
| OpenClaw (Hugo, BAW-26) | Settings → MCP → servidor `streamable-http` con header `Authorization` |
| Claude Code / Cursor | Servidor MCP HTTP con header `Authorization: Bearer sk_live_…` |

Solo Streamable HTTP (POST con respuesta JSON). No hay endpoint SSE: un `GET /api/mcp`
responde 405.

Claude.ai, ChatGPT (custom connectors), Meta Muse y la app de Gemini **no** aceptan API
key en header: necesitan OAuth 2.1 (slice 2).

## Slice 2 — OAuth 2.1 (no implementado)

La auth de `/api/mcp` ya vive detrás de una interfaz (`src/lib/mcp/auth.ts`,
`McpAuthProvider`): cada proveedor devuelve la misma identidad (fila de
`agent_credentials`) y las tools solo ven eso. Slice 2 agrega un proveedor OAuth:

1. `GET /.well-known/oauth-protected-resource` (RFC 9728): `resource = https://baw-os.vercel.app/api/mcp`, `authorization_servers = [https://baw-os.vercel.app]`.
2. `GET /.well-known/oauth-authorization-server` (RFC 8414): endpoints `authorize`, `token`, `register`; solo `code` + PKCE S256.
3. `POST /api/oauth/register` (registro dinámico RFC 7591) para los conectores de Claude.ai, ChatGPT, Muse y Gemini.
4. `/oauth/authorize`: pantalla de BaW OS donde Fran (sesión owner/admin) elige agente y scopes y aprueba.
5. Al aprobar se crea una fila en `agent_credentials` (label `oauth:<cliente>`) y el `code` queda ligado a ella.
6. `POST /api/oauth/token` canjea `code` + `code_verifier` por un access token corto y un refresh token rotativo, con audiencia `/api/mcp`.
7. Los tokens se guardan hasheados (como `api_key_hash`) apuntando a la credencial; revocarla en `/agents/<id>/credentials` corta el acceso.
8. `oauthProvider` (en `MCP_AUTH_PROVIDERS`) reconoce tokens que no empiezan con `sk_`, los valida y devuelve el `AgentAuthResult` de esa fila.
9. El 401 pasa a `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"` (`MCP_WWW_AUTHENTICATE`).
10. Como el token prueba que Fran autorizó, ahí se puede evaluar marcar el disparo como `human`; los candados duros no cambian.
