# Spec — Reconstrucción del conector BaW OS para Alicia (MK2)

**Status:** propuesto · pendiente de construir
**Audience:** quien construya el plugin del lado OpenClaw (Mac Studio M4 Max) + Fran
**Repos involucrados:** `baw-os` (servidor, ya listo) · `openclaw-skill-baw-os` (plugin, a reconstruir)
**Fuente de verdad del contrato:** `AGENTS.md §9` (este doc lo aterriza en pasos)

> Este spec existe porque la integración Alicia ↔ API de BaW OS vivía en MK1 y **no se
> reconstruyó en MK2** (ver `docs/runbooks/alicia-skill-install.md`). El lado servidor
> (`baw-os`) está completo; lo que falta es el conector del lado de Alicia.

---

## 0. Meta (definición de "hecho")

Fran escribe en Discord `#baw-os`:
> *"Alicia, agrega incidencia de plomería en D104, prioridad baja"*

→ se crea una incidencia real en BaW OS, atribuida a Alicia, y Alicia responde en Discord
con confirmación + footer *"via Alicia · BaW OS Agent · Discord"*.

Ese es el **primer slice**. Lo demás (pagos, contactos, contratos, Hugo) se amplía después.

---

## 1. Arquitectura elegida: **long-poll, sin túnel** (recomendada para arrancar)

Alicia solo necesita **salida a internet** (que ya tiene). No requiere exponer la Mac Studio
ni Cloudflare/Tailscale entrante. Dos caminos posibles; **arrancamos con el A**:

```
A) Camino simple (MVP) — Alicia maneja Discord y hace long-poll
   Fran escribe en #baw-os  →  Alicia (bot Discord en MK2) lee el mensaje
        →  interpreta NL  →  llama POST /api/v1/incidents (Bearer + x-baw-trigger: human)
        →  responde en Discord con atribución

B) Camino con interacciones server-side (follow-up, opcional)
   Botones/aprobaciones de Discord → /api/agents/discord-interactions (server)
        → quedan 'deferred' → Alicia los recoge con GET /v1/interactions (long-poll cada ~30s)
        → ejecuta → PATCH /v1/interactions/:id = completed|failed
```

> El camino B (long-poll de `/v1/interactions`) es lo que reemplaza al push por túnel de MK1.
> Solo se necesita cuando uses **botones de aprobación** en Discord. Para el MVP (Fran teclea
> un comando directo) basta el camino A.

---

## 2. Autenticación

Toda llamada del plugin lleva la credencial de Alicia (emitida en
`/agents/alicia-ops/credentials`, formato **`sk_live_...`**):

```
Authorization: Bearer sk_live_xxxxxxxx
```
(alternativa equivalente: header `x-api-key: sk_live_...`)

La key se guarda en el **`service-env` de Alicia** (ver §8), nunca en `.md` ni en Discord.

---

## 3. Formato de respuestas (envelope estándar)

Éxito:
```json
{ "success": true, "data": { /* ... */ }, "pagination": { "next_cursor": null, "limit": 20 } }
```
Error:
```json
{ "success": false, "error": { "code": "forbidden_scope", "message": "..." } }
```
Acción que requiere aprobación humana (HTTP **202**):
```json
{ "success": true, "data": { "status": "pending_approval", "approval_id": "...", "expires_at": "..." } }
```
El plugin debe tratar **202** como "no terminada aún": avisar en Discord que quedó en cola de
aprobación y (opcional) seguir el estado en `/v1/approvals/:id`.

---

## 4. Header `x-baw-trigger` — CRÍTICO (modelo de autonomía)

| Valor | Cuándo usarlo | Efecto |
|---|---|---|
| `x-baw-trigger: human` | El plugin relaya una **instrucción explícita de Fran** (comando en Discord). | Acciones reversibles se ejecutan de inmediato (AUTO), auditadas. |
| `x-baw-trigger: auto` (default) | Acción detonada por lógica del agente / cron / trigger. | Requiere aprobación breve (202 → botón en Discord). |

**Regla dura:** el plugin manda `human` **solo** cuando hay una orden directa de Fran. Nunca
para acciones autónomas. Los irreversibles (`payment.charge`, `cfdi.emit`, `contract.sign`,
etc.) **siempre** piden aprobación, sin importar el trigger.

---

## 5. Endpoints que usa el plugin

Base URL: `https://baw-os.vercel.app`

### MVP (primer slice)
| Uso | Método · Endpoint | Scope | Notas |
|---|---|---|---|
| Crear incidencia | `POST /api/v1/incidents` | `incidents:write` | body abajo · `action_type=incident.create` |
| Leer incidencias | `GET /api/v1/incidents?status=&priority=&unit_id=&limit=` | `incidents:read` | paginado por cursor |
| Leer runs (humo) | `GET /api/v1/runs?limit=` | `runs:read` | |

**Body de `POST /v1/incidents`:**
```json
{ "title": "Plomería en D104", "priority": "low", "unit_id": "<uuid opcional>", "description": "..." }
```
- `title` **requerido**. `priority` ∈ `urgent|high|normal|low` (default `normal`). `unit_id`,
  `description`, `estimated_cost`, `reported_by` opcionales.

### Long-poll (camino B, cuando haya aprobaciones)
| Uso | Método · Endpoint | Scope |
|---|---|---|
| Recoger pendientes | `GET /api/v1/interactions?status=deferred,processing&limit=` | `interactions:read` |
| Cerrar interacción | `PATCH /api/v1/interactions/:id` body `{"status":"completed"\|"failed","error":"..."}` | `interactions:write` |

### Ampliación (Fase 5 — confirmar scopes al emitir credencial)
| Acción | Endpoint | Scope | action_type |
|---|---|---|---|
| Pago recibido (efectivo/transfer, **no** tarjeta) | `POST /v1/payments` | `payments:write` | `payment.record` |
| Inquilino/contacto | `GET/POST /v1/occupants` | `occupants:read`/`occupants:write` | `occupant.create` |
| Contrato (registro, **no** e-firma) | `POST /v1/contracts` | `contracts:write` | `contract.create` |

> `reservations` y writes de `units` quedan **pendientes** de confirmación de schema (no exponer aún).

---

## 6. Atribución obligatoria

Toda acción de Alicia ya queda atribuida server-side (`created_by_agent_id`), pero la
**respuesta en Discord** debe incluir el footer de atribución:

```
via Alicia · BaW OS Agent · Discord
```

(En BaW OS esto lo dan los helpers `withAgentAttribution` / `withAgentDiscordEmbed`; del lado
del plugin basta con anexar ese footer al mensaje de Discord.)

---

## 7. Loop del plugin (pseudocódigo, camino A)

```
on_discord_message(msg) in [#baw-os, #809]:
    if not addressed_to_alicia(msg): return
    intent = parse_natural_language(msg.text)         # "crear incidencia", unidad, prioridad
    if intent.action == "incident.create":
        resp = POST /api/v1/incidents
                 headers: Authorization: Bearer <key>, x-baw-trigger: human
                 body: { title, priority, unit_id? }
        if resp.status == 200:  reply("✅ Incidencia creada …\nvia Alicia · BaW OS Agent · Discord")
        elif resp.status == 202: reply("📝 Registrada, en cola de aprobación de Fran. …")
        elif resp.status == 403: reply("⛔ Sin permiso para esa acción (scope).")
        else: reply("⚠️ Error: " + resp.error.message)
```

---

## 8. Configuración en la Mac Studio (MK2)

- Guardar la credencial en el **service-env** de Alicia:
  `~/.openclaw-alicia/service-env/ai.openclaw.alicia.env` →
  ```
  BAW_OS_API_URL=https://baw-os.vercel.app
  BAW_OS_API_KEY=sk_live_...
  ```
  (No `.env` estilo MK1. No pegar la key en archivos de identidad ni en Discord.)
- Instalar el conector como **plugin** de OpenClaw 2026.5.28 (`plugins.entries` en
  `openclaw.json`). El `openclaw skill install` de MK1 **ya no existe**.
- Reiniciar Alicia con **bootout/bootstrap** (nunca `kickstart -k`):
  ```bash
  launchctl bootout gui/$(id -u)/ai.openclaw.alicia
  sleep 3
  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.alicia.plist
  ```
- Verificar carga en `~/.openclaw-alicia/logs/gateway.log`.

---

## 9. Fase 0 — Prerequisitos en BaW OS (Vercel) + smoke test

### 9.1 Variables de entorno a verificar en Vercel
Estas alimentan el endpoint de Discord Interactions (camino B / aprobaciones). El camino A
(comando directo) solo necesita que la **credencial** funcione.

| Variable | Para qué | De dónde sale | ¿Obligatoria MVP? |
|---|---|---|---|
| `DISCORD_PUBLIC_KEY` | Verificar firma Ed25519 de Discord | Portal de Discord (app) | Solo camino B |
| `INTERNAL_WEBHOOK_SECRET` | Bearer interno entre funciones Vercel | Generar secreto | Solo camino B |
| `NEXT_PUBLIC_BASE_URL` | URL base | `https://baw-os.vercel.app` | Sí |
| `DISCORD_DEFAULT_ORG_ID` | Org a la que se atribuyen interacciones | UUID de org `BaW Operations` | Solo camino B |
| `ALICIA_WEBHOOK_URL` | Push entrante a Alicia | **N/A en MK2** (usamos long-poll) | No |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | App | ya configuradas | Ya |

### 9.2 Smoke test del servidor (sin depender del plugin)
Con la credencial de Alicia (`sk_live_...`), esto valida TODO el lado servidor end-to-end:

```bash
KEY="sk_live_..."          # credencial de Alicia (alicia-ops)
BASE="https://baw-os.vercel.app"

# (1) Lectura — debe dar 200 + {success:true,data:[...]}
curl -s -H "Authorization: Bearer $KEY" "$BASE/api/v1/incidents?limit=3"

# (2) Escritura como Fran (human) — reversible → se ejecuta (200)
curl -s -X POST "$BASE/api/v1/incidents" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -H "x-baw-trigger: human" \
  -d '{"title":"Prueba conexión Alicia","priority":"low"}'

# (3) Escritura autónoma (auto) — misma acción → 202 pending_approval
curl -s -X POST "$BASE/api/v1/incidents" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -H "x-baw-trigger: auto" \
  -d '{"title":"Prueba autónoma","priority":"low"}'
```
Resultado esperado: (1) lista 200 · (2) incidencia creada 200 · (3) `status:"pending_approval"` 202.
Si (1) da 401 → key mal/revocada. Si da 403 → falta el scope (revisar credencial).

---

## 10. Definición de hecho (DoD)

- [ ] Fase 0: smoke (1)(2)(3) pasan contra prod.
- [ ] Plugin instalado como plugin MK2; aparece en `plugins.entries`; logs OK.
- [ ] Credencial en `service-env` (no en `.md`).
- [ ] `"Alicia, agrega incidencia … D104"` en Discord crea la incidencia real con badge `via Alicia`.
- [ ] Acción autónoma genera 202 y botón de aprobación (si se implementa camino B).
- [ ] Caso negativo: token revocado → Alicia recibe 401 y lo reporta.

---

## 11. Supuestos y decisiones abiertas

- **Supuesto (default):** arrancamos con **camino A (long-poll/sin túnel)** y **primer slice =
  crear incidencia**. Cambiables si Fran prefiere otra cosa.
- **Quién construye el plugin:** lado OpenClaw (Mac Studio). `baw-os` no puede tocar ese repo
  ni la máquina; este spec es el contrato para que lo construyan sin adivinar.
- **Scopes de la credencial de Alicia (MVP):** `incidents:read`, `incidents:write`,
  `runs:read`. Para Fase 5 agregar `payments:write`, `occupants:read/write`, `contracts:write`.
- **NL → intent:** el parseo de lenguaje natural a acción vive en el plugin (no en BaW OS).
