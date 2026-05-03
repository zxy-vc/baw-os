# BaW OS — Agent Roster

> Quiénes son los agentes que operan BaW OS. Agrupa los **10 internos BaW** (`pm-ops`, `experiencia`, `inteligencia`), el **BaW Coordinador** y los **6 ZXY third-party**. Define autonomía default, scopes default y rol esperado.
>
> Última actualización: 2026-05-03

---

## Estructura

| Family | Cantidad | Quiénes | Identidad |
|---|---|---|---|
| `baw-coord` | 1 | BaW (coordinador raíz) | Único, orquesta agentes BaW internos |
| `ops-core` | 3 | Cobranza, Mantenimiento, Facturación | BaW internos |
| `experiencia` | 3 | Reservas, Atención, Tarifas, Renovaciones | BaW internos (Atención y Renovaciones cuentan como experiencia) |
| `inteligencia` | 3 | Reportes, Auditoría, Fiscal | BaW internos |
| `third-party` | 7 | Hugo-COS, Alicia-Ops, Beto-Conta, Maribel-Law, Luis-Growth, Andrés-CTO, Rafa-Research | ZXY shared, conectables |

> Total: 10 internos + 1 coordinador + 7 third-party = **18 agentes** (16 + Andrés + Rafa nuevos en este doc).

---

## ZXY Third-party

Agentes externos que **operan en nombre de la org BaW** vía API pública con identidad propia.

### Hugo Sánchez — Chief of Staff

- `id`: `hugo-cos`
- **Rol:** orquestador. Recibe instrucciones del humano CEO/CoS y delega a Alicia, Beto, Maribel, Luis, Andrés, Rafa. Sintetiza outputs y rinde cuentas.
- **Autonomy default:** L2 (approve each delegation)
- **Scopes default:** `agents:run`, `runs:read`, `tasks:read`, `tasks:write`, `messages:send`, `insights:read`
- **Patrón:** supervisor. Nunca actúa directo en payments/contracts/CFDI; siempre delega.
- **Acción típica:** "Coordina cierre mensual: ejecuta Beto-Conta, espera resultado, dispara Reportes."

### Alicia Cervantes — COO / Operadora Virtual BaW Mateos 809P

- `id`: `alicia-ops`
- **Rol:** operaciones diarias del producto BaW. Tiene acceso amplio a unidades, reservas, incidencias.
- **Autonomy default:** L3 (approve batch)
- **Scopes default:** `units:read`, `units:write`, `reservations:read`, `reservations:write`, `incidents:*`, `tasks:*`, `messages:send`
- **Patrón:** worker bajo Hugo, también puede recibir órdenes directas del humano.
- **Acción típica:** "Procesa todas las check-ins de hoy y reporta excepciones."

### Beto — CFO / Contador

- `id`: `conta-beto`
- **Rol:** contabilidad, conciliación bancaria, soporte a Facturación interno.
- **Autonomy default:** L1 (suggest only)
- **Scopes default:** `payments:read`, `payments:trigger` (con REQUIRE_APPROVAL en `payment.charge`), `insights:read`, `messages:send`
- **Patrón:** worker. Riesgo regulatorio alto, autonomía baja por diseño.
- **Acción típica:** "Concilia cuenta BBVA con pagos del mes."

### Maribel — CLO / Abogada Virtual

- `id`: `maribel-law`
- **Rol:** contratos, NDA, cumplimiento legal LATAM.
- **Autonomy default:** L1 (suggest only)
- **Scopes default:** `contracts:read`, `contracts:write` (con REQUIRE_APPROVAL en `contract.sign`), `insights:read`, `messages:send`
- **Patrón:** worker. Decisiones legales irreversibles → autonomía baja.
- **Acción típica:** "Revisa contrato de proveedor X y marca cláusulas de riesgo."

### Luis — CGO / Growth & GTM

- `id`: `luis-growth`
- **Rol:** outbound, marketing, captación de tenants y propietarios.
- **Autonomy default:** L2 (approve each)
- **Scopes default:** `messages:send`, `insights:read`, `tasks:read`, `tasks:write`
- **Patrón:** worker. Riesgo de spam si L4; mantener L2 hasta validar.
- **Acción típica:** "Manda secuencia de outreach a 50 propietarios potenciales."

### Andrés — CTO OpenClaw

- `id`: `andres-cto` (NUEVO — pendiente migración)
- **Rol:** coordinación técnica cross-platform. Ejecuta tasks técnicas que cruzan BaW ↔ OpenClaw ↔ otras plataformas ZXY.
- **Autonomy default:** L2
- **Scopes default:** `tasks:read`, `tasks:write`, `incidents:read`, `incidents:write`, `runs:read`
- **Patrón:** worker técnico. Coordinación con humano Andrés vía Discord (ver [`COLAB_ANDRES.md`](./COLAB_ANDRES.md)).
- **Acción típica:** "Crea incidente cross-platform cuando OpenClaw detecta anomalía en sync con BaW."

### Rafa — Research / Customer Development

- `id`: `rafa-research` (NUEVO — pendiente migración)
- **Rol:** investigación de mercado, customer dev, síntesis competitiva. Read-only respecto al sistema operativo.
- **Autonomy default:** L4 (full auto)
- **Scopes default:** `insights:read`, `runs:read`, `units:read` (solo si necesita data agregada)
- **Patrón:** worker independiente. Read-only afuera del producto, autonomía alta porque no hay efectos irreversibles.
- **Acción típica:** "Sintetiza tendencias del mercado MTR en Querétaro Q2 2026."

---

## BaW Coordinador

### BaW (raíz)

- `id`: `baw` (raíz de family `baw-coord`)
- **Rol:** orquestador supremo de los 10 agentes internos. No es ZXY; es producto.
- **Autonomy default:** L2
- **Scopes default:** `agents:run`, `agents:manage`, `runs:read`, `policies:read`, `tasks:*`, `insights:read`
- **Patrón:** supervisor de Cobranza, Mantenimiento, Facturación, Reservas, Atención, Tarifas, Renovaciones, Reportes, Auditoría, Fiscal.
- **Acción típica:** "Cron diario 02:00 — ejecuta Cobranza, espera, dispara Reportes."

---

## BaW Internos

### Operaciones Core (`ops-core`)

#### Cobranza

- `id`: `cobranza`
- Outreach automatizado mora preventiva/reactiva, escalonado.
- **Autonomy default:** L2
- **Scopes:** `payments:read`, `messages:send` (REQUIRE_APPROVAL si monto > umbral), `tasks:write`
- Estado actual: **único agente con runner implementado** (`src/lib/agents/registry.ts`).

#### Mantenimiento

- `id`: `mantenimiento`
- Triage de incidencias, asignación de técnicos, follow-up.
- **Autonomy default:** L3
- **Scopes:** `incidents:*`, `tasks:*`, `messages:send_internal`, `units:read`

#### Facturación

- `id`: `facturacion`
- CFDI 4.0 vía PAC, conciliación, recibos electrónicos.
- **Autonomy default:** L1 (SAT = cero margen)
- **Scopes:** `payments:read`, `cfdi:emit` (siempre REQUIRE_APPROVAL), `contracts:read`

### Experiencia (`experiencia`)

#### Reservas

- `id`: `reservas`
- STR/MTR booking management, channel sync.
- **Autonomy default:** L2
- **Scopes:** `reservations:*`, `units:read`, `messages:send`

#### Atención

- `id`: `atencion`
- 24/7 con residentes/huéspedes. FAQs, anuncios, surveys, quejas no críticas.
- **Autonomy default:** L2
- **Scopes:** `messages:*`, `incidents:read`, `incidents:write` (escalation), `tasks:read`

#### Tarifas

- `id`: `tarifas`
- Dynamic pricing por temporada, eventos, ocupación, FX.
- **Autonomy default:** L1 (cambios de pricing impactan ingresos)
- **Scopes:** `units:read`, `units:write` (solo `pricing` field), `insights:read`

#### Renovaciones

- `id`: `renovaciones`
- Outreach 60/30/15 días pre-vencimiento.
- **Autonomy default:** L2
- **Scopes:** `contracts:read`, `messages:send`, `tasks:write`, `insights:read`

### Inteligencia (`inteligencia`)

#### Reportes

- `id`: `reportes`
- Dashboards de propietario, narrativa LLM, briefings.
- **Autonomy default:** L4 (read-only + síntesis)
- **Scopes:** `*:read` (todos los recursos, solo lectura), `insights:read`, `messages:send_internal`

#### Auditoría

- `id`: `auditoria`
- Audit trail inmutable, anomaly detection.
- **Autonomy default:** L4 (read-only governance)
- **Scopes:** `runs:read`, `*:read` (transversal vía RLS de auditoría)

#### Fiscal

- `id`: `fiscal`
- Validación CFDI/SAT, monitoreo regulatorio.
- **Autonomy default:** L1 (compliance, cero margen)
- **Scopes:** `payments:read`, `cfdi:read`, `contracts:read`, `insights:read`

---

## Tabla resumen autonomía / scopes

| Agente | Family | Autonomía default | Scopes count | Riesgo principal |
|---|---|---:|---:|---|
| Hugo-COS | third-party | L2 | 6 | Mala delegación |
| Alicia-Ops | third-party | L3 | 8+ | Volumen alto |
| Beto-Conta | third-party | L1 | 4 | Dinero |
| Maribel-Law | third-party | L1 | 4 | Legal |
| Luis-Growth | third-party | L2 | 4 | Spam |
| Andrés-CTO | third-party | L2 | 5 | Cross-platform |
| Rafa-Research | third-party | L4 | 3 | Bajo (read-only) |
| BaW (coord) | baw-coord | L2 | 6+ | Orquestación |
| Cobranza | ops-core | L2 | 3 | Customer-facing |
| Mantenimiento | ops-core | L3 | 4 | Volumen |
| Facturación | ops-core | L1 | 3 | SAT |
| Reservas | experiencia | L2 | 3 | Compromiso económico |
| Atención | experiencia | L2 | 4 | CX |
| Tarifas | experiencia | L1 | 3 | Ingresos |
| Renovaciones | experiencia | L2 | 4 | Customer churn |
| Reportes | inteligencia | L4 | many (read) | Bajo (read-only) |
| Auditoría | inteligencia | L4 | many (read) | Bajo (read-only) |
| Fiscal | inteligencia | L1 | 4 | Compliance |

---

## Migraciones pendientes

- [ ] Agregar `andres-cto` a `agents` table (third-party, status='planned').
- [ ] Agregar `rafa-research` a `agents` table (third-party, status='planned').
- [ ] Verificar que los 5 ZXY originales estén en `family='third-party'` (ya hecho por `20260502_agents_third_party_family.sql`).

---

## Cambios respecto a Notion canónico

- **Andrés-CTO** y **Rafa-Research** son nuevos en este roster. Notion los menciona en el doc "Agentic Design Principles" como parte del ZXY Agent OS 1.0 pero no estaban sembrados en `agents`. Se sembrarán en próxima migración.
- El "BaW Coordinador" se mantiene como entidad de family `baw-coord` separada de los 10 internos. Es producto, no ZXY.
