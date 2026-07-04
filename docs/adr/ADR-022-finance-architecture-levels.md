# ADR-022: Arquitectura financiera por niveles (actores y flujos de dinero)

**Status:** Proposed — v3 con feedback de Fran (2026-07-04): taxonomía de 7 actores, comisión base 10% configurable por cliente, plataforma con múltiples revenue streams, y capas de interacción/permisos/límites por actor (§4)
**Date:** 2026-07-04
**Deciders:** Fran (niveles + decisiones §6.1), Claude (propuesta + auditoría)
**Related:** ADR-018 (Stripe checkout público), `docs/PRD.md` §3.4 (pricing SaaS), `docs/PROJECT_STATE.md` (reencuadre 2026-07-01: BaW OS = herramienta interna DuVa ReEs), `docs/specs/people-crm-stays-model.md` (party/payer, facturación B2B consolidada)

---

## 1 · Los niveles: taxonomía canónica de actores

Definición de Fran (2026-07-04): *Plataforma > Property Management Company > Property Owner > Service Providers > Inquilinos fijos > Empresa o huésped que paga > Huéspedes o inquilinos ocupantes*. Nombres propuestos (ajustables — lo importante es que los 7 queden identificados):

| # | Nombre canónico (UI, es-MX) | Nombre técnico (código) | Quién es | Hoy en el sistema |
|---|---|---|---|---|
| **A0** | **Plataforma** | `platform` | BaW OS / ZXY. Máximo nivel | `platform_admins` (solo acceso L0, sin componente monetario) |
| **A1** | **Operadora** | `org` (PM Company) | La administradora de inmuebles. **Nuestro cliente**: a ella le cobra la plataforma | `organizations` + `org_members` (roles `pm_*`) |
| **A2** | **Propietario** | `property_owner` | Dueño del inmueble, cliente de la operadora. Recibe las rentas netas | `property_owners` + `ownership_stakes` |
| **A3** | **Proveedor** | `service_provider` | Terceros que la operadora contrata: mantenimiento, limpieza, utilities, legal, seguridad | Solo texto libre (`expenses.provider`); **sin entidad propia** |
| **A4** | **Titular** (inquilino fijo) | `account_holder` | Quien firma el contrato / tiene la relación comercial con la operadora | `contracts.occupant_id` → `occupants` |
| **A5** | **Pagador** | `payer` | Quien pone el dinero: empresa (housing B2B), huésped que reserva, o el propio titular | `contracts.payer_occupant_id`, `engagements.payer_occupant_id`, `occupants.kind = 'empresa'` |
| **A6** | **Ocupantes** | `occupants` / `guests` | Quienes habitan la unidad (residentes o huéspedes) | `stay_occupants`, `reservations.guest_*` |

**Nota estructural importante:** A4-A6 no son personas necesariamente distintas — son **roles de la parte residente** que el modelo debe permitir separar. En el caso simple (inquilino individual) una misma persona es titular, pagador y ocupante. Los casos que obligan a separarlos ya existen en producción: empresa que paga por sus empleados (payer = empresa, titulares/ocupantes = empleados), papá que paga por estudiante, huésped que reserva para su familia. El refactor party/payer de junio (`20260627_party_kind_payer.sql`, `20260627_stay_occupants.sql`, `engagements`) ya tomó exactamente esta dirección — este ADR lo eleva a taxonomía canónica.

A3 (Proveedor) tampoco es un eslabón "debajo" del propietario en la cadena de rentas: es un actor **lateral** al que la operadora le paga, y cuyo costo se refactura al propietario vía el estado de cuenta. Se lista en la jerarquía porque es un actor financiero de primera clase que hoy no está modelado.

### Mapa de flujos de dinero

```
A0 Plataforma ◄══ (A) suscripción + fees (múltiples streams) ══ A1 Operadora
A1 Operadora ═══ (B) liquidación neta (payout) ═══════════════► A2 Propietario
A1 Operadora ═══ (D) pago de servicios (CxP) ═════════════════► A3 Proveedor
A1 Operadora ◄══ (C) renta / estancia / servicios / mora ═════ A5 Pagador
                  (a nombre del A4 Titular, por la ocupación de los A6 Ocupantes)
```

- **(C)** es el único flujo construido hoy (maduro).
- **(B)** existe como cálculo efímero apagado; **(D)** solo como texto libre en gastos; **(A)** no existe.
- El costo de (D) alimenta a (B): los gastos con proveedor se descuentan del payout del propietario.

---

## 2 · Diagnóstico del estado actual (auditoría 2026-07-04)

### 2.1 — Flujo C (Pagador → Operadora): **completo y maduro. Es el núcleo.**

- **Cargo mensual** = fila en `payments` (renta + `water_fee` + `late_fee_amount`), proyectado por contrato/mes con `src/lib/billing.ts` (fuente única de estatus: `pagado|parcial|pendiente|vencido|mora|verbal`).
- **Abonos** = `payment_receipts` (pagador ≠ titular vía `payer_occupant_id`), con recompute server-side (`POST /api/payments/[id]/recompute`).
- **Bitácora inmutable** = `payment_ledger` (append-only).
- **Cobro con tarjeta**: Stripe PaymentIntents para inquilinos (`/api/payments/checkout` + webhook) y Stripe Checkout hosted para huéspedes del booking público (ADR-018). Cuenta Stripe única, sin Connect.
- **CFDI**: tabla `invoices` + FacturAPI (modo mock sin credenciales), portal del inquilino con PDF.
- **Mora**: `src/lib/mora-engine.ts`, 5 niveles de escalamiento.
- **Extras**: `ancillary_charges` (estacionamiento, espectaculares…), `engagements` (cuenta combinada multi-contrato con un pagador), `service_rates` (agua por edificio), `expenses` (gastos de la operadora).
- **Separación titular/pagador/ocupantes (A4/A5/A6)**: ya iniciada (`payer_occupant_id`, `stay_occupants`, `occupants.kind`), aunque el pagador sigue viviendo dentro de `occupants` (no hay entidad "party" independiente).

### 2.2 — Flujo B (Operadora → Propietario): **existe solo como cálculo efímero, apagado.**

- El estado de cuenta del propietario (renta bruta − comisión − gastos − mantenimiento = **payout neto**) se calcula on-the-fly en `src/app/api/owner/[token]/route.ts` — el endpoint **legacy por token, desactivado** (410 salvo `OWNER_LEGACY_TOKEN_ENABLED`, fix #25).
- La **comisión de administración está hardcodeada al 10%** (`route.ts:167`). No hay columna de fee en `property_owners` ni en `ownership_stakes`.
- **Nada se persiste**: no existen tablas de statements, payouts ni liquidaciones. No hay registro de "cuánto se le debe / cuánto se le pagó" al propietario.
- El portal owner v2 con login (`src/app/owner/*`) solo muestra KPIs y rentas; no reconstruye el statement.
- Lo que SÍ existe como dato formal: `ownership_stakes.percentage` (% de **propiedad**, no de comisión), vigencia de mandato de administración (`mgmt_starts_on/ends_on`), `property_owners.bank_info` (jsonb) y `.rfc`.

### 2.3 — Flujo D (Operadora → Proveedor): **solo texto libre.**

- `expenses.provider` es un TEXT sin catálogo: no hay entidad proveedor, ni RFC, ni datos bancarios, ni historial por proveedor, ni distinción entre gasto pagado y cuenta por pagar. El costo de mantenimiento de `incidents` tampoco liga proveedor.

### 2.4 — Flujo A (Operadora → Plataforma): **no existe en absoluto.**

- Sin tablas ni código de suscripciones, planes, fees de plataforma, ni Stripe Connect (`application_fee`, cuentas conectadas). El panel L0 `/admin` es puramente operativo (tenants, conteos, agentes).
- Lo único escrito: PRD §3.4 *"flat fee por organización + por unidad activa"* y ROADMAP-v2 *"~$799 MXN/mes"* — aspiraciones de go-to-market, **en pausa** tras el reencuadre 2026-07-01 (BaW OS = herramienta interna DuVa ReEs; la apuesta comercial se movió a Engrane AI).

### 2.5 — La sección Finanzas de la UI: 10 páginas, una sola perspectiva

Todas las sub-páginas (`/cobros`, `/invoices`, `/gastos`, `/mora`, `/ledger`, `/reportes`, `/pricing`, `/servicios`, `/quotes`, `/ancillary-charges`) están construidas desde la perspectiva del flujo C (operadora cobra al pagador) más gastos propios. No hay vista de liquidaciones a propietarios, ni directorio/CxP de proveedores, ni relación con la plataforma.

### 2.6 — Deuda técnica financiera encontrada en la auditoría

| # | Hallazgo | Dónde | Severidad |
|---|---|---|---|
| D1 | Doble camino de captura: `/payments/new` (legacy, escribe `payments.amount_paid` directo, **sin `org_id`**, sin receipts/ledger) convive con `/cobros` (modelo nuevo) | `src/app/payments/new/page.tsx` | Alta |
| D2 | Ruta huérfana: `/payments` está en `navigation.ts` routes[] pero no tiene `page.tsx`; el "volver" de `/payments/new` da 404 | `src/lib/navigation.ts:127` | Media |
| D3 | `invoices.org_id` es **TEXT con default `'baw'`** (hardcodeado también en `POST /api/invoices`), inconsistente con el resto del multi-tenant (uuid) | `supabase/migrations/20260404_invoices.sql` | Alta |
| D4 | RLS abierta o ausente en tablas de dinero: `invoices` y `payment_ledger` con `USING (true)`; `expenses` sin RLS en su migración | migraciones 20260401/20260403/20260404 | Alta |
| D5 | Conserje escribe `payments` client-side detrás de un **PIN estático `1234`** | `src/app/[orgSlug]/conserje/page.tsx` (TabCobros) | Alta |
| D6 | `ancillary_charges` no se materializa en cobranza (el cron "PR B3" nunca aterrizó): hoy es solo catálogo/proyección | `src/app/api/ancillary-charges/` | Media |
| D7 | `GET /api/gastos` filtra por columna `date` que no existe (el esquema usa `expense_date`) — endpoint desalineado | `src/app/api/gastos/route.ts` | Baja |
| D8 | Comisión de administración 10% hardcodeada y sin fuente en datos | `src/app/api/owner/[token]/route.ts:167` | Alta (bloquea Flujo B) |
| D9 | ADR-009 (Stripe payouts interno) se referencia desde ADR-018 pero no existe en `docs/adr/` | — | Baja |
| D10 | Proveedores sin entidad: `expenses.provider` texto libre, sin catálogo ni CxP | `supabase/migrations/20260401_expenses.sql` | Media (bloquea Flujo D) |

---

## 3 · Decisión propuesta: modelo canónico de finanzas por flujos

### 3.1 — Principio rector: toda relación de dinero sigue el mismo patrón

Cada flujo (A, B, C, D) se modela con las mismas cuatro piezas, en tablas separadas por flujo:

```
ACUERDO (qué se cobra y cómo)  →  CARGO (devengo del periodo)  →  ABONO (dinero que se mueve)  →  ESTADO DE CUENTA (snapshot inmutable del periodo)
```

| Pieza | Flujo C (existe) | Flujo B (propuesto) | Flujo D (propuesto) | Flujo A (propuesto, diferido) |
|---|---|---|---|---|
| Acuerdo | `contracts`, `ancillary_charges`, `service_rates`, `str_seasons`/`units` | `management_agreements` (nuevo) | `service_providers` + términos en `expenses` | `platform_plans` + `org_subscriptions` (nuevo) |
| Cargo | `payments` | `owner_statements` (nuevo) | `expenses` (con `provider_id` y estatus CxP) | `platform_invoices` con line items por stream (nuevo) |
| Abono | `payment_receipts` | `owner_payouts` (nuevo) | `expenses.paid_date`/pagos a proveedor | pago de la suscripción (Stripe Billing) |
| Estado de cuenta | `estado-cuenta` PDF + `payment_ledger` | `owner_statements` (persistido, inmutable al emitir) | corte mensual por proveedor (deriva de expenses) | `platform_invoices` |

Reglas transversales:

1. **Estatus derivado, snapshot persistido.** Los estatus del periodo corriente se derivan (como hace `billing.ts`); pero al **emitir** un estado de cuenta (statement/invoice) se persiste un snapshot inmutable con su desglose en jsonb. Nunca se recalcula un periodo emitido.
2. **Dirección explícita.** Toda tabla nueva de dinero identifica pagador y receptor (hoy `payments` asume implícitamente "la org recibe" — aceptable en C, inaceptable en A/B/D).
3. **MXN implícito se mantiene** (como todo el sistema hoy). Columna `currency` solo cuando haya un caso real.
4. **Guardrail de irreversibles** (ya vigente en AGENTS.md §9): `payment.charge`, `payment.refund`, `cfdi.emit` siempre requieren aprobación humana, también cuando los flujos A, B y D los generen.
5. **Multi-tenant estricto:** toda tabla nueva lleva `org_id uuid NOT NULL` + RLS por `org_members` (las tablas de plataforma del flujo A, RLS por `platform_admins` + cada org ve solo lo suyo).

### 3.2 — Flujo B: liquidaciones a propietarios (la prioridad real)

**Decidido por Fran (2026-07-04): la comisión base es 10% pero personalizable por cliente** — exactamente lo que resuelve `management_agreements` (fee por edificio/propietario con historial de vigencia). Con el reencuadre a herramienta interna de DuVa ReEs, este es el flujo con valor inmediato: rendirle cuentas formalmente a los propietarios de 809 y 2020.

```sql
-- Acuerdo: qué comisión cobra la operadora por administrar
CREATE TABLE management_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  building_id uuid NOT NULL REFERENCES buildings(id),
  owner_id uuid REFERENCES property_owners(id),   -- NULL = aplica a todos los owners del edificio
  fee_type text NOT NULL DEFAULT 'percent_collected'
    CHECK (fee_type IN ('percent_collected','percent_billed','flat_monthly')),
  fee_value numeric(7,2) NOT NULL DEFAULT 10.00,  -- base 10%, personalizable por cliente
  effective_from date NOT NULL,
  effective_to date,                              -- NULL = vigente
  notes text,
  created_at timestamptz DEFAULT now()
);
-- Reemplaza el 10% hardcodeado (D8). Historial de vigencia estilo service_rates.

-- Estado de cuenta mensual del propietario (persistido, inmutable al emitir)
CREATE TABLE owner_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  owner_id uuid NOT NULL REFERENCES property_owners(id),
  building_id uuid NOT NULL REFERENCES buildings(id),
  period text NOT NULL,                           -- 'YYYY-MM'
  gross_collected numeric(12,2) NOT NULL DEFAULT 0,  -- cobrado del mes (payment_receipts)
  admin_fee numeric(12,2) NOT NULL DEFAULT 0,        -- según management_agreements
  expenses numeric(12,2) NOT NULL DEFAULT 0,         -- expenses del edificio (+prorrateo general)
  maintenance numeric(12,2) NOT NULL DEFAULT 0,      -- costo de incidents del mes
  adjustments numeric(12,2) NOT NULL DEFAULT 0,      -- ajustes manuales (con nota en detail)
  net_payout numeric(12,2) NOT NULL DEFAULT 0,       -- lo que recibe el owner (× ownership %)
  ownership_pct numeric(5,2) NOT NULL DEFAULT 100,   -- snapshot del stake al emitir
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','void')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,      -- desglose por unidad/concepto/proveedor (snapshot)
  issued_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, owner_id, building_id, period)
);

-- Pago efectivo al propietario (el "abono" del flujo B, dinero que SALE de la operadora)
CREATE TABLE owner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  statement_id uuid NOT NULL REFERENCES owner_statements(id),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  method text NOT NULL DEFAULT 'transfer',        -- transfer|spei|cash|other
  reference text,                                 -- folio SPEI, etc.
  paid_date date NOT NULL,
  confirmed_by text,
  created_at timestamptz DEFAULT now()
);
```

- El cálculo del statement **reutiliza** la lógica ya probada del endpoint legacy (`api/owner/[token]/route.ts`) — se extrae a `src/lib/owner-statements.ts` (puro, estilo `billing.ts`) y la comisión se lee de `management_agreements`.
- El portal owner v2 (con login) gana la vista "Estado de cuenta" leyendo statements persistidos — se retira definitivamente la ruta legacy por token.
- `owner_payouts` marca el statement como `paid`; transferencias reales quedan fuera de v1 (registro manual, como `payment_receipts`).

### 3.3 — Flujo D: proveedores de servicios (A3)

Darle entidad al actor que hoy es texto libre. v1 mínima (directorio + liga a gastos); CxP formal (órdenes de compra, facturas de proveedor, antigüedad de saldos) es fase posterior si el volumen lo pide.

```sql
CREATE TABLE service_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('maintenance','cleaning','utilities','legal','accounting','security','other')),
  rfc text,
  contact jsonb DEFAULT '{}'::jsonb,              -- tel, email, persona de contacto
  bank_info jsonb DEFAULT '{}'::jsonb,            -- mismo patrón que property_owners
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE expenses ADD COLUMN provider_id uuid REFERENCES service_providers(id);
-- expenses.provider (texto) queda como display legacy; captura nueva usa provider_id.
-- incidents con costo de mantenimiento ligan provider_id también (misma columna en incidents).
```

- Beneficios inmediatos: gasto por proveedor en reportes, desglose por proveedor en el `detail` de `owner_statements`, y datos fiscales/bancarios para cuando haya pagos automatizados.
- En la UI vive dentro de `Finanzas → Gastos` (selector de proveedor + directorio), sin página nueva en v1.

### 3.4 — Flujo A: monetización de la plataforma — **múltiples revenue streams**

**Decidido por Fran (2026-07-04): el modelo no será un solo fee sino múltiples streams.** Consecuencia de diseño: en vez de un `plan` monolítico, el flujo A se modela como un **catálogo de streams** activables por org, facturados en un solo invoice mensual con line items. Streams candidatos (activables independientemente cuando se retome la productización):

| Stream | Base de cobro | De dónde sale el dato |
|---|---|---|
| S1 Suscripción SaaS | flat mensual por org + por unidad activa (PRD §3.4) | `org_usage_snapshots.active_units` |
| S2 Por usuario | usuarios activos de la org | `org_usage_snapshots.active_users` |
| S3 Fee por venta / booking directo | % o bps del GMV cobrado vía canal público | `org_usage_snapshots.gmv_collected_mxn` |
| S4 Procesamiento de pagos | margen sobre cobros con tarjeta (requiere Stripe Connect, §3.6) | Stripe application fees |
| S5 Agentes IA / módulos premium | por agente activo o por volumen de runs | `agent_runs` |
| S6 Facturación CFDI | por CFDI emitido (markup sobre FacturAPI) | `invoices` |
| S7 Marketplace de proveedores | comisión por despacho/referencia a A3 | futuro, si existe marketplace |

```sql
-- Solo cuando se retome la productización (hoy en pausa):
platform_streams     (id, key S1..S7, name, pricing_model flat|per_unit|per_user|bps|per_event, rate, active)
org_subscriptions    (org_id, stream_id, status, activated_at, custom_rate,        -- override por cliente
                      trial_ends_at, stripe_subscription_item_id)
org_usage_snapshots  (org_id, period 'YYYY-MM', active_units, active_users,
                      gmv_collected_mxn, agent_runs, cfdi_count)
platform_invoices    (org_id, period, subtotal, tax, total,
                      status draft|issued|paid|void, line_items jsonb)             -- un line item por stream
```

- **Cobro vía Stripe Billing** (suscripciones con subscription items por stream), no reinventar. RLS: `platform_admins` (L0) + cada org ve solo lo suyo.
- `org_usage_snapshots` es la pieza que conviene sembrar temprano (un cron mensual barato): mide TODAS las bases de cobro candidatas con datos que ya existen, y le da a Fran números reales para decidir qué streams activar y a qué precio.
- Superficies futuras: `/admin/billing` (L0: MRR, streams por org) y `Settings → Plan y facturación` (L1: sus streams, sus facturas de plataforma).
- **Prohibido mezclarlo con el flujo C:** el dinero de rentas jamás toca las tablas de plataforma. El fee por venta (S3) se calcula sobre el snapshot y se factura vía `platform_invoices` — no se intercepta el cobro (eso sería Stripe Connect, S4/§3.6).

### 3.5 — Reorganización de la sección Finanzas en la UI

El sub-nav actual es una lista plana de 10 items del flujo C. Propuesta de organización conceptual (los grupos son etiquetas visuales dentro del mismo sub-nav; **cualquier cambio real a `navigation.ts` requiere acuerdo previo**, AGENTS.md §2.3):

| Grupo | Items | Flujo |
|---|---|---|
| **Ingresos** | Cobros · Morosidad · Cargos adicionales · Facturas (CFDI) | C |
| **Egresos** | Gastos (con directorio de proveedores) · **Propietarios (liquidaciones)** ← nuevo | D + B |
| **Configuración** | Precios · Servicios · Cotizador | C |
| **Registro** | Bitácora · Reportes | C (+B/D cuando existan statements y proveedores) |

- La única página nueva es **Propietarios (liquidaciones)** (`/liquidaciones`): generar/emitir statements del mes, registrar payouts, ver histórico. Del lado del propietario, la vista espejo vive en su portal v2.
- `/payments` y `/payments/new` (legacy) se retiran del `routes[]` y se redirigen a `/cobros` (D1/D2).
- El flujo A, cuando exista, NO vive en esta sección: es `/admin/billing` (L0) y Settings (L1). La sección Finanzas de la operadora es solo el dinero **del negocio de la operadora**.

### 3.6 — Stripe Connect: solo cuando haya dinero de terceros de verdad

Vigente lo dicho en ADR-018 §8: cuenta Stripe única mientras el operador sea uno (DuVa ReEs). Stripe Connect (cuentas conectadas + `application_fee`) se adopta únicamente si (a) se activa el stream S4 con cobro por tarjeta en cuentas del PM, o (b) hay propietarios externos que deban recibir su parte directamente. No antes: es complejidad regulatoria y operativa que hoy no paga renta.

---

## 4 · Capas de interacción, permisos y límites por actor

Los actores ya tienen registro en el sistema (varios desde hace meses); lo que faltaba es la **gobernanza**: qué interfaz usa cada uno, con qué cuenta entra, qué puede hacer con los cobros, qué datos financieros ve, y bajo qué límites. Esta sección lo define.

### 4.1 — Matriz resumen

| Actor | Interfaz | Cuenta / auth | Gestión de cobros | Datos financieros que VE | Límites y condiciones |
|---|---|---|---|---|---|
| **A0 Plataforma** | `/admin` (L0); futuro `/admin/billing` | `platform_admins` (hoy solo `fran@zxy.vc`) | Solo flujo A (facturar a operadoras). **Jamás opera cobros del flujo C** | Agregados por org (conteos, MRR futuro, usage snapshots). Detalle de rentas de una org solo en modo soporte, auditado | Toda acción L0 queda en `audit_log`; sin acceso de escritura a dinero de tenants |
| **A1 Operadora** | App principal, sección Finanzas | `org_members` (roles `pm_*`), login Supabase | Dueña del flujo C completo + emite B y paga D (ver 4.2 por rol) | Todo lo de SU org (RLS por `org_id`) | Irreversibles (`payment.charge`, `payment.refund`, `cfdi.emit`) siempre con aprobación de admin; nunca ve otras orgs |
| **A2 Propietario** | Portal owner v2 (`/owner`) | Login Supabase vía `owner_invites` → `property_owners.user_id` | **Ninguna.** Solo lectura + acuse de statements | Sus edificios (por `ownership_stakes`): statements emitidos, payouts, gastos y mantenimiento que le descuentan, ocupación y rentas brutas | No ve datos personales de inquilinos (solo unidad/concepto/monto); no ve otras propiedades ni la operación interna; puede comentar/disputar un statement, no editarlo |
| **A3 Proveedor** | **Sin acceso en v1** (es registro, no usuario). Futuro: portal mínimo (sus órdenes/pagos) | N/A en v1 | Ninguna | Ninguno en v1. Futuro: solo SUS trabajos y pagos | Nunca ve rentas, inquilinos ni otros proveedores; la operadora guarda su RFC/banco |
| **A4 Titular** | Portal inquilino (`/tenant/[token]`) | Token de portal (`portal_token` + `portal_enabled`) | Paga con tarjeta (Stripe) y solicita factura | SU contrato: cargos, saldo, historial, CFDIs propios | Solo sus contratos; no edita montos ni fechas; token revocable por la operadora |
| **A5 Pagador** | Si = titular: mismo portal. Si empresa: estado de cuenta consolidado del `engagement` (hoy PDF/correo; portal B2B futuro) | Hoy sin cuenta propia (contacto en `occupants` kind empresa) | Paga (transferencia registrada por la operadora, o tarjeta futuro) | El consolidado de SU pool: cargos y saldos de las unidades que paga, facturación consolidada o por unidad | Ve unidad/monto/estatus, no la vida interna de los ocupantes; sin acceso a otras cuentas |
| **A6 Ocupantes** | Portal operativo (incidencias) / conserje / WhatsApp | Token de portal compartido de la estancia | **Ninguna** | **Ninguno** (salvo que también sean titular o pagador) | Solo operación: incidencias, avisos; cero montos |

Dos actores transversales del lado de la operadora:

| Actor interno | Interfaz | Auth | Cobros | Límites |
|---|---|---|---|---|
| **Conserje** | `/[orgSlug]/conserje` tab Cobros | ⚠️ Hoy PIN estático `1234` (D5) | Marca pagos en efectivo del mes como recibidos | **Condición para implementar:** migrar a endpoint server-side con auth real (org_member restringido o token de dispositivo); monto tope por operación; todo asiento con `confirmed_by` |
| **Agentes (Alicia)** | API v1 con bearer | `agent_credentials` + scopes | `payment.record` (registrar pago recibido, reversible). NUNCA `payment.charge`/`refund` | Modelo de autonomía por origen del disparo (AGENTS.md §9): humano→AUTO, autónomo→aprobación; irreversibles siempre con aprobación de Fran |

### 4.2 — Permisos financieros por rol dentro de la Operadora (A1)

La gestión de cobros vive en la operadora, así que el detalle fino es por rol de `org_members`:

| Capacidad | `pm_owner` | `pm_admin` | `pm_operator` | `pm_viewer` |
|---|---|---|---|---|
| Ver cobros, reportes, bitácora | ✔ | ✔ | ✔ | ✔ |
| Registrar abonos / pago rápido / marcar histórico | ✔ | ✔ | ✔ | — |
| Editar cargos (montos, vencimientos, condonar) | ✔ | ✔ | — | — |
| Configurar precios, temporadas, servicios, cargos adicionales | ✔ | ✔ | — | — |
| Configurar comisiones (`management_agreements`) | ✔ | ✔ | — | — |
| Emitir/anular estados de cuenta de propietarios y registrar payouts | ✔ | ✔ | — | — |
| Emitir/cancelar CFDI | ✔ | ✔ | — | — |
| Refunds / cargos a tarjeta (irreversibles) | ✔ con confirmación | ✔ con confirmación | — | — |
| Gestionar proveedores y gastos | ✔ | ✔ | ✔ (captura) | — |
| Ver/configurar el plan con la plataforma (flujo A, futuro) | ✔ | ✔ | — | — |

Estado actual vs. esta matriz: hoy la app **no distingue roles dentro de Finanzas** (cualquier miembro con acceso a la sección puede casi todo; la autorización real depende de RLS genérica por org). Implementar esta matriz = definir un mapa de capacidades por rol en un módulo tipo `src/lib/finance-permissions.ts` (espejo de cómo `navigation.ts` ya esconde secciones por rol) + reforzar los endpoints de escritura con el mismo mapa. Es parte de la Fase 1.

### 4.3 — Reglas de visibilidad de datos (quién ve el dinero de quién)

1. **Aislamiento vertical:** cada actor ve solo su rebanada. La operadora ve todo lo suyo; el propietario ve sus edificios agregados; el titular/pagador ve sus contratos; el ocupante no ve montos; la plataforma ve agregados.
2. **El propietario ve conceptos, no personas:** en statements el detalle es por unidad/concepto/proveedor, sin datos personales del inquilino más allá de lo contractualmente necesario.
3. **El pagador-empresa ve consolidado, no vida privada:** unidades, cargos y saldos de su pool; no incidencias ni datos de ocupantes.
4. **Los proveedores no existen como lectores** en v1 — solo son referenciados.
5. **Snapshot inmutable como frontera:** lo que un actor externo (propietario, pagador) recibe es siempre un statement **emitido** (snapshot), nunca una query viva a las tablas operativas. Esto simplifica permisos: los portales externos leen tablas de statements, no `payments`.
6. **Toda escritura financiera lleva autor:** `confirmed_by` / `created_by_agent_id` / rol del org_member — sin asientos anónimos.

---

## 5 · Fases de implementación propuestas

**Fase 0 — Higiene (sin features nuevas, PR chico):**
D1/D2 (retirar `/payments/new` legacy y la ruta huérfana), D3 (migrar `invoices.org_id` a uuid real + quitar `'baw'` hardcodeado), D4 (RLS por org en `invoices`, `payment_ledger`, `expenses`), D7 (fix columna `date`→`expense_date` en `GET /api/gastos`). D5 (conserje) merece PR propio: mover el marcado de pago a un endpoint server-side con auth real.

**Fase 1 — Flujo B v1 + proveedores v1 + permisos por rol (el valor inmediato para DuVa ReEs):**
Migración `management_agreements` (fee base 10% configurable) + `owner_statements` + `owner_payouts` + `service_providers` (D10); extraer `src/lib/owner-statements.ts` del endpoint legacy; página `Finanzas → Propietarios`; selector de proveedor en Gastos; vista "Estado de cuenta" en portal owner v2; retirar la ruta legacy por token; **mapa de capacidades financieras por rol** (`src/lib/finance-permissions.ts` + enforcement en endpoints de escritura, matriz §4.2). D6 (materializar `ancillary_charges` en cobranza) entra aquí o en paralelo, porque afecta el `gross_collected` de los statements.

**Fase 2 — Medición para los revenue streams (barato, adelanta el flujo A sin construirlo):**
Cron mensual que llena `org_usage_snapshots` con TODAS las bases candidatas (unidades, usuarios, GMV, agent runs, CFDIs). Da a Fran los números reales para decidir qué streams activar y a qué precio.

**Fase 3 — Flujo A (solo si/cuando se retome la productización):**
`platform_streams` + `org_subscriptions` + Stripe Billing + `/admin/billing` + Settings L1. Se activan streams uno por uno según decisión de negocio.

**Fase 4 — Stripe Connect (condicional, ver 3.6) + CxP formal de proveedores (si el volumen lo pide).**

---

## 6 · Decisiones

### 6.1 — Decididas por Fran (2026-07-04)

1. **Comisión de administración: 10% base, personalizable por cliente** → `management_agreements.fee_value` con default 10.00, por edificio/propietario.
2. **Plataforma con múltiples revenue streams** (no un solo fee) → modelo de catálogo de streams + invoice con line items (§3.4).
3. **Taxonomía de 7 actores** (§1): Plataforma › Operadora › Propietario › Proveedor › Titular › Pagador › Ocupantes. Nombres finales ajustables; los actores son canónicos.
4. **Lo que define el arranque de implementación son las capas de interacción y permisos por actor** (gestión de cobros, datos financieros, cuentas/usuarios, interfaces, límites y condiciones) → definidas en §4.

### 6.2 — Abiertas

1. **Nombres definitivos de los actores en la UI** — propuesta en §1 (Operadora, Titular, Pagador…); validar es-MX con Fran.
2. **¿Base de la comisión: % de lo cobrado o de lo facturado?** Propuesta default: `percent_collected`.
3. **Granularidad de statements**: propuesta una fila por (propietario × edificio × mes), agregables en el portal.
4. **Nombre/ruta de la página de liquidaciones**: recomendación `/liquidaciones` (es-MX, consistente con `/cobros`, `/gastos`).
5. **Qué streams activar primero y a qué precio** — decidir con 2-3 meses de datos de `org_usage_snapshots` (Fase 2).
6. **CxP formal de proveedores** (órdenes de compra, antigüedad de saldos): diferido; v1 es directorio + liga a gastos.

## 7 · Consecuencias

- (+) Los 7 actores quedan nombrados y los 4 flujos de dinero (A/B/C/D) con un patrón único (acuerdo→cargo→abono→statement), cada uno en sus tablas, sin mezclar el dinero de rentas con el de la plataforma.
- (+) El flujo B pasa de "cálculo efímero apagado con 10% hardcodeado" a datos persistidos, con comisión configurable por cliente, auditable y visible en el portal del propietario — utilizable ya por DuVa ReEs.
- (+) Los proveedores (A3) dejan de ser texto libre y su costo se desglosa en los statements del propietario.
- (+) El flujo A queda diseñado para múltiples streams y medido (`org_usage_snapshots`) sin gastar en construirlo antes de decidir precios.
- (+) La separación titular/pagador/ocupantes que el código ya inició (party/payer) queda elevada a taxonomía canónica en vez de convención implícita.
- (−) Cuatro tablas nuevas + una página nueva en Fase 1; requiere acuerdo de navegación para el sub-nav.
- (−) La Fase 0 toca RLS y una migración de tipo de columna (`invoices.org_id`) — riesgo de drift con prod (ver audit de drift pendiente en PROJECT_STATE); aplicar con cuidado.
