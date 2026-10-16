# Spec — Conector OpenClaw de Hugo para BaW OS (MK2)

**Status:** propuesto · pendiente de construir (lado OpenClaw)
**Issue:** BAW-26 — Hugo reemplaza a Alicia como agente operador
**Audience:** quien construya el plugin del lado OpenClaw (Mac Studio M4 Max) + Fran
**Repos:** `baw-os` (servidor, listo con este PR) · plugin de Hugo en OpenClaw (a construir)
**Adaptado de:** [`alicia-plugin-mk2.md`](./alicia-plugin-mk2.md) (LEGACY: Alicia está retirada)
**Contrato:** `AGENTS.md §9` + este doc. Si discrepan, gana el código en `origin/main`.

> Alicia (`alicia-ops`) se apagó. El agente conectado ahora es **Hugo** (`hugo-cos`), ya
> **no como supervisor de solo lectura**: Fran le habla desde el chat de BaW OS (y Discord) y
> Hugo opera BaW OS vía `/api/v1/*`. El servidor está listo; falta el conector de Hugo en
> OpenClaw.

---

## 0. Meta: el «primer día»

Fran abre BaW OS, toca el botón **Hugo** (ChatDock, abajo a la derecha) y escribe:

> *«Registra una incidencia de plomería en D104, prioridad baja»*

→ el conector de Hugo recoge el mensaje, crea la incidencia real (atribuida a `hugo-cos`) y
responde **en el mismo hilo del chat** con la confirmación y la atribución
`via Hugo · BaW OS Agent`.

Si el conector está apagado, el chat **no finge** que Hugo está conectado: a los 45 s muestra
*«Hugo no ha respondido; revisa que su conector en OpenClaw esté encendido.»*
(`src/app/chat/ChatPanel.tsx`, `src/lib/agents/roster.ts` → `noResponseMessage`).

---

## 1. Arquitectura: long-poll, sin túnel

Hugo solo necesita **salida a internet**. No se expone la Mac Studio. Un mismo loop atiende
los dos canales:

```
Chat in-app (Fran en BaW OS)                     Discord (#baw-os)
  POST /api/chat/conversations/:id/messages        POST /api/agents/discord-interactions
        │                                                │ (firma Ed25519, deferred <3s)
        └──► agent_interactions                  ◄───────┘
             agent_id='hugo-cos', org_id=<org>, status='deferred'
             channel='app'   | channel='discord'
                     │
     Hugo (OpenClaw) ── GET /api/v1/interactions?status=deferred,processing  (cada ~5-10 s)
                     │
            interpreta → llama /api/v1/* con su sk_live  (x-baw-trigger: human)
                     │
     PATCH /api/v1/interactions/:id  {status:'completed', response:{text}} | {status:'failed', error}
                     │
     app:     el chat lee response.text (polling cada 3 s) y lo pinta en el hilo
     discord: además, followup al webhook de Discord con el token de la interacción
```

- **Canal `app`** (chat in-app): `payload = { text, conversation_id }`. La respuesta que el
  usuario ve es **`response.text`** del PATCH. No hay otra vía de respuesta.
- **Canal `discord`**: `payload` trae la interacción cruda (incluye `application_id` + `token`
  para el followup, válido 15 min). Las interacciones de Discord se atribuyen a la org de
  `DISCORD_DEFAULT_ORG_ID`; si esa variable falta, quedan con `org_id = null` y **Hugo no las
  ve** (el long-poll está acotado a la org de su credencial).
- **Push opcional:** si `HUGO_WEBHOOK_URL` está en Vercel, `/process` intenta push primero
  (`src/app/api/agents/discord-interactions/process/route.ts`). Sin ella, todo va por long-poll.
  Para el MVP: **sin push**.
- Una credencial **solo ve y cierra interacciones de su org** (`.eq('org_id', auth.orgId)` en
  `src/app/api/v1/interactions/route.ts` y `[id]/route.ts`, BAW-26).

---

## 2. Autenticación y scopes

Credencial emitida en `/agents/hugo-cos/credentials` (sesión owner/admin de **BaW Operations**)
con el **preset «Operador»** (viene preseleccionado para Hugo). Formato `sk_live_...`:

```
Authorization: Bearer sk_live_xxxxxxxx      (equivalente: x-api-key: sk_live_...)
```

El preset (`OPERATOR_SCOPES` en `src/lib/agents/roster.ts`) es **exactamente**:

| Grupo | Scopes |
|---|---|
| Lectura | `units:read` `reservations:read` `payments:read` `contracts:read` `occupants:read` `incidents:read` `tasks:read` `runs:read` `insights:read` `approvals:read` `agents:read` |
| Escritura v1 | `units:write` `payments:write` `contracts:write` `occupants:write` `incidents:write` `tasks:write` `messages:send` `lifecycle:archive` |
| Chat | `interactions:read` `interactions:write` |

**Nunca:** `approvals:resolve` (solo Fran aprueba; además el servidor ya no emite ese scope ni
`*` a nadie), `agents:run` (corre runners internos —cobranza— sin pasar por aprobación),
`payments:trigger` (sin endpoint; sería Stripe).

La key vive en el **service-env de Hugo** (§8), nunca en `.md`, Discord ni el chat.

---

## 3. Envelope de respuestas

Igual que en Alicia: éxito `{success:true,data,pagination?}`, error
`{success:false,error:{code,message}}`, y **HTTP 202** = `pending_approval` (con
`approval_id`). En el chat, un 202 se responde como *«Quedó en cola de aprobación de Fran»*.

---

## 4. `x-baw-trigger` y candados

| Origen | Header | Efecto |
|---|---|---|
| Mensaje del chat in-app o comando de Discord | `x-baw-trigger: human` | Lo reversible se ejecuta (AUTO), auditado |
| Iniciativa propia de Hugo (cron, seguimiento, inferencia) | `x-baw-trigger: auto` (default) | 202 → aprobación de Fran |

- **Quién puede ordenar por chat:** solo owners/admins de la org y platform admin
  (`canCommandAgents` en `src/lib/agents/chat-agents.ts`). Un `pm_viewer` o `client` ve el
  historial pero recibe 403 al escribir: así nadie escala privilegios a través de Hugo.
- **Candados duros** (classifier, sin cambios): `payment.charge`, `payment.refund`,
  `cfdi.emit`, `contract.sign`, `contract.terminate`, `policy.modify`, `lifecycle.archive`
  → **siempre** REQUIRE_APPROVAL, sin importar el header.
- Stripe y FacturAPI están en LIVE: ningún endpoint del preset cobra con tarjeta ni timbra.
  Ojo: `POST /v1/payments` (registrar pago recibido) dispara el **comprobante por WhatsApp**
  al inquilino si WhatsApp está habilitado.

---

## 5. Endpoints

Base URL: `https://baw-os.vercel.app`

| Uso | Método · Endpoint | Scope | action_type |
|---|---|---|---|
| Recoger pendientes (app + discord) | `GET /api/v1/interactions?status=deferred,processing&limit=` | `interactions:read` | — |
| Responder / cerrar | `PATCH /api/v1/interactions/:id` | `interactions:write` | — |
| Incidencias | `GET/POST /api/v1/incidents` | `incidents:read/write` | `incident.create` (AUTO) |
| Tareas | `GET/POST /api/v1/tasks` | `tasks:read/write` | `task.create` (AUTO) |
| Pago recibido (efectivo/transfer, **no** tarjeta) | `GET/POST /api/v1/payments` | `payments:read/write` | `payment.record` |
| Inquilinos | `GET/POST /api/v1/occupants` | `occupants:read/write` | `occupant.create` |
| Contrato (registro, **no** e-firma) | `GET/POST /api/v1/contracts` | `contracts:read/write` | `contract.create` |
| Unidades | `GET/POST /api/v1/units` | `units:read/write` | `unit.create` |
| Mensaje (intención; entrega real en fase posterior) | `POST /api/v1/messages` | `messages:send` | `message.send_*` |
| Archivar (nunca borrar) | `POST /api/v1/lifecycle` | `lifecycle:archive` | `lifecycle.archive` (siempre aprobación) |
| Reservaciones (solo lectura) | `GET /api/v1/reservations` | `reservations:read` | — |
| Aprobaciones (solo lectura) | `GET /api/v1/approvals[/:id]` | `approvals:read` | — |
| Runs / insights / catálogo | `GET /api/v1/runs`, `/insights/summary`, `/agents` | `runs:read` `insights:read` `agents:read` | — |

`unit_id`, `occupant_id` y `reported_by` deben ser de la org de la credencial; si no, 404
(`src/lib/agents/v1/org-refs.ts`, BAW-26).

**PATCH para el chat:**
```json
{ "status": "completed", "response": { "text": "✅ Incidencia creada: Plomería D104 (baja).\n\nvia Hugo · BaW OS Agent" } }
```
```json
{ "status": "failed", "error": "No encontré la unidad D104 en BaW Operations." }
```
El chat pinta `response.text` tal cual (texto plano) y, si `failed`, muestra
*«Hugo no pudo completar la solicitud: <error>»*.

---

## 6. Atribución

Toda respuesta de Hugo termina con:

```
via Hugo · BaW OS Agent
```

En Discord se agrega el canal (`via Hugo · BaW OS Agent · Discord`, igual que
`discordAttributionFooter` en `src/lib/agents/attribution.ts`). Server-side la autoría ya
queda en `agent_actions` / `created_by_agent_id`. Hugo **nunca** se presenta como persona.

---

## 7. Loop del conector (pseudocódigo)

```
every 5-10 s:
    items = GET /api/v1/interactions?status=deferred,processing
    for it in items (FIFO):
        text = it.channel == 'app' ? it.payload.text : discord_text(it.payload)
        intent = parse_natural_language(text)                 # NL → acción: vive en el plugin
        if intent is None:
            reply = "No entendí la solicitud. ¿Qué necesitas registrar?"
        else:
            r = call /api/v1/<endpoint>  (Bearer sk_live, x-baw-trigger: human)
            reply = 200 → "✅ …" | 202 → "📝 En cola de aprobación de Fran." |
                    403 → "⛔ Sin permiso (scope)." | 404 → "No encontré …" | else "⚠️ " + r.error.message
        reply += "\n\nvia Hugo · BaW OS Agent"
        if it.channel == 'discord': discord_followup(it.payload.application_id, it.payload.token, reply)
        PATCH /api/v1/interactions/{it.id} {status:'completed', response:{text: reply}}
        on exception: PATCH {status:'failed', error: str(e)}
```

Idempotencia: el PATCH solo cierra interacciones abiertas (`received|processing|deferred`);
un segundo PATCH devuelve 404 → no repetir la acción.

---

## 8. Configuración en la Mac Studio (MK2)

- `~/.openclaw-hugo/service-env/ai.openclaw.hugo.env`:
  ```
  BAW_OS_API_URL=https://baw-os.vercel.app
  BAW_OS_API_KEY=sk_live_...        # credencial de hugo-cos, preset Operador
  ```
- Plugin en `plugins.entries` de `openclaw.json` del workspace de Hugo (puerto `19000`,
  label `ai.openclaw.hugo`).
- Reinicio con bootout/bootstrap (nunca `kickstart -k`):
  ```bash
  launchctl bootout gui/$(id -u)/ai.openclaw.hugo
  sleep 3
  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.hugo.plist
  ```

---

## 9. Encendido (Fran / Operaciones)

1. Aplicar la migración `20261016010000_baw26_hugo_operador_alicia_retired.sql` en Supabase
   (Hugo → operador, Alicia → `retired`, revoca credenciales activas de Alicia y cierra sus
   interacciones pendientes como `failed`; no borra historial).
2. Deploy de este PR.
3. En Vercel: confirmar `DISCORD_DEFAULT_ORG_ID` (si se usa Discord); `ALICIA_WEBHOOK_URL`
   ya no se lee y se puede borrar; `HUGO_WEBHOOK_URL` es opcional.
4. Emitir la credencial: `/agents/hugo-cos/credentials` → **+ Nueva credencial** → preset
   **Operador** (preseleccionado) → copiar la key (se ve una sola vez).
5. Configurar el plugin (§8) y encenderlo.
6. Smoke:
   ```bash
   KEY="sk_live_..."; BASE="https://baw-os.vercel.app"
   curl -s -H "Authorization: Bearer $KEY" "$BASE/api/v1/interactions?limit=5"        # 200
   curl -s -H "Authorization: Bearer $KEY" "$BASE/api/v1/incidents?limit=3"            # 200
   curl -s -X POST -H "Authorization: Bearer $KEY" \
     "$BASE/api/v1/approvals/00000000-0000-0000-0000-000000000000/grant"               # 403 forbidden_scope
   ```
7. Primer día: abrir el chat → **Hugo** → «Registra una incidencia de prueba, prioridad baja».

---

## 10. Definición de hecho

- [ ] Credencial de Hugo emitida con el preset Operador (21 scopes, sin `approvals:resolve`).
- [ ] El plugin recoge interacciones `app` y `discord` de su org y las cierra con PATCH.
- [ ] Un mensaje en el chat crea la incidencia real y Hugo responde en el hilo con
      `via Hugo · BaW OS Agent`.
- [ ] Con el plugin apagado, el chat muestra «Hugo no ha respondido; revisa que su conector
      en OpenClaw esté encendido».
- [ ] Una acción autónoma (`x-baw-trigger: auto`) devuelve 202 y queda en `/agents` para Fran.
- [ ] Token revocado → 401 y Hugo lo reporta.

---

## 11. Preguntas abiertas

- **¿MCP en vez de REST?** El carril B-E (BAW-11) construye un servidor MCP en `/api/mcp`.
  **¿OpenClaw 2026.5.x soporta conectarse a un servidor MCP remoto (HTTP) como cliente?** Si
  sí, Hugo podría usar las herramientas MCP de BAW-11 para las **acciones** (en lugar de
  codificar cada endpoint `/v1/*` en el plugin), manteniendo el long-poll de
  `/v1/interactions` para **recibir** los mensajes del chat y de Discord. Falta confirmar:
  soporte de MCP remoto en OpenClaw, cómo autentica el MCP de BAW-11 (¿la misma `sk_live` y
  los mismos scopes?) y si respeta `x-baw-trigger`/el classifier. No está decidido.
- **Contexto del hilo:** el payload `app` trae solo el mensaje actual. Si Hugo necesita el
  historial de la conversación, hace falta un endpoint de lectura por `conversation_id`
  (no existe hoy).
- **Discord multi-org:** las interacciones de Discord se atribuyen a `DISCORD_DEFAULT_ORG_ID`
  (una sola org). El mapeo guild → org sigue como follow-up.
- **Push vs long-poll:** el intervalo de 5-10 s es una sugerencia; si el costo de requests
  importa, subirlo. El chat espera 45 s antes de decir que Hugo no respondió.
