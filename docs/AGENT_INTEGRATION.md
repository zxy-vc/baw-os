# BaW OS — Agent Integration Guide

> Cómo conectar un agente (interno o third-party) a BaW OS. Si vas a integrar a Hugo-COS, Alicia-Ops, Beto, Maribel, Luis, Andrés-CTO, Rafa-Research o cualquier nuevo agente externo, este es el contrato.
>
> Última actualización: 2026-05-03

---

## Modelo mental

Un **agente** en BaW OS es un actor identificable que opera contra la API pública en nombre de **una org específica**, con **scopes acotados**, **rate-limit propio** y **clasificación per-action** de qué puede hacer solo, qué debe loggear, y qué requiere aprobación humana.

Corolarios:

- **Una identidad por agente, por org.** Hugo-COS de la org A ≠ Hugo-COS de la org B; cada uno tiene su API key.
- **No hay master key.** `BAW_API_KEY` global se elimina en Fase 1; quien la siga usando rompe contrato.
- **Scopes son explícitos.** Un agente sin scope `payments:write` no puede tocar pagos, aunque la lógica del runner lo permita.
- **Clasificación AUTO/LOG/REQUIRE_APPROVAL es por action_type, no por agente.** El mismo agente puede tener acciones AUTO y otras REQUIRE_APPROVAL.

---

## Lifecycle de integración

### 1. Registrar al agente en el catálogo (`agents` table)

Si el agente es nuevo (no está en `supabase/migrations/20260502_agents_roster_v02.sql`), añadirlo via migración nueva. **No hacerlo via dashboard de Supabase** — todo el catálogo vive en migraciones para reproducibilidad.

```sql
INSERT INTO public.agents (
  id, display_name, full_name, family, domain, description,
  capability_level, feedback_level, status, is_shared_zxy
) VALUES (
  'andres-cto', 'Andrés-CTO', 'Agente Andrés-CTO',
  'third-party', 'tech',
  'CTO OpenClaw — coordinación técnica cross-platform',
  0, 0, 'planned', true
);
```

### 2. Generar API key (`agent_credentials`)

UI: `/admin/agents/{id}/credentials → New credential`. Backend genera `sk_live_<32 chars>`, almacena `bcrypt(key)` en `api_key_hash`, devuelve la key plana **una sola vez**.

CLI alterna (Fase 1):

```bash
pnpm baw-cli agents:keys:create \
  --org=baw-operations \
  --agent=andres-cto \
  --label=prod \
  --scopes=tasks:read,tasks:write,incidents:read,runs:read \
  --expires-in=90d
```

### 3. Asignar scopes

Scopes son strings `recurso:operación`. Tabla canónica:

| Recurso | Operaciones | Notas |
|---|---|---|
| `units` | `read`, `write` | Inventario inmobiliario |
| `reservations` | `read`, `write`, `cancel` | STR / MTR |
| `payments` | `read`, `trigger` | `trigger` invoca cobro |
| `contracts` | `read`, `write`, `terminate` | Documentos legales |
| `incidents` | `read`, `write`, `resolve` | Mantenimiento |
| `tasks` | `read`, `write`, `assign` | Workboard interno |
| `agents` | `run`, `manage` | `manage` ≠ run, alto privilegio |
| `runs` | `read` | Solo lectura de historial |
| `insights` | `read` | KPIs sintetizados |
| `messages` | `send`, `read` | Comunicación con tenants |
| `policies` | `read`, `write` | Auto-modificación; restringir |

Recomendación: **least privilege**. Un agente de Reportes solo necesita `*:read` + `insights:read`.

### 4. Configurar policy (autonomy + per-action)

UI: `/admin/agents/{id}/policies` (Fase 4). Determina:

- **Autonomy level** (L0–L4). Default conservador: L1–L2.
- **Per-action overrides** (`action_type → AUTO | LOG | REQUIRE_APPROVAL`).
- **Rate caps** (`actions_per_hour`, `approvals_pending_max`).

Ejemplo:

```json
{
  "autonomy_level": 2,
  "per_action": {
    "email.send_to_tenant": "REQUIRE_APPROVAL",
    "incident.update_status": "AUTO",
    "task.create": "AUTO",
    "payment.charge": "REQUIRE_APPROVAL"
  },
  "rate_caps": {
    "actions_per_hour": 100,
    "approvals_pending_max": 25
  }
}
```

### 5. Implementar el agente externo (lado cliente)

El agente externo (proceso, servicio, MCP server, cron) hace requests autenticadas:

```http
POST https://baw-os.vercel.app/api/v1/incidents
Authorization: Bearer sk_live_<token>
Content-Type: application/json
Idempotency-Key: <uuid>

{
  "unit_id": "u_123",
  "title": "AC failure unit 304",
  "severity": "high",
  "source_agent": "andres-cto"
}
```

Reglas:

- `Authorization: Bearer` o header `x-api-key` (ambos funcionan en v1).
- `Idempotency-Key` obligatorio en POST/PATCH. UUIDv4 generado por el agente.
- Request fallido por scope insuficiente → `403 forbidden_scope`.
- Action clasificada `REQUIRE_APPROVAL` → `202 pending_approval` con `{approval_id}`. Agente debe poll `/v1/approvals/:id` o suscribirse a webhook.
- Rate-limit excedido → `429` con `Retry-After` header.

### 6. Suscribirse a webhooks (opcional)

Si el agente necesita reaccionar a eventos del sistema (no solo polling):

```http
POST https://baw-os.vercel.app/api/v1/webhooks
Authorization: Bearer sk_live_<token>

{
  "url": "https://andres-agent.openclaw.com/baw-events",
  "events": ["incident.created", "approval.granted", "approval.denied"],
  "signing_secret": "auto-generated"
}
```

Eventos firmados con HMAC-SHA256. Verificación obligatoria del lado del agente.

---

## Clasificación AUTO / LOG / REQUIRE_APPROVAL

Cada `action_type` debe tener una clasificación por defecto. La policy del agente puede sobrescribirla. Esta tabla es la **fuente de verdad inicial**:

| action_type | Default | Justificación |
|---|---|---|
| `unit.read` | LOG | Lectura, sin riesgo. |
| `unit.create` | REQUIRE_APPROVAL | Inventario es estado pesado. |
| `unit.update_metadata` | AUTO | Cambios cosméticos. |
| `reservation.create` | REQUIRE_APPROVAL | Compromiso económico. |
| `reservation.cancel` | REQUIRE_APPROVAL | Refund implícito. |
| `payment.charge` | REQUIRE_APPROVAL | Dinero. Siempre. |
| `payment.refund` | REQUIRE_APPROVAL | Idem. |
| `incident.create` | AUTO | Crear ticket es bajo riesgo. |
| `incident.assign` | AUTO | Routing operativo. |
| `incident.resolve` | LOG | Cierre con auditoría. |
| `task.create` | AUTO | Trabajo interno. |
| `task.assign` | AUTO | Idem. |
| `email.send_to_tenant` | REQUIRE_APPROVAL | Contacto externo. |
| `email.send_internal` | LOG | Equipo interno. |
| `contract.draft` | AUTO | Generar borrador, no firmar. |
| `contract.sign` | REQUIRE_APPROVAL | Compromiso legal. |
| `cfdi.emit` | REQUIRE_APPROVAL | SAT, cero margen. |
| `policy.modify` | REQUIRE_APPROVAL | Auto-modificación restringida. |

> **Regla de oro:** si la acción tiene efecto irreversible **fuera de BaW OS** (email enviado, dinero movido, CFDI emitido, contrato firmado), default es `REQUIRE_APPROVAL`.

---

## Patrones recomendados

### Supervisor / worker

Cuando un agente coordina a otros, usar **supervisor pattern**, no mesh.

```
Hugo-COS (supervisor)
  ├─ delega a → Alicia-Ops
  ├─ delega a → Beto-Conta
  ├─ delega a → Maribel-Law
  └─ delega a → Luis-Growth
```

Cada delegación = `POST /v1/agents/:id/run`. Hugo agrega resultados, no los workers entre sí.

### Idempotencia

Toda acción mutante debe ser idempotente vía `Idempotency-Key`. Reintentos del agente NO duplican efectos. Backend mantiene cache `idempotency_keys` con TTL 24h.

### Approval flow

```
1. Agente: POST /v1/payments/charge { ... }
2. Backend: 202 { approval_id: "ap_123", expires_at: "..." }
3. Humano: aprueba en /approvals (UI Human o Agent mode)
4. Backend: webhook approval.granted → agente
5. Agente (opcional): POST /v1/approvals/ap_123/execute
   ó
   Backend ejecuta directo cuando aprueba (recomendado).
```

Approval expirado (default 24h) → cancelado automáticamente.

### Audit trail

Todo run + toda action queda en `agent_runs` y `agent_actions`. RLS garantiza que un tenant no ve runs de otro. Auditoría tiene `runs:read` y opera transversal.

---

## Errores típicos a evitar

1. **Hardcodear scope checks en runner.** El middleware `requireAgentAuth(req, scopes[])` ya lo hace; runner debe asumir que llegó autorizado.
2. **Compartir API key entre agentes.** Rompe el modelo. Una key = una identidad.
3. **Saltar idempotency en POST.** Reintentos de webhook causan duplicados.
4. **Asumir AUTO en acciones nuevas.** Default seguro es REQUIRE_APPROVAL hasta que se valide.
5. **Modificar `agents.config` desde el runner.** `config` es read-only para el agente; solo platform admin lo edita.
6. **Bypass de RLS via service role en endpoints públicos.** Service role solo en server-side admin paths, nunca tras `requireAgentAuth`.

---

## Onboarding rápido para Andrés (CTO OpenClaw)

1. Lee este doc + [`AGENT_ROSTER.md`](./AGENT_ROSTER.md) + [`AGENTIC_PRINCIPLES.md`](./AGENTIC_PRINCIPLES.md).
2. Pide a Fran que ejecute la migración para sembrar `andres-cto` en `agents`.
3. Pide credencial vía `/admin/agents/andres-cto/credentials` → label `prod`, scopes mínimos.
4. Implementa lado OpenClaw consumiendo `/api/v1/*`.
5. Suscríbete a webhooks `incident.created`, `approval.granted` para coordinar con BaW.
6. Issue tracking en [`docs/COLAB_ANDRES.md`](./COLAB_ANDRES.md).

---

## Versionado del contrato

Este doc es **v1** del contrato de integración. Breaking changes requieren bump a v2 con migración asistida; non-breaking changes se documentan en changelog al final del doc.

### Changelog

- **2026-05-03 — v1.0** — Documento inicial. Define lifecycle, scopes, clasificación, patrones.
- **2026-05-03 — v1.1** — API v1 endpoints + autonomy slider + approval queue (Fase 2-4 cerradas). Ver Apéndice A para curl examples.

---

## Apéndice A — Curl examples (v1.1)

Reemplaza `$BAW_API_KEY` con la credencial del agente y `$BASE_URL` con `https://baw-os.vercel.app` (o tu deploy).

### Reads

```bash
# Units (filtros: status, building_id, occupancy_status)
curl -H "Authorization: Bearer $BAW_API_KEY" \
  "$BASE_URL/api/v1/units?status=active&limit=25"

# Reservations (filtros: status, unit_id, check_in_from/to)
curl -H "Authorization: Bearer $BAW_API_KEY" \
  "$BASE_URL/api/v1/reservations?status=confirmed"

# Payments (filtros: status, contract_id, due_from/to)
curl -H "Authorization: Bearer $BAW_API_KEY" \
  "$BASE_URL/api/v1/payments?status=pending&due_from=2026-05-01"

# Contracts (filtros: status, unit_id, occupant_id)
curl -H "Authorization: Bearer $BAW_API_KEY" \
  "$BASE_URL/api/v1/contracts?status=active"

# Incidents
curl -H "Authorization: Bearer $BAW_API_KEY" \
  "$BASE_URL/api/v1/incidents?status=open"

# Tasks
curl -H "Authorization: Bearer $BAW_API_KEY" \
  "$BASE_URL/api/v1/tasks?status=pending"

# Runs (historial del agente)
curl -H "Authorization: Bearer $BAW_API_KEY" \
  "$BASE_URL/api/v1/runs?limit=20"

# Agents (con autonomy_level efectivo)
curl -H "Authorization: Bearer $BAW_API_KEY" \
  "$BASE_URL/api/v1/agents"

# Insights / summary (KPIs agregados)
curl -H "Authorization: Bearer $BAW_API_KEY" \
  "$BASE_URL/api/v1/insights/summary"
```

### Writes (con idempotency)

Todos los POST requieren header `Idempotency-Key` (UUID v4 recomendado). Mismo key + mismo body = misma respuesta cacheada. Mismo key + body distinto = 409 Conflict.

```bash
# Crear incidente (AUTO si autonomy ≥ L2 para incident.create)
curl -X POST -H "Authorization: Bearer $BAW_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"unit_id":"u_123","category":"plumbing","severity":"medium","description":"Fuga lavabo"}' \
  "$BASE_URL/api/v1/incidents"

# Crear tarea
curl -X POST -H "Authorization: Bearer $BAW_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"title":"Inspeccionar unidad 12B","assigned_to":"alicia-ops","due_at":"2026-05-10"}' \
  "$BASE_URL/api/v1/tasks"

# Mensaje a inquilino (REQUIRE_APPROVAL — devuelve 202 + approval_id)
curl -X POST -H "Authorization: Bearer $BAW_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"contract_id":"c_456","channel":"whatsapp","body":"Recordatorio: pago vence el 15."}' \
  "$BASE_URL/api/v1/messages"

# Disparar run del agente (slug debe coincidir con el dueño de la API key)
curl -X POST -H "Authorization: Bearer $BAW_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"input":{"trigger":"daily_summary"}}' \
  "$BASE_URL/api/v1/agents/cobranza/run"
```

### Approvals lifecycle

```bash
# Listar pendientes
curl -H "Authorization: Bearer $BAW_API_KEY" \
  "$BASE_URL/api/v1/approvals?status=pending"

# Detalle
curl -H "Authorization: Bearer $BAW_API_KEY" \
  "$BASE_URL/api/v1/approvals/ap_123"

# Aprobar (requiere scope approvals:resolve) → dispara dispatcher que ejecuta la acción
curl -X POST -H "Authorization: Bearer $BAW_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  "$BASE_URL/api/v1/approvals/ap_123/grant"

# Denegar
curl -X POST -H "Authorization: Bearer $BAW_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"reason":"Política tarifaria no autoriza descuento"}' \
  "$BASE_URL/api/v1/approvals/ap_123/deny"
```

### Admin (humano autenticado por sesión, no API key)

```bash
# Editar policies de un agente (autonomy_level 0-4 + per-action overrides + rate caps)
curl -X PUT -b "sb-access-token=$SUPABASE_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"autonomy_level":2,"active":true,"per_action":{"message.send_to_tenant":"AUTO"},"rate_caps":{"per_hour":50}}' \
  "$BASE_URL/api/admin/agents/cobranza/policies"

# Aprobar como humano (UI lo hace por dentro)
curl -X POST -b "sb-access-token=$SUPABASE_SESSION" \
  "$BASE_URL/api/admin/approvals/ap_123/grant"
```

### Niveles de autonomía (Fase 4)

| Nivel | Nombre        | Comportamiento por defecto                                  |
|-------|---------------|-------------------------------------------------------------|
| L0    | Disabled      | Todas las acciones bloqueadas                               |
| L1    | Suggest only  | Toda acción → REQUIRE_APPROVAL                              |
| L2    | Approve each  | AUTO para reads y writes seguros; REQUIRE_APPROVAL para resto |
| L3    | Approve batch | AUTO para la mayoría; REQUIRE_APPROVAL para irreversibles externos |
| L4    | Read-only     | Solo lectura; ningún write permitido                        |

Irreversibles externos (siempre REQUIRE_APPROVAL independientemente del nivel): `payment.charge`, `payment.refund`, `cfdi.emit`, `contract.sign`, `contract.terminate`, `policy.modify`.
