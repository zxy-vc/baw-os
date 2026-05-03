# BaW OS — Agentic Design Principles (condensado)

> Condensación operable del doc maestro de Notion ["Agentic Design Principles — BaW OS / ZXY Platforms"](https://www.notion.so/zxyventures/Agentic-Design-Principles-BaW-OS-ZXY-Platforms-355169373e72818dba04e653ecec8e58). Notion queda como bitácora viva; este doc es el contrato canónico para implementación.
>
> Última actualización: 2026-05-03

---

## 1. Cambio de paradigma — Operator → Supervisor

**Antes (Operator):** humano ejecuta cada tarea, software es herramienta pasiva.
**Ahora (Supervisor):** humano define intención, agentes ejecutan, humano supervisa excepciones.

### Implicaciones de UX (Nielsen)

- La UI deja de ser "menús + formularios" y se convierte en **dashboard de excepciones + timeline de actividad + cola de aprobaciones**.
- Onboarding cambia: el humano aprende a **delegar y supervisar**, no a hacer click-by-click.
- Estado por defecto: **silencio operativo**. El sistema solo notifica cuando algo requiere atención.

### Implicación para BaW OS

- Modo Agent (Fase 3) debe mostrar **excepciones primero**, actividad después, controles al final.
- Modo Human (default) sigue existiendo para descubrimiento y onboarding.

---

## 2. Lifecycle agentic (Smashing) — 6 patrones

Todo agente atraviesa estos 6 momentos. La UI y la API deben soportar cada uno explícitamente.

| Fase | Pregunta del usuario | Soporte BaW |
|---|---|---|
| **1. Discovery** | ¿Qué puede hacer este agente? | Página `/agents` con catálogo + capabilities + autonomy actual |
| **2. Onboarding** | ¿Cómo lo configuro? | UI `/admin/agents/{id}` para credentials + policies |
| **3. Activation** | ¿Cómo lo arranco? | Botón "Run" + cron + webhook trigger |
| **4. Active use** | ¿Qué está haciendo? | Timeline en vivo, runs page, exceptions bar |
| **5. Recovery** | ¿Qué pasa cuando falla? | Approval queue + retry + escalation a humano |
| **6. Deactivation** | ¿Cómo lo apago? | Status `paused` + revoke credentials, sin pérdida de audit |

### 12 patrones HatchWorks (referenciados, no obligatorios)

Resumen: progressive disclosure, transparent reasoning, controllable autonomy, graceful degradation, undo affordance, explicit boundaries, conversational + structured I/O, attention budget, multi-modal feedback, error recovery, trust calibration, identity persistence.

### Framework ADEPTS

**A**utonomy · **D**ecision visibility · **E**rror recovery · **P**ersonalization · **T**ransparency · **S**afety. Toda decisión de UI agente debe puntuar las 6.

### Máquina de estados de un agente

```
idle → activated → running → (succeeded | failed | partial | awaiting_approval) → idle
                              ↓
                         approval_pending → (approved → running) | (denied → idle)
```

`agent_runs.status` ya implementa esto: `running | succeeded | failed | partial | canceled`. Falta solo `awaiting_approval` que en v1 puede vivir en `agent_actions.status='pending_approval'` y mantener `agent_runs.status='partial'` hasta resolver.

---

## 3. Niveles de autonomía

Combinamos dos frameworks:

### Knight Columbia L1–L5 (capabilities)

- **L1** — Single-task assistant. Ejecuta una tarea específica, humano supervisa cada output.
- **L2** — Multi-task within domain. Ejecuta secuencias dentro de un dominio (e.g. cobranza completa).
- **L3** — Cross-domain orchestration. Coordina múltiples dominios o agentes.
- **L4** — Autonomous goal pursuit. Persigue un objetivo abstracto sin pasos prescritos.
- **L5** — Open-ended generative. Define sus propios objetivos. **No usar en producción BaW.**

### CEI A0–A4 (control)

- **A0** — Disabled.
- **A1** — Suggest only. Agente propone, humano decide y ejecuta.
- **A2** — Approve each. Agente propone + ejecuta tras approval por acción.
- **A3** — Approve batch. Agente ejecuta lotes con approval del lote.
- **A4** — Full auto. Agente ejecuta sin approval, humano revisa post-hoc vía audit.

### Mapeo BaW

Usamos **A0–A4** como `autonomy_level` en `agent_policies` (Fase 4). El nivel L de capability se infiere del scope: un agente con scopes cross-domain implícitamente está en L3+.

> Default conservador siempre: nuevo agente arranca en A1 hasta validación.

---

## 4. Coordinación multi-agente

### Patrón canónico — Supervisor / Worker

Un agente supervisor (`hugo-cos`, `baw`) recibe la intención del humano y delega a workers. Workers no se hablan entre sí; el supervisor agrega outputs.

```
Humano
  ↓ define objetivo
Supervisor (Hugo-COS o BaW)
  ↓ delega
Worker A · Worker B · Worker C
  ↓ ejecutan en paralelo o secuencia
Supervisor agrega resultado
  ↓ reporta
Humano
```

### Anti-patrones a evitar

- **Mesh sin coordinador.** Workers hablándose entre sí sin supervisor → caos, deadlocks, feedback loops.
- **Supervisor mutante.** Agente cambia su rol durante una run → debugging imposible.
- **Recursión sin tope.** Supervisor delega a sí mismo o crea ciclos → siempre poner `max_depth=3` en delegaciones.

### Patrón alterno — Pipeline determinista

Cuando la secuencia es fija (e.g. cierre mensual: Cobranza → Facturación → Reportes), usar cron con jobs encadenados, NO supervisor LLM. Más predecible, más barato.

---

## 5. Command center patterns

### Densidad — Bloomberg-style en Modo Agent

- Información crítica en encima del fold: excepciones, KPIs en deltas, runs en vivo.
- Tipografía monoespaciada para datos numéricos.
- Color con propósito (rojo = excepción, ámbar = pending approval, verde = ok), nunca decorativo.
- Sin scroll innecesario en pantalla principal.

### Exception-first

- La UI **no muestra todo lo que está bien**; muestra **lo que requiere atención**.
- Si no hay excepciones: pantalla casi vacía con mensaje "All systems normal" + último run resumido.

### Activity timeline

- Feed unificado de runs + actions + approvals.
- Filtros por agente, por org, por severidad.
- Eventos firmados con `correlation_id` para rastrear cadenas de delegación.

### Approval queue

- Cola lateral con items pending_approval ordenados por `expires_at` ascendente.
- Cada item: agente, action_type, payload preview, botones Approve / Deny.
- Bulk approve solo para acciones del mismo type del mismo agente.

---

## 6. Referentes de industria (no copiar, aprender)

- **Microsoft Copilot Studio** — agent identity, scoped permissions, telemetría granular.
- **Salesforce Agentforce** — autonomy por agente, org-level governance.
- **Palantir Foundry** — operadores humanos como first-class citizens, auditoría como producto.
- **Linear** — comando + atajos de teclado, densidad sin sacrificar legibilidad.
- **Bloomberg Terminal** — densidad extrema, exception-first, monospace.
- **Stripe Dashboard** — read-first con write-on-demand, audit trail nativo.

---

## 7. Voces de industria + cognición (síntesis)

- **Sutton (2024):** "The bitter lesson aplica también al diseño: agentes con menos hand-coded rules y más feedback loops escalan mejor."
- **Sutskever:** atención del usuario es el recurso más escaso; el sistema debe protegerla con default silencio operativo.
- **Norman (cognición):** el costo cognitivo de aprobar > el de descartar. Approvals deben ser binarios y rápidos; los detalles, on-demand.
- **Doctorow:** el riesgo de los agentes no es técnico sino de gobernanza. Audit trails inmutables y reversibilidad son **product features**, no nice-to-haves.

---

## Aplicación inmediata a BaW OS

| Principio | Aplicación |
|---|---|
| Operator → Supervisor | Modo Agent (Fase 3) muestra excepciones primero. |
| Lifecycle 6 fases | UI `/agents` cubre Discovery + Onboarding + Activation; runs page cubre Active use + Recovery; status `paused` cubre Deactivation. |
| Niveles autonomía | `agent_policies.autonomy_level` (Fase 4) = A0–A4. |
| Supervisor/worker | Hugo-COS y BaW son únicos supervisores; resto son workers. |
| Command center | Layout 3-paneles tipo Bloomberg en Modo Agent (Fase 3). |
| Exception-first | Exceptions bar pegada al top en Modo Agent. |
| Audit como feature | `agent_runs` + `agent_actions` ya inmutables; UI debe exponerlos. |
| Reversibilidad | Toda fase del roadmap apagable vía feature flag. |

---

## Referencias externas

- Notion master doc: [Agentic Design Principles — BaW OS / ZXY Platforms](https://www.notion.so/zxyventures/Agentic-Design-Principles-BaW-OS-ZXY-Platforms-355169373e72818dba04e653ecec8e58)
- Knight Columbia "Levels of Autonomy" (L1–L5)
- HatchWorks "12 Patterns for Agentic UX"
- Smashing Magazine "Designing for AI Agents Lifecycle"
- Nielsen Norman Group "Operator vs Supervisor UX"
- Bloomberg Terminal & Linear como referencias visuales de densidad
