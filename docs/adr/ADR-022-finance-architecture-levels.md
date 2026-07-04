# ADR-022: Arquitectura financiera por niveles (Plataforma → PM → Propietario → Inquilino)

**Status:** Proposed — pendiente decisión de Fran
**Date:** 2026-07-04
**Deciders:** Fran (pendiente), Claude (propuesta + auditoría)
**Related:** ADR-018 (Stripe checkout público), `docs/PRD.md` §3.4 (pricing SaaS), `docs/PROJECT_STATE.md` (reencuadre 2026-07-01: BaW OS = herramienta interna DuVa ReEs), `docs/specs/people-crm-stays-model.md` (facturación B2B consolidada)

---

## 1 · Contexto

BaW OS tiene cuatro actores con relaciones de dinero distintas, pero hoy la sección **Finanzas** solo modela una de ellas. Los niveles, tal como los define Fran:

| Nivel | Actor | Quién es | En el sistema hoy |
|---|---|---|---|
| **N0** | Plataforma BaW OS (ZXY) | Nosotros. Máximo nivel | `platform_admins` (solo acceso L0, cero componente monetario) |
| **N1** | Property Manager / Administradora | **Nuestro cliente.** A él le cobraremos (por trabajo, por usuario, o fee por venta — modelo de negocio sin definir) | `organizations` + `org_members` (roles `pm_*`) |
| **N2** | Propietario del inmueble | Cliente del PM. Recibe las rentas netas de comisión | `property_owners` + `ownership_stakes` |
| **N3** | Inquilino / Huésped | Paga renta (LTR/MTR) o estancia (STR) | `occupants`, `contracts`, `reservations` |

Cada frontera entre niveles adyacentes es una **relación de dinero** con dirección propia:

```
N0 Plataforma ◄─── (A) suscripción SaaS / fee ──── N1 PM
N1 PM ────────── (B) liquidación neta (payout) ──► N2 Propietario
N1 PM ◄───────── (C) renta + servicios + mora ──── N3 Inquilino/Huésped
```

Este ADR define cómo debería organizarse todo el dominio financiero para soportar los tres flujos, qué existe ya, y en qué orden construir lo que falta.

---

## 2 · Diagnóstico del estado actual (auditoría 2026-07-04)

### 2.1 — Flujo C (Inquilino → PM): **completo y maduro. Es el núcleo.**

- **Cargo mensual** = fila en `payments` (renta + `water_fee` + `late_fee_amount`), proyectado por contrato/mes con `src/lib/billing.ts` (fuente única de estatus: `pagado|parcial|pendiente|vencido|mora|verbal`).
- **Abonos** = `payment_receipts` (pagador ≠ ocupante vía `payer_occupant_id`), con recompute server-side (`POST /api/payments/[id]/recompute`).
- **Bitácora inmutable** = `payment_ledger` (append-only).
- **Cobro con tarjeta**: Stripe PaymentIntents para inquilinos (`/api/payments/checkout` + webhook) y Stripe Checkout hosted para huéspedes del booking público (ADR-018). Cuenta Stripe única, sin Connect.
- **CFDI**: tabla `invoices` + FacturAPI (modo mock sin credenciales), portal del inquilino con PDF.
- **Mora**: `src/lib/mora-engine.ts`, 5 niveles de escalamiento.
- **Extras**: `ancillary_charges` (estacionamiento, espectaculares…), `engagements` (cuenta combinada multi-contrato), `service_rates` (agua por edificio), `expenses` (gastos del PM).

### 2.2 — Flujo B (PM → Propietario): **existe solo como cálculo efímero, apagado.**

- El estado de cuenta del propietario (renta bruta − comisión − gastos − mantenimiento = **payout neto**) se calcula on-the-fly en `src/app/api/owner/[token]/route.ts` — el endpoint **legacy por token, desactivado** (410 salvo `OWNER_LEGACY_TOKEN_ENABLED`, fix #25).
- La **comisión de administración está hardcodeada al 10%** (`route.ts:167`). No hay columna de fee en `property_owners` ni en `ownership_stakes`.
- **Nada se persiste**: no existen tablas de statements, payouts ni liquidaciones. No hay registro de "cuánto se le debe / cuánto se le pagó" al propietario.
- El portal owner v2 con login (`src/app/owner/*`) solo muestra KPIs y rentas; no reconstruye el statement.
- Lo que SÍ existe como dato formal: `ownership_stakes.percentage` (% de **propiedad**, no de comisión), vigencia de mandato de administración (`mgmt_starts_on/ends_on`), `property_owners.bank_info` (jsonb) y `.rfc`.

### 2.3 — Flujo A (Plataforma → PM): **no existe en absoluto.**

- Sin tablas ni código de suscripciones, planes, fees de plataforma, ni Stripe Connect (`application_fee`, cuentas conectadas). El panel L0 `/admin` es puramente operativo (tenants, conteos, agentes).
- Lo único escrito: PRD §3.4 *"flat fee por organización + por unidad activa"* y ROADMAP-v2 *"~$799 MXN/mes"* — aspiraciones de go-to-market, **en pausa** tras el reencuadre 2026-07-01 (BaW OS = herramienta interna DuVa ReEs; la apuesta comercial se movió a Engrane AI).

### 2.4 — La sección Finanzas de la UI: 10 páginas, una sola perspectiva

Todas las sub-páginas (`/cobros`, `/invoices`, `/gastos`, `/mora`, `/ledger`, `/reportes`, `/pricing`, `/servicios`, `/quotes`, `/ancillary-charges`) están construidas desde la perspectiva del flujo C (PM cobra al inquilino) más gastos propios del PM. No hay ninguna vista de liquidaciones a propietarios ni de la relación con la plataforma.

### 2.5 — Deuda técnica financiera encontrada en la auditoría

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

---

## 3 · Decisión propuesta: modelo canónico de finanzas por niveles

### 3.1 — Principio rector: toda relación de dinero sigue el mismo patrón

Cada flujo (A, B, C) se modela con las mismas cuatro piezas, en tablas separadas por flujo:

```
ACUERDO (qué se cobra y cómo)  →  CARGO (devengo del periodo)  →  ABONO (dinero que se mueve)  →  ESTADO DE CUENTA (snapshot inmutable del periodo)
```

| Pieza | Flujo C (existe) | Flujo B (propuesto) | Flujo A (propuesto, diferido) |
|---|---|---|---|
| Acuerdo | `contracts`, `ancillary_charges`, `service_rates`, `str_seasons`/`units` | `management_agreements` (nuevo) | `platform_plans` + `org_subscriptions` (nuevo) |
| Cargo | `payments` | `owner_statements` (nuevo; el statement ES el cargo-espejo) | `platform_invoices` (nuevo) |
| Abono | `payment_receipts` | `owner_payouts` (nuevo) | pago de la suscripción (Stripe Billing) |
| Estado de cuenta | `estado-cuenta` PDF + `payment_ledger` | `owner_statements` (persistido, inmutable al emitir) | `platform_invoices` |

Reglas transversales:

1. **Estatus derivado, snapshot persistido.** Los estatus del periodo corriente se derivan (como hace `billing.ts`); pero al **emitir** un estado de cuenta (statement/invoice) se persiste un snapshot inmutable con su desglose en jsonb. Nunca se recalcula un periodo emitido.
2. **Dirección explícita.** Toda tabla nueva de dinero lleva pagador y receptor identificables (hoy `payments` asume implícitamente "la org recibe" — aceptable en C, inaceptable en B y A).
3. **MXN implícito se mantiene** (como todo el sistema hoy). Columna `currency` solo cuando haya un caso real.
4. **Guardrail de irreversibles** (ya vigente en AGENTS.md §9): `payment.charge`, `payment.refund`, `cfdi.emit` siempre requieren aprobación humana, también cuando los flujos B y A los generen.
5. **Multi-tenant estricto:** toda tabla nueva lleva `org_id uuid NOT NULL` + RLS por `org_members` (y las excepciones de plataforma del flujo A, RLS por `platform_admins`).

### 3.2 — Flujo B: liquidaciones a propietarios (la prioridad real)

Con el reencuadre a herramienta interna de DuVa ReEs, este es el flujo con valor inmediato: rendirle cuentas formalmente a los propietarios de 809 y 2020. Modelo propuesto:

```sql
-- Acuerdo: qué comisión cobra el PM por administrar
CREATE TABLE management_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  building_id uuid NOT NULL REFERENCES buildings(id),
  owner_id uuid REFERENCES property_owners(id),   -- NULL = aplica a todos los owners del edificio
  fee_type text NOT NULL DEFAULT 'percent_collected'
    CHECK (fee_type IN ('percent_collected','percent_billed','flat_monthly')),
  fee_value numeric(7,2) NOT NULL,                -- 10.00 (%) o monto flat MXN
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
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,      -- desglose por unidad/concepto (snapshot)
  issued_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, owner_id, building_id, period)
);

-- Pago efectivo al propietario (el "abono" del flujo B, dinero que SALE del PM)
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

- El cálculo del statement **reutiliza** la lógica ya probada del endpoint legacy (`api/owner/[token]/route.ts`) — se extrae a `src/lib/owner-statements.ts` (puro, estilo `billing.ts`) y se corrige la comisión para leer de `management_agreements`.
- El portal owner v2 (con login) gana la vista "Estado de cuenta" leyendo statements persistidos — se retira definitivamente la ruta legacy por token.
- `owner_payouts` marca el statement como `paid`; `payment.charge`/transferencias reales quedan fuera de v1 (registro manual, como `payment_receipts`).

### 3.3 — Flujo A: monetización de la plataforma (diseñado hoy, construido cuando haya modelo de negocio)

El modelo de negocio no está definido (flat fee / por usuario / por unidad / % por venta). **Decisión propuesta: no construir nada todavía**, pero dejar el diseño listo para que nada de lo que se construya en B y C lo estorbe:

```sql
-- Solo cuando se retome la productización (hoy en pausa):
platform_plans      (id, name, flat_fee_mxn, per_unit_fee_mxn, per_user_fee_mxn, txn_fee_bps, active)
org_subscriptions   (org_id, plan_id, status, trial_ends_at, current_period_start/end,
                     stripe_customer_id, stripe_subscription_id)
org_usage_snapshots (org_id, period 'YYYY-MM', active_units, active_users, gmv_collected_mxn)
platform_invoices   (org_id, period, subtotal, tax, total, status draft|issued|paid|void, detail jsonb)
```

- **Cobro vía Stripe Billing** (suscripciones), no reinventar. RLS de estas tablas: `platform_admins` (L0) + cada org ve solo lo suyo.
- `org_usage_snapshots` es la pieza que conviene sembrar temprano (un cron mensual barato) porque da los datos para decidir el pricing: unidades activas, usuarios y GMV cobrado por org ya existen en el sistema.
- Superficies futuras: `/admin/billing` (L0: MRR, suscripciones por org) y `Settings → Plan y facturación` (L1: su plan, sus facturas de plataforma).
- **Prohibido mezclarlo con el flujo C:** el dinero de rentas de los inquilinos jamás toca las tablas de plataforma. Si algún día el modelo es "fee por venta", el fee se calcula sobre `org_usage_snapshots.gmv_collected_mxn` y se factura vía `platform_invoices` — no se intercepta el cobro (eso sería Stripe Connect, ver 3.4).

### 3.4 — Stripe Connect: solo cuando haya dinero de terceros de verdad

Vigente lo dicho en ADR-018 §8: cuenta Stripe única mientras el operador sea uno (DuVa ReEs). Stripe Connect (cuentas conectadas + `application_fee`) se adopta únicamente si (a) se retoma el SaaS multi-tenant con cobro por tarjeta en cuentas del PM, o (b) hay propietarios externos que deban recibir su parte directamente. No antes: es complejidad regulatoria y operativa que hoy no paga renta.

### 3.5 — Reorganización de la sección Finanzas en la UI

El sub-nav actual es una lista plana de 10 items del flujo C. Propuesta de organización conceptual (los grupos son etiquetas visuales dentro del mismo sub-nav; **cualquier cambio real a `navigation.ts` requiere acuerdo previo**, AGENTS.md §2.3):

| Grupo | Items | Flujo |
|---|---|---|
| **Ingresos** | Cobros · Morosidad · Cargos adicionales · Facturas (CFDI) | C |
| **Egresos** | Gastos · **Propietarios (liquidaciones)** ← nuevo | C (gastos) + B |
| **Configuración** | Precios · Servicios · Cotizador | C |
| **Registro** | Bitácora · Reportes | C (+B cuando existan statements) |

- La única página nueva es **Propietarios (liquidaciones)** (`/liquidaciones` o `/owner-statements`): generar/emitir statements del mes, registrar payouts, ver histórico. Del lado del propietario, la vista espejo vive en su portal v2.
- `/payments` y `/payments/new` (legacy) se retiran del `routes[]` y se redirigen a `/cobros` (D1/D2).
- El flujo A, cuando exista, NO vive en esta sección: es `/admin/billing` (L0) y Settings (L1). La sección Finanzas del PM es solo el dinero **del negocio del PM**.

---

## 4 · Fases de implementación propuestas

**Fase 0 — Higiene (sin features nuevas, PR chico):**
D1/D2 (retirar `/payments/new` legacy y la ruta huérfana), D3 (migrar `invoices.org_id` a uuid real + quitar `'baw'` hardcodeado), D4 (RLS por org en `invoices`, `payment_ledger`, `expenses`), D7 (fix columna `date`→`expense_date` en `GET /api/gastos`). D5 (conserje) merece PR propio: mover el marcado de pago a un endpoint server-side con auth real.

**Fase 1 — Flujo B v1 (el valor inmediato para DuVa ReEs):**
Migración `management_agreements` + `owner_statements` + `owner_payouts`; extraer `src/lib/owner-statements.ts` del endpoint legacy; página `Finanzas → Propietarios`; vista "Estado de cuenta" en portal owner v2; retirar la ruta legacy por token. D6 (materializar `ancillary_charges` en cobranza) entra aquí o en paralelo, porque afecta el `gross_collected` de los statements.

**Fase 2 — Medición para el modelo de negocio (barato, adelanta el flujo A sin construirlo):**
Cron mensual que llena `org_usage_snapshots`. Da a Fran los números reales (unidades, usuarios, GMV) para decidir entre flat fee / por unidad / % por venta.

**Fase 3 — Flujo A (solo si/cuando se retome la productización):**
`platform_plans` + `org_subscriptions` + Stripe Billing + `/admin/billing` + Settings L1. Requiere decisión de modelo de negocio (ver §5).

**Fase 4 — Stripe Connect (condicional, ver 3.4).**

---

## 5 · Decisiones abiertas para Fran

1. **Modelo de negocio del flujo A** (no bloquea Fases 0-2): ¿flat fee por org + por unidad activa (PRD §3.4), por usuario, o % del GMV cobrado? Recomendación: decidir DESPUÉS de 2-3 meses de `org_usage_snapshots` con datos reales.
2. **Comisión de administración** (bloquea Fase 1): ¿el 10% actual es el real para 809/2020? ¿Es % de lo **cobrado** o de lo **facturado**? La propuesta default: `percent_collected` al 10%, configurable por edificio.
3. **Nombre y ruta de la página de liquidaciones**: `/liquidaciones` (es-MX, consistente con `/cobros`, `/gastos`) es la recomendación.
4. **¿Los statements se emiten por edificio o por propietario?** Propuesta: una fila por (owner × building × mes) — un propietario con stakes en 2 edificios recibe 2 statements, agregables en el portal.

## 6 · Consecuencias

- (+) Los tres flujos de dinero quedan con un patrón único (acuerdo→cargo→abono→statement), cada uno en sus tablas, sin mezclar el dinero de rentas con el de la plataforma.
- (+) El flujo B pasa de "cálculo efímero apagado con 10% hardcodeado" a datos persistidos, auditable y visible en el portal del propietario — utilizable ya por DuVa ReEs.
- (+) El flujo A queda diseñado y medido (`org_usage_snapshots`) sin gastar en construirlo antes de tener modelo de negocio.
- (−) Tres tablas nuevas + una página nueva en Fase 1; requiere acuerdo de navegación para el sub-nav.
- (−) La Fase 0 toca RLS y una migración de tipo de columna (`invoices.org_id`) — riesgo de drift con prod (ver audit de drift pendiente en PROJECT_STATE); aplicar con cuidado.
