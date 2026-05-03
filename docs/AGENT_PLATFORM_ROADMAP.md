# BaW OS — Agent Platform Roadmap

> Plan canónico para convertir BaW OS en una plataforma operada por humanos **y** agentes (internos + third-party). Basado en los principios condensados en [`docs/AGENTIC_PRINCIPLES.md`](./AGENTIC_PRINCIPLES.md), el roster definido en [`docs/AGENT_ROSTER.md`](./AGENT_ROSTER.md), y el protocolo de integración de [`docs/AGENT_INTEGRATION.md`](./AGENT_INTEGRATION.md).
>
> Última actualización: 2026-05-03 — **Fases 0-4 cerradas (~80% delivery, pendiente Fase 5: irreversibles externos)**

---

## TL;DR

BaW OS evoluciona de **app multi-tenant para humanos** → **plataforma multi-actor** donde los actores son tanto **personas** como **agentes** (10 internos + 6 ZXY third-party). El roadmap tiene **5 fases** que se implementan en este orden, cada una con criterios de éxito y reversibilidad explícitos.

| Fase | Objetivo | Duración | Bloquea | Reversible |
|---|---|---|---|---|
| **0** | Documentos canónicos en repo | 1 sesión | — | Sí (solo docs) |
| **1** | Identidad por agente (API keys, scopes) | 1 sprint | Fases 2–4 | Sí (feature flag) |
| **2** ✅ | API pública v1 (REST → MCP adapter) | 2 sprints | Fase 4 | Parcial (versionada) |
| **3** ✅ | Modo Human/Agent en UI | 1 sprint | — | Sí (toggle por user) |
| **4** ✅ | Autonomy slider + policies engine | 1 sprint | — | Sí (defaults conservadores) |

---

## Principios rectores

1. **Mismos datos, dos lenguajes.** UI Human y UI Agent comparten data layer; difieren en densidad, velocidad y forma de interacción.
2. **Una identidad por agente, por org.** No hay `BAW_API_KEY` global. Cada agente tiene su credencial, sus scopes y su rate-limit.
3. **Clasificación obligatoria de cada acción**: `AUTO` (agente la hace y notifica) / `LOG` (agente la hace y loggea) / `REQUIRE_APPROVAL` (humano debe aprobar). Default conservador.
4. **REST primero, MCP encima.** Construimos REST v1 estable y MCP es un adapter encima. No al revés.
5. **Supervisor/worker por defecto.** Hugo-COS orquesta a los demás ZXY; BaW Coordinador orquesta los 10 internos. Nada de mesh sin razón clara.
6. **Reversibilidad obligatoria.** Toda fase debe poder apagarse vía feature flag o reset de policy sin pérdida de datos.

---

## Fase 0 — Documentos canónicos

**Objetivo:** que el repo contenga la verdad canónica del sistema agentic, no Notion. Notion queda como bitácora viva, repo como contrato.

### Entregables

- [`docs/AGENT_PLATFORM_ROADMAP.md`](./AGENT_PLATFORM_ROADMAP.md) (este doc)
- [`docs/AGENT_INTEGRATION.md`](./AGENT_INTEGRATION.md) — cómo conectar agentes externos
- [`docs/AGENT_ROSTER.md`](./AGENT_ROSTER.md) — quién es quién, autonomía default, scopes default
- [`docs/AGENTIC_PRINCIPLES.md`](./AGENTIC_PRINCIPLES.md) — condensación operable del Notion doc maestro

### Criterios de éxito

- Cualquier persona técnica que clone el repo puede entender el modelo de agentes sin abrir Notion.
- Andrés (CTO OpenClaw) puede leer estos 4 docs y empezar a integrar sin reuniones.
- Claude Code / Codex / Cursor pueden tomar tareas sobre agentes con contexto suficiente.

---

## Fase 1 — Identidad por agente

**Objetivo:** que cada agente tenga su propia API key, sus scopes y su rate-limit. Eliminar `BAW_API_KEY` global como concepto.

### Schema (nueva migración)

```sql
CREATE TABLE public.agent_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,                          -- 'prod', 'staging', 'dev-local'
  api_key_hash TEXT NOT NULL,                   -- bcrypt(sk_live_xxx)
  api_key_prefix TEXT NOT NULL,                 -- 'sk_live_abc...' (primeros 12 chars para UI)
  scopes TEXT[] NOT NULL DEFAULT '{}',          -- ['units:read','reservations:write',...]
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','revoked','expired')),
  rate_limit_tier TEXT NOT NULL DEFAULT 'standard'
    CHECK (rate_limit_tier IN ('standard','elevated','unlimited')),
  expires_at TIMESTAMPTZ,                       -- NULL = no expira
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (org_id, agent_id, label)
);

CREATE INDEX idx_agent_credentials_lookup
  ON public.agent_credentials (api_key_prefix)
  WHERE status = 'active';
```

RLS: solo platform admins y admins del tenant ven las credenciales del tenant. Nunca se devuelve `api_key_hash` ni la key completa después de creación.

### UI

- `/admin/agents/[id]/credentials` — listar, crear (solo aparece la key completa una vez), revocar.
- Banner explícito: "Esta es la única vez que verás la key completa. Guárdala ahora."

### API auth refactor

- Middleware `requireAgentAuth(req, requiredScopes)` reemplaza el patrón actual `req.headers['x-api-key'] === BAW_API_KEY`.
- Resuelve agente por hash, valida scopes, registra en `agent_credentials.last_used_at`.
- Endpoints actuales (`/api/mora`) mantienen compat por feature flag durante 1 sprint.

### Criterios de éxito

- 17 credenciales generables (10 BaW + 6 ZXY + BaW Coordinador) por org sin colisiones.
- `/api/mora` rechaza requests con `x-api-key` que no resuelva a credencial activa con scope `mora:trigger`.
- Rotación de key revoca anterior atómicamente.

---

## Fase 2 — API pública v1 ✅ (cerrada 2026-05-03)

**Estado:** 16 endpoints v1 entregados — 11 reads (`units`, `reservations`, `payments`, `contracts`, `incidents`, `tasks`, `runs`, `agents`, `insights/summary`, `approvals`, `approvals/:id`) + 5 writes con clasificación AUTO/LOG/REQUIRE_APPROVAL (`incidents`, `tasks`, `messages`, `agents/:id/run`, `approvals/:id/grant|deny`). Helper compartido (`v1Read` + `v1Write`) con idempotency, scopes, classifier y middleware. Dispatcher diferido por `action_type`. 28 tests pure-logic passing. Ver `docs/AGENT_INTEGRATION.md` Apéndice A para curl examples.

**Objetivo:** superficie estable y versionada bajo `/api/v1/*` que los agentes (internos y ZXY) usan para leer y escribir el estado del sistema.

### Endpoints (mínimo viable)

| Endpoint | Métodos | Scopes | Clasificación default |
|---|---|---|---|
| `/v1/units` | GET, POST, PATCH | `units:read`, `units:write` | LOG (read) / REQUIRE_APPROVAL (write nuevo) / AUTO (patch propio) |
| `/v1/reservations` | GET, POST, PATCH | `reservations:*` | LOG / REQUIRE_APPROVAL / AUTO |
| `/v1/payments` | GET, POST | `payments:*` | LOG / REQUIRE_APPROVAL |
| `/v1/contracts` | GET, POST, PATCH | `contracts:*` | LOG / REQUIRE_APPROVAL |
| `/v1/incidents` | GET, POST, PATCH | `incidents:*` | LOG / AUTO / AUTO |
| `/v1/tasks` | GET, POST, PATCH | `tasks:*` | LOG / AUTO / AUTO |
| `/v1/agents/:id/run` | POST | `agents:run` | LOG (cobertura por policy) |
| `/v1/runs` | GET | `runs:read` | LOG |
| `/v1/insights/:topic` | GET | `insights:read` | LOG |
| `/v1/messages` | POST | `messages:send` | REQUIRE_APPROVAL (default) |

### Convenciones

- Versionado en path (`/v1/`), no en header.
- Errores como JSON-API style: `{ error: { code, message, details? } }`.
- Pagination cursor-based (`?cursor=...&limit=...`).
- Idempotency-Key header en todos los POST/PATCH.
- Webhooks bidireccionales: `POST /v1/webhooks` para que agentes externos reciban eventos.

### MCP adapter

Después de v1 estable, exponer las mismas operaciones vía MCP server. El adapter mapea tools MCP → endpoints REST internos. Agentes que prefieran MCP (Claude Desktop nativo, etc.) lo consumen sin que dupliquemos lógica.

### Criterios de éxito

- Agente externo (ZXY o tercero) puede operar BaW OS solo con docs públicos + API key.
- Hugo-COS puede invocar a Alicia-Ops vía REST sin hardcoding.
- Cobertura de tests >80% en endpoints v1.

---

## Fase 3 — Modo Human/Agent en UI ✅ (cerrada 2026-05-03)

**Estado:** ViewModeSwitch integrado en sidebar global. AgentModeView muestra roster con autonomy badges L0-L4. ApprovalQueueClient conectada a `/api/admin/approvals/:id/(grant|deny)` con UI inline. Retícula BaW global confirmada (`<BawGrid position="fixed" />` en AppShell). Links a `/agents/[id]/policies` en cada card del roster.

**Objetivo:** que la UI tenga dos lenguajes visuales según el contexto del usuario, sin duplicar páginas.

### Mecanismo

- Switch en navbar: `Human ↔ Agent`.
- Persistido en `org_members.preferred_view_mode` (`'human' | 'agent'`).
- Layout shell condicional: rutas como `/dashboard`, `/agents`, `/units` renderizan layouts distintos según el modo.
- **Mismos datos, diferente densidad y velocidad.**

### Modo Human (default)

- Lo que ya existe hoy.
- Cards generosas, jerarquías visuales claras, onboarding tooltips.
- Optimizado para descubrimiento y comprensión.

### Modo Agent (Bloomberg/Linear-style)

Layout 3-paneles típico:

```
┌─────────────────────────────────────────────────────┐
│ Exceptions Bar (top)                                │
│ 3 reservations awaiting approval · 1 mora critical  │
├──────────┬──────────────────────┬───────────────────┤
│          │                      │                   │
│ Roster   │  Activity Timeline   │  Approval Queue   │
│ sidebar  │  (live feed)         │  (action items)   │
│          │                      │                   │
│ Hugo-COS │  10:23 Cobranza      │  ☐ Approve email  │
│ Alicia   │  ran (87 invoices)   │     to T. Garcia  │
│ Beto     │  10:24 Mora notif    │  ☐ Approve refund │
│ Maribel  │  sent to 3 tenants   │     $1,200 MXN    │
│ Luis     │  ...                 │                   │
│          │                      │                   │
└──────────┴──────────────────────┴───────────────────┘
                              ┌───────────────────────┐
                              │  Upcoming (7 days)    │
                              └───────────────────────┘
```

### Criterios de éxito

- Switch persiste entre sesiones.
- Modo Agent carga `<150ms` (densidad alta no debe sacrificar perf).
- Exceptions-first: si hay excepción crítica, salta encima del feed normal.
- Retícula del fondo (distintivo BaW) presente en ambos modos.

---

## Fase 4 — Autonomy slider + policies engine ✅ (cerrada 2026-05-03)

**Estado:** UI `/agents/[id]/policies` con slider 0-4 + per-action overrides agrupados + rate caps. API admin `GET|PUT /api/admin/agents/:id/policies` con audit. Classifier respeta override per-action salvo para irreversibles externos (locked: payment.charge, payment.refund, cfdi.emit, contract.sign, contract.terminate, policy.modify). Defaults conservadores: L4 (read-only) para Rafa/Reportes/Auditoría; L1 (suggest) para Beto/Maribel/Tarifas/Facturación/Fiscal.

**Objetivo:** que el dueño del tenant pueda regular **cuánto** decide cada agente sin tocar código, y que policies se respeten transversalmente.

### Schema

```sql
CREATE TABLE public.agent_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  autonomy_level INT NOT NULL CHECK (autonomy_level BETWEEN 0 AND 4),
  -- L0=disabled · L1=suggest only · L2=approve each · L3=approve batch · L4=full auto
  per_action JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- override por action_type, p.ej. {"email.send":"REQUIRE_APPROVAL", "incident.update":"AUTO"}
  rate_caps JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- {"actions_per_hour":50, "approvals_pending_max":20}
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (org_id, agent_id)
);
```

### Defaults conservadores propuestos

| Agente | Autonomy default | Razón |
|---|---|---|
| Hugo-COS | L2 | Orquestador, decisiones de routing, bajo riesgo. |
| Alicia-Ops | L3 | Volumen alto, acciones bien definidas. |
| Beto-Conta | L1 | Dinero involucrado, riesgo regulatorio. |
| Maribel-Law | L1 | Decisiones legales irreversibles. |
| Luis-Growth | L2 | Outbound, riesgo de spam si L4. |
| Andrés-CTO | L2 | Acciones técnicas con impacto productivo. |
| Rafa-Research | L4 | Solo lee + sintetiza, sin write afuera. |
| Cobranza | L2 | Manda emails a clientes. |
| Mantenimiento | L3 | Crea tasks, asigna técnicos. |
| Reservas/Atención | L2 | CX directo. |
| Tarifas | L1 | Cambios de pricing impactan ingresos. |
| Renovaciones | L2 | Outreach a residentes. |
| Facturación | L1 | CFDI = SAT, cero margen de error. |
| Reportes | L4 | Read-only + síntesis. |
| Auditoría | L4 | Read-only governance. |
| Fiscal | L1 | Compliance, cero margen. |

### UI

- Página `/admin/agents/[id]/policies` con slider 0–4 + toggles por action_type.
- Audit log: quién cambió la policy, cuándo, valor anterior y nuevo.

### Criterios de éxito

- Cambiar autonomía de un agente toma <30s sin SQL.
- Agente respeta su policy en runtime (test: subir Beto a L4 y ver que requiere approval no se gatilla).
- Audit trail completo de cambios de policy.

---

## Cómo ejecutar este roadmap

**Opciones equivalentes** (cualquiera funciona, cualquiera es interrumpible):

1. **Claude Code (VS Code o Desktop)** con [`CLAUDE.md`](../CLAUDE.md) + estos docs. Mejor para flujo continuo y diseño visual.
2. **Codex / Cursor** con [`AGENTS.md`](../AGENTS.md) + estos docs. Mejor para refactors grandes con review humano agresivo.
3. **Computer (Perplexity)** con sesión activa. Mejor para handoff cross-session y multi-tooling.
4. **Andrés (CTO OpenClaw)** vía Discord, siguiendo [`docs/COLAB_ANDRES.md`](./COLAB_ANDRES.md).

Convención cross-tool: una rama por fase, PR a `main` con review humano explícito (no auto-merge), single-line commits.

---

## Referencias internas

- [`CLAUDE.md`](../CLAUDE.md) — briefing canónico Claude Code
- [`AGENTS.md`](../AGENTS.md) — briefing canónico Codex/Cursor
- [`docs/PROJECT_STATE.md`](./PROJECT_STATE.md) — estado vivo del sprint
- [`docs/MIGRATION_GUIDE.md`](./MIGRATION_GUIDE.md) — cómo arrancar en cada herramienta
- [`docs/COLAB_ANDRES.md`](./COLAB_ANDRES.md) — protocolo Andrés/Discord
- [`docs/AGENT_ROSTER.md`](./AGENT_ROSTER.md) — quién es quién
- [`docs/AGENT_INTEGRATION.md`](./AGENT_INTEGRATION.md) — cómo conectar
- [`docs/AGENTIC_PRINCIPLES.md`](./AGENTIC_PRINCIPLES.md) — principios condensados
