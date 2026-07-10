# PROJECT_STATE.md — Estado vivo de BaW OS

> **Este archivo cambia seguido.** Cualquier agente que vaya a tocar el repo debe leerlo después de `AGENTS.md` y antes de empezar.
> **Última actualización:** 2026-07-09 (Cuenta del inquilino `/cobros/[contractId]`; mismo día: WhatsApp a plantillas HSM).

---

## 0.0 · ADR-022 finanzas — CERRADO en prod (2026-07-08)

Los 4 PRs del stack ADR-022 (#149 Fase 0, #150 conserje, #151 Fase 1 liquidaciones, #152 Fase 2 snapshots) están **mergeados a main y aplicados a Supabase prod** (`zlcgxmllaeweypyodvzk`), en orden, sin ventana de "código sin tabla". Migraciones aplicadas en prod: `20260704_02`, `20260704_03`, `20260704_04`.

**⚠️ Drift rescatado — `20260404_invoices.sql` aplicado A MANO a prod (2026-07-08):** la tabla `invoices` nunca se había aplicado a prod (mismo patrón de drift de §0/Public-Listing). El Script 1 de Fase 0 (`20260704_02`) hace `ALTER TABLE invoices` y fallaba con 42P01. Fix operativo: se corrió primero el `CREATE TABLE` de `20260404_invoices.sql` (que la crea con `org_id TEXT DEFAULT 'baw'`) y enseguida `20260704_02` la convirtió a `uuid` con FK. Verificado en prod: `invoices.org_id` es uuid, `payment_ledger` con 0 filas huérfanas, RLS org-scoped activa en invoices/payment_ledger/expenses, y las 4 tablas de Fase 1 (`management_agreements`, `owner_statements`, `owner_payouts`, `service_providers`) + `org_usage_snapshots` creadas.

**Nota para entornos nuevos / audit de drift:** `20260404_invoices.sql` usa `CREATE TABLE invoices` (sin `IF NOT EXISTS`). En un entorno donde ya exista la tabla, re-correrlo falla — es esperado. El orden canónico de migraciones (20260404 antes de 20260704_02) lo maneja bien en un entorno limpio; prod requirió el rescate manual por el drift histórico. Pendiente sigue el audit completo de drift prod vs `supabase/migrations/` (ver §0 Public Listing).

Pendiente de Fran (config, no código): PIN real del conserje (`CONSERJE_PIN` en Vercel o `organizations.settings.conserje_pin`).

---

## 0.-2 · Cuenta del inquilino (2026-07-09, rama `feat/cuenta-inquilino`, pedida por Fran en chat)

**Nueva página `/cobros/[contractId]`** — gestión financiera operativa por inquilino/contrato en una sola pantalla: calendario completo de cargos proyectado con `@/lib/billing` (misma fuente única que /cobros/dashboard/morosidad), vencimientos por mes y "próximo vencimiento", saldo pendiente hoy (Σ `owed`), mora activa, abonos totales/parciales con fecha/método/referencia/pagador≠inquilino, historial de abonos expandible por mes (con quién pagó y quién confirmó), pago rápido, factura CFDI, **comprobante WhatsApp por mes pagado** (`POST /api/payments/[id]/receipt`) y **PDF de estado de cuenta por periodo** (selector + por fila).

- **Refactor anti-duplicación (AGENTS.md §1.3):** el modal "Registrar pago" de /cobros se extrajo LITERAL a `src/components/cobros/AbonoModal.tsx` y el pago rápido + recompute a `src/lib/cobros-actions.ts` (`quickPayMonth`, `recomputeCharge`); /cobros pasó de 1163 → 724 líneas usando ambos. El pipeline de escritura no cambia: cargo `payments` + abonos `payment_receipts` + asiento `payment_ledger` + recompute server-side.
- **Navegación:** en /cobros el link "Estado" (que abría el PDF) ahora es "Cuenta" → `/cobros/[contractId]` (el PDF vive dentro de la cuenta, global y por mes); el nombre del inquilino también linkea. Sin cambios a `SIDEBAR_SECTIONS` (la ruta cae bajo el prefijo `/cobros`).
- **Consistencia:** `/contracts/[id]` perdió su "Marcar como pagado" (update directo a `payments` sin abonos/bitácora/recompute — el modelo viejo que ADR-022 D1 retiró de /payments/new); ahora linkea a la cuenta del inquilino.
- Sin migraciones.

---

## 0.-1 · WhatsApp de cobranza a plantillas HSM (2026-07-09, rama `feat/whatsapp-cobranza-templates`)

**Contexto:** Meta solo permite texto libre dentro de la ventana de 24h posterior a un mensaje del cliente; TODO mensaje business-initiated (cobranza, comprobante, renovación) debe salir como **plantilla HSM pre-aprobada** o Meta lo rechaza (error 131047). El código enviaba texto libre en los 3 flujos.

- **`src/lib/whatsapp.ts`**: nuevo `sendWhatsAppTemplate(to, {name, params})` (payload `type:'template'`, idioma `WHATSAPP_TEMPLATE_LANG` default `es_MX`, sanitiza params — Meta rechaza saltos de línea/4+ espacios) + 4 builders de plantilla: `buildReminderTemplate` (→ `cobranza_recordatorio`), `buildDunningTemplate` (→ `cobranza_mora`), `buildReceiptTemplate` (→ `pago_recibido`), `buildRenewalTemplate` (→ `contrato_renovacion`). Nombres sobreescribibles por env `WHATSAPP_TEMPLATE_*`.
- **Runners migrados**: `cobranza.ts` (dunning + recordatorio; el texto libre queda SOLO como preview de auditoría), `payment-receipt.ts` (comprobante) y `renovaciones.ts` (aviso de renovación) ahora envían por plantilla. La persistencia de mora (`late_fee_*`) no cambia: sigue desacoplada del envío — `COBRANZA_WHATSAPP_ENABLED=true` sin credenciales de Meta persiste mora sin enviar nada.
- **Pendiente de Fran en Meta Business Manager**: registrar las 4 plantillas (categoría UTILITY, español México) con los textos/párametros acordados en chat, + capturar `WHATSAPP_ACCESS_TOKEN` (token permanente de System User), `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_APP_SECRET` en Vercel. Luego `COBRANZA_WHATSAPP_ENABLED=true`.
- Follow-up: `POST /api/whatsapp/notify` (plantillas locales mora_day1/5/10 en texto libre, con un "3%" de mora inconsistente con el motor) quedó fuera de alcance — probablemente superseded por el cron runner; evaluar retiro.

---

## 0 · Fase en curso — Public Listing (aprobada por Fran 2026-07-03)

Plan de 4 fases acordado en chat (rama `claude/property-listing-website-qf916r`):

1. **Fase 1 (este PR)** — Sitio público de reserva directa generalizado:
   - Rutas `(public-booking)` movidas de `/mateos-809` a `/edificios/[buildingSlug]` (redirect 308 desde las URLs viejas en `next.config.js`). Cualquier edificio con `is_public_listed=true` tiene landing + unidades + detalle. Aplica directo al portafolio DuVa ReEs (809 y 2020).
   - **Fix de contrato cliente↔API**: los endpoints `/api/public/v1/*` envuelven en `{data}` y el cliente no lo desenvolvía; además las pages RSC hacían fetch con URL relativa (falla en Node → landing con fallbacks y detalle en 404 perpetuo). Ahora las pages leen las vistas `v_public_*` server-side (`src/lib/public-booking/server-data.ts`) y el cliente HTTP desenvuelve el envelope.
   - **Galería pública**: vista `v_public_unit_media` (migración `20260703_public_listing_phase1.sql`) conecta `media_assets` (visibility='public') con el sitio y con `GET /api/public/v1/units/[slug]`.
   - **Rentas por tipo**: `v_public_units` expone `rent_type` (units.type) y `monthly_rate_mxn`. STR = reserva Stripe (flujo existente); MTR/LTR = `LeadForm` → `POST /api/public/v1/leads` → crm_contact + crm_opportunity + tenant_application draft (link a `/apply/[token]`).
   - **UI de publicación**: `/units/[id]/publicacion` (campos públicos + hero desde media pública + switch con validaciones) y sección "Publicación" en BuildingModal (slug, nombre/descripción públicos, is_public_listed).
   - Pendiente para activar en prod: aplicar migración `20260703` en Supabase, `PUBLIC_BOOKING_ENABLED` + `NEXT_PUBLIC_PUBLIC_BOOKING_ENABLED` + `NEXT_PUBLIC_SITE_URL` en Vercel (ver `.env.example`).
   - **Bug descubierto al nivelar prod (2026-07-03):** `20260523_public_booking.sql` es SQL inválido — el EXCLUDE de `reservation_holds` usa `WHERE (expires_at > now())` y Postgres no permite funciones no-inmutables en predicados de índice (42P17). La migración de mayo NUNCA se aplicó completa en prod (solo columnas de buildings/units + seed, aplicadas a mano); `media_assets`/`unit_spaces` (20260415) tampoco existían. Fix: `20260703_02_reservation_holds_now_fix.sql` (constraint sin predicado + trigger de purga de holds expirados). Lección: prod tiene drift histórico vs `supabase/migrations/` — pendiente audit completo de drift (Fase 2).
   - Follow-ups anotados: theming por edificio (hoy todos usan el tema editorial 809), copy editorial de landing como campos de DB (hoy override `BUILDING_COPY` para mateos-809), páginas legales del footer, amenidades públicas reales por unidad (hoy set estático), hardening RLS/multi-tenant de `tenant_applications` (org_id TEXT legacy).
2. **Fase 2** — Screening → contrato (checklist en `/applications/[id]`, botón "Generar contrato" desde solicitud aprobada, envío Mifiel).
3. **Fase 3** — Renovación vía portal del inquilino ("Mi contrato" + re-firma).
4. **Fase 4** — Consolidación PM rentas fijas (recordatorios de vencimiento, vacancia → listing).

Decisión estratégica registrada (2026-07-03): canal directo por edificio/tenant (modelo WanderOS), NO marketplace consolidado bajo marca BaW por ahora. La relación con el huésped pertenece al tenant.

---

## 0.ter · Calendario de unidades (aprobado por Fran 2026-07-03, rama `claude/calendar-units-display-8waabf`)

Sección de visualización de ocupación modelo Airbnb, 2 vistas, en Portafolio → Calendario:

- **Vista A `/calendario`** — timeline multi-unidad: filas = unidades agrupadas por edificio (colapsables), columnas = días (zoom 2 semanas/mes/trimestre, navegación ◀ Hoy ▶), barras = estancias de los 3 instrumentos con colores de `/estancias` (STR morado / MTR ámbar / LTR azul), holds del booking público en gris rayado, franja de temporadas (`str_seasons`) arriba, línea de "hoy", KPIs de la ventana (ocupación %, noches vacantes, entradas/salidas hoy, contratos vencen ≤60d), filtros (edificio/tipo unidad/tipo estancia/holds/búsqueda), drawer de detalle con link al instrumento.
- **Vista B `/calendario/[unitId]`** — mensual por unidad con scroll vertical (meses apilados): cada día muestra ocupación + **precio por noche = `units.base_rate_mxn` × multiplicador de temporada** (misma fórmula que `/quotes`), tinte esmeralda en días con temporada.
- Lógica pura compartida en `src/lib/calendar-occupancy.ts` (rangos semiabiertos `[start, endExclusive)` como los EXCLUDE de DB; contratos `end_date` inclusivo → +1; `terminated`/`cancelled` no pintan; tentativas/holds no cuentan en ocupación). Constantes visuales en `src/components/calendar/calendar-ui.ts` (tailwind no escanea src/lib). Sin migraciones de DB.
- **v2 en el mismo PR (feedback de Fran 2026-07-03 con screenshot + kit UI System v1):** el timeline se reescribió a la spec «tl» del kit — grid FLUIDO (columnas = 100% del ancho / días, sin px fijos ni scroll horizontal), tokens de instrumento `--baw-instr-*` (STR teal / MTR ámbar / LTR azul / hold gris / temporada verde), barras suaves con borde izquierdo 3px, half-day check-in/out (salida+entrada conviven el mismo día), leyenda-filtro interactiva, "Nn libres" por fila. CSS de componente en `globals.css` (clases `tl-*`/`cal-*`). **Price management incluido:** en Vista B se arrastra sobre días libres → panel con estimado del rango, crear/editar/eliminar temporadas (`str_seasons`), editar `base_rate_mxn`, y "Crear reservación" que prellena `/reservations` vía query params. **Fase 3 (2026-07-03, mismo día, aprobada por Fran):** migración `20260703_03_calendar_phase3.sql` (tablas `unit_rate_overrides` — precio fijo por unidad+rango que GANA sobre base×temporada — y `unit_blocks` — bloqueos operativos con fechas y razón; ambas con EXCLUDE anti-solape y RLS org_members). Drag & drop en el timeline (mover estancia completa o estirar orillas, con confirmación y validación de solapes client-side + EXCLUDE en DB; reservaciones, contratos y bloqueos — holds no). Panel de rango en Vista B suma: fijar precio de la unidad, bloquear rango, y el estimado usa overrides. **⚠️ Aplicar la migración en Supabase prod antes de usar overrides/bloqueos** — sin ella el calendario degrada (queries fallan silencioso y no se pintan).
- Nota: RLS de `str_seasons` solo tiene política service_role en `20260404_rls_hardening.sql`; `/pricing` y `/quotes` ya la leen client-side igual que el calendario — si en prod el browser no la ve, el calendario degrada sin temporadas (mismo comportamiento que el cotizador). Verificar en el audit de drift de Fase 2.
- **Precio STR unificado (rama `feat/pricing-unify`, 2026-07-03):** `/quotes` y `/pricing` dejaron de leer/editar la tabla legacy `unit_prices` ($/persona/noche, sin org). Ahora TODO el pricing sale de `units` (org-filtrado): `monthly_rate_mxn` (renta) y `base_rate_mxn` ($/noche unidad completa) × `str_seasons` — la misma fórmula del sitio público y el calendario. Cambio de modelo del cotizador STR: por NOCHE (antes por persona con mínimo 4); huéspedes extra sobre `max_guests` +$250/pers/noche; limpieza desde `units.cleaning_fee_mxn`. `unit_prices` queda deprecada sin lectores (no se borra). **Antes de mergear: capturar `base_rate_mxn`/`monthly_rate_mxn` en Finanzas → Precios para las unidades que hoy solo tenían precio en `unit_prices`.**

---

## 0.quater · Auditoría mobile-friendly (2026-07-03, rama `fix/mobile-responsive`)

Auditoría de responsividad iPhone/390px sobre todo `src/`. Veredicto: el chrome ya era sólido (hamburguesa + sidebar off-canvas en `Sidebar.tsx`, modales `w-full max-w-*`, sub-nav con scroll, sitio público excelente). Fixes aplicados: 10 tablas sin `overflow-x-auto` (home, units, agents, owners anidada, owner portal, BulkUnitsModal, WizardFirstRun, 3 de /admin), filtros de mes de `/cobros` sin `flex-wrap`, `export const viewport` explícito en `layout.tsx`, grids `grid-cols-3` sin breakpoint en 4 modales/forms (UnitModal, housekeeping, ancillary-charges, policies), objetivos táctiles `p-1`→`p-2` en acciones de fila (cobros, owners, whatsapp, Sidebar, StayDrawer, StayOccupants), y el calendario abre en zoom "2 semanas" bajo 640px. Verificación visual con Chromium a 390×844 (timeline y vista mensual legibles).

---

## 0.quinquies · Cotización telefónica + CRM mínimo (2026-07-04, rama `feat/quote-flow`)

User story de Fran: llamada → disponibilidad en calendario → click entrada/click salida → cotizar → apartar 24-72h → enviar propuesta → confirma o se libera solo. Modelo acordado: **la cotización es una reservación `tentative` con `hold_expires_at`; el prospecto vive SOLO en CRM y se vuelve occupant al confirmar**.

- Migración `20260704_quote_flow_crm.sql`: `reservations.hold_expires_at` + `reservations.occupant_id`, `crm_opportunities.temperature` (frio/tibio/caliente) + `.reservation_id`, etapa `cotizado` en el funnel, y `fn_unit_is_available` ignora tentativas vencidas + **incluye unit_blocks** (hueco: los bloqueos no cerraban el booking público — también corregido en la route de blocked_days). **⚠️ Aplicar en Supabase prod (después de 20260703_03).**
- Selección **click entrada → click salida** en ambas vistas del calendario (touch-friendly, ESC cancela; el hover extiende la vista previa en desktop; en timeline se selecciona sobre la fila de la unidad con banda `tl-sel`).
- `QuotePanel` (`src/components/calendar/QuotePanel.tsx` + lógica en `src/lib/quote-flow.ts`): desglose con el motor unificado, huéspedes, temperatura, hold 24/48/72h, contacto = buscar/crear en `crm_contacts` (source llamada); crea tentativa + oportunidad `cotizado` ligada (`reservation_id`); propuesta prellenada por WhatsApp (wa.me), correo (mailto) o copiar.
- Drawer de tentativas: countdown del apartado ("expira en 36h"), **Confirmar** (→ confirmed, opp ganado, PROMUEVE contacto a occupant deduplicando el espejo del trigger `crm_contact_for_occupant`, liga `reservations.occupant_id`) y **Liberar** (→ cancelled, opp perdido).
- CRM `/clientes`: etapa Cotizado en kanban, chip y select de temperatura, "Historial de transacciones" = contratos + reservaciones (via `reservations.occupant_id`); `/reservations` ahora persiste el occupant del PersonPicker.

---

## 0.sexies · Revisión de finanzas por niveles (2026-07-04, rama `claude/finance-structure-review-7lanmw`)

Auditoría completa de la sección Finanzas + propuesta de arquitectura en **`docs/adr/ADR-022-finance-architecture-levels.md`** (status Proposed; v3 con decisiones de Fran del mismo día, incluye §4 capas de interacción/permisos/límites por actor y matriz de capacidades financieras por rol `pm_*`). **Taxonomía canónica de 7 actores** (Fran): Plataforma › Operadora (PM Co.) › Propietario › Proveedor de servicios › Titular (inquilino fijo) › Pagador (empresa o huésped que paga) › Ocupantes. Cuatro flujos de dinero: A operadora→plataforma (**múltiples revenue streams**, decidido por Fran; no existe aún), B operadora→propietario (cálculo efímero apagado, comisión **10% base personalizable por cliente** — decidido; propone `management_agreements`/`owner_statements`/`owner_payouts`), C pagador→operadora (el único construido, maduro), D operadora→proveedor (solo texto libre; propone `service_providers`). Patrón único acuerdo→cargo→abono→statement; `org_usage_snapshots` para decidir streams con datos (Fase 2); billing SaaS y Stripe Connect diferidos. Incluye deuda financiera D1-D10 (legacy `/payments/new`, `invoices.org_id` TEXT `'baw'`, RLS abiertas en tablas de dinero, PIN estático del conserje, ancillary sin materializar).
---

## 0.septies · Fase 0 higiene financiera (2026-07-04, rama `fix/finance-fase0-hygiene`)

Primera fase de implementación de **ADR-022** (arquitectura financiera por niveles, rama `claude/finance-structure-review-7lanmw`, PR #148). Cierra la deuda D1-D4 + D7 del ADR:

- **D1/D2**: eliminado `/payments/new` (flujo legacy que escribía `payments` sin `org_id`, sin abonos ni bitácora) y la ruta huérfana `/payments`; redirects 308 → `/cobros` en `next.config.js`; limpiado de `navigation.ts` y AppShell.
- **D3**: `invoices.org_id` TEXT `'baw'` → **uuid con FK a organizations** (migración `20260704_02_finance_rls_hygiene.sql`, backfill desde contrato → payment → primera org); el POST de `/api/invoices` ahora hereda la org del contrato.
- **D4**: RLS org-scoped en `invoices` (solo lectura para miembros; writes vía service_role), `payment_ledger` (select/insert por org, sigue inmutable, backfill de `org_id` NULL desde contratos) y `expenses` (select/insert/update por org, se quitó el DEFAULT hardcodeado a una org). Reutiliza `user_org_ids()` de 20260612.
- **D7**: `GET /api/gastos` filtraba por columna `date` inexistente → `expense_date`.
- **Bonus**: los DELETE de `/api/gastos` y `/api/ancillary-charges` siempre devolvían 401 desde la UI (pedían API key que las páginas no mandan) y borraban sin filtrar org → ahora doble plano de auth (API key o sesión de miembro, patrón PR #134) + delete acotado a la org del caller.

**⚠️ Aplicar `20260704_02_finance_rls_hygiene.sql` en Supabase prod ANTES de mergear** (cambia el tipo de `invoices.org_id` y endurece RLS; si el drift histórico de prod hace fallar algún paso, avisar y ajustamos el backfill). Pendientes del ADR: D5 (conserje, PR propio) y Fase 1 (liquidaciones a propietarios).

---

## 0.octies · Conserje: cobros server-side (2026-07-04, rama `fix/conserje-cobros-auth`)

Cierra D5 de ADR-022: el kiosco `/[orgSlug]/conserje` validaba el PIN (`1234` hardcodeado) en el CLIENTE y marcaba pagos escribiendo `payments` directo a Supabase con la anon key. Ahora:

- **PIN server-side**: `POST /api/conserje/session` valida contra `organizations.settings.conserje_pin` (por org) > env `CONSERJE_PIN` > `1234` legacy (⚠️ Fran: configurar el PIN real en settings o Vercel). Comparación timing-safe + delay anti fuerza bruta. Devuelve token HMAC de 12h (`src/lib/conserje-auth.ts`, firmado con `INTERNAL_WEBHOOK_SECRET`).
- **Cobros por API**: `GET /api/conserje/cobros` (pendientes del mes, org del token) y `POST /api/conserje/cobros/[id]` (marcar pagado en efectivo). Límites ADR-022 §4.1: solo marca cargos EXISTENTES pendientes de SU org — no crea ni edita montos. Liquida base+mora (mismo criterio que webhook Stripe) y **deja asiento en `payment_ledger`** (antes el conserje no dejaba bitácora).
- Bonus: fix de columnas fantasma `first_name`/`last_name` en el tab (occupants solo tiene `name` — el nombre del inquilino se renderizaba vacío).
- Sin migraciones. El token vive en sessionStorage y expira solo.

---

## 0.nonies · Liquidaciones a propietarios (2026-07-04, rama `feat/finance-owner-statements`)

**ADR-022 Fase 1 — flujo B (Operadora → Propietario) + proveedores v1 + permisos por rol.** Aprobado por Fran en chat ("arranca con todo").

- **Migración `20260704_03_finance_owner_statements.sql`** (⚠️ aplicar en Supabase prod antes de mergear): `management_agreements` (comisión base 10% **personalizable por edificio/propietario**, decisión de Fran; tipos percent_collected/percent_billed/flat_monthly, vigencia append-only estilo service_rates), `owner_statements` (estado de cuenta mensual persistido, UNIQUE por owner×building×period, snapshot jsonb inmutable al emitir, estados draft/issued/paid/void), `owner_payouts` (pagos al propietario), `service_providers` (actor A3, D10) + `expenses.provider_id`/`incidents.provider_id`. RLS: miembros leen; el propietario logueado lee SOLO sus statements emitidos (§4.3); escrituras server-side.
- **Lógica pura `src/lib/owner-statements.ts`** (estilo billing.ts) + armado server `src/lib/liquidaciones-server.ts`. Cobrado del mes sin doble conteo entre los dos modelos de captura: abonos (`payment_receipts`) + payments pagados en el mes SIN ningún abono (Stripe/conserje/legacy). Gastos generales prorrateados por unidad ocupada (criterio del endpoint owner legacy). Comisión resuelta de `management_agreements` (específica de owner > genérica de edificio > default 10%).
- **Endpoints**: `GET/POST /api/liquidaciones` (calcular mes / emitir statement — siempre recalcula server-side), `PATCH /api/liquidaciones/[id]` (anular, solo emitidos sin pagos; re-emisión reutiliza la fila void), `POST /api/liquidaciones/[id]/payouts` (registrar pago; al cubrir el neto → status paid), `GET/POST /api/management-agreements`.
- **Permisos por rol (ADR-022 §4.2)**: `src/lib/finance-permissions.ts` — mapa canónico de capacidades financieras por rol pm_* (legacy owner/admin/operator/viewer mapeados); `requireAdminCaller`/`requireMemberCaller` ahora devuelven `role` y los endpoints de liquidaciones lo aplican (`finance.emit_statements`, `finance.record_payout`, `finance.configure_agreements`). Migrar las páginas legacy de Finanzas a este mapa es follow-up.
- **UI**: nueva sub-página **Finanzas → Liquidaciones** (`/liquidaciones`): por (edificio × propietario) muestra cobrado − comisión − gastos − mantenimiento = neto × % propiedad, desglose por unidad, emitir/anular/registrar pago, y panel de comisiones. **Portal propietario**: `/owner/estados` (solo emitidos/pagados) + card en el dashboard. **Gastos**: selector de proveedor (catálogo `service_providers` + alta inline con dedupe por nombre; los gastos legacy con texto libre se normalizan al editarlos).
- La ruta legacy owner por token sigue 410-gated; borrarla definitivamente queda como follow-up una vez que el portal v2 con statements esté validado.

---

## 0.decies · Snapshots de uso por org (2026-07-04, rama `feat/finance-usage-snapshots`)

**ADR-022 Fase 2**: medición mensual para decidir los revenue streams de la plataforma con datos reales (decisión de Fran: múltiples streams; precio/activación se decide tras 2-3 meses de datos). Migración `20260704_04_org_usage_snapshots.sql` (tabla `org_usage_snapshots`, UNIQUE org×period, RLS: cada org lee lo suyo) + cron `GET /api/cron/usage-snapshots` (Vercel, día 1 de cada mes 8:00 UTC, `CRON_SECRET`, `?month=` override, upsert idempotente). Captura por org y mes cerrado: unidades activas (S1), usuarios activos (S2), contratos activos, **GMV cobrado** (S3, mismo criterio anti doble conteo que liquidaciones: receipts + payments pagados sin abonos), runs de agentes (S5) y CFDIs (S6). Solo medición — no factura ni toca dinero. ⚠️ Aplicar migración en Supabase prod; el conteo de CFDIs por org asume la migración de Fase 0 (`invoices.org_id` uuid) aplicada.

---

## 0.bis · Qué aterrizó entre 2026-06-11 y 2026-07-02

- **Reencuadre estratégico (Fran, 2026-07-01):** BaW OS es a corto plazo la **herramienta interna de DuVa ReEs** (family office Durán Vargas: edificios 809 y 2020), no el producto SaaS a comercializar. La apuesta comercial de ZXY se mueve a **Engrane AI**. La productización de BaW OS queda en pausa, no cancelada.
- **Hugo (MK2) NO se conecta a BaW OS** — decisión 2026-06-21, ver `docs/runbooks/hugo-cos-connect.md` (marcado LEGACY). La sección de Sprint 5A abajo refleja el plan original; el conectado real del MVP es solo Alicia.
- **PR #134 (seguridad, mergeado 2026-07-01):** auth en `/api/applications`, admin guard en whatsapp/send + receipt, firma de Meta en webhook WhatsApp, secreto en Mifiel, comparaciones timing-safe, whitelist en payments PATCH, fix cross-tenant en owner-context, `amount_paid` en webhook Stripe. **Pendiente de Fran en Vercel: `WHATSAPP_APP_SECRET` (sin esto el webhook de WhatsApp NO procesa), `MIFIEL_WEBHOOK_SECRET`, y rotar `BAWOS_API_KEY`.**
- **PRs #128-#133:** `src/lib/billing.ts` como fuente única de estatus de cobros (dashboard + portal + cobros proyectan igual), libro de abonos `payment_receipts` con pago rápido histórico (PR #131), pagador ≠ ocupante (`payer_occupant_id`), `stay_occupants` (multi-inquilino con rotación), `service_rates` (agua por edificio), CRM occupants sync, chat de agentes in-app, snapshot del roadmap re-auditado al 2026-06-30.
- **Migraciones nuevas** (¡confirmar aplicadas en Supabase prod!): `20260617_crm*`, `20260622_archive_lifecycle`, `20260623_agent_chat`, `20260625_crm_occupant_sync`, `20260627_party_kind_payer`, `20260627_stay_occupants`, `20260628_contracts_billing_start`, `20260628_payment_receipts`, `20260629_service_rates`.
- **Deuda cerrada en este ciclo:** backend Python muerto eliminado (`_python_app/`, `api_backend/`), `GET /v1/reservations` reparado (columnas fantasma → schema real), cron mensual respeta `service_rates` y `billing_start_date`, recompute de cargos movido a server (`POST /api/payments/[id]/recompute`).

---

## 1 · Sprint en curso

**Sprint 5A MVP — Producto mínimo utilizable con agentes third-party · simplificado el 2026-06-11.**

**Goal:** Fran + Alicia + Hugo operando Mateos 809P vía Discord sobre las features que ya existen. Producto mínimo, no plataforma completa.

**Decisiones de simplificación (2026-06-11, Fran):**
- **Agentes nativos fuera del alcance**: la UI `/agents` muestra solo la familia third-party. Nada se borra de DB. El runner de cobranza sigue vivo como cron interno (`/api/cron/cobranza`, diario, dry-run default) sin presentarse como agente.
- **Alicia** (`alicia-ops`) = operadora de Mateos 809P. Scopes: `incidents:rw, tasks:rw, units:r, contracts:r, payments:r, approvals:r, interactions:rw`.
- **Hugo** (`hugo-cos`) = supervisor de Alicia, **solo lectura + reportes** (`runs:read, approvals:read, insights:read`). NO aprueba acciones (solo Fran), NO dispara a Alicia. Runbook: `docs/runbooks/hugo-cos-connect.md`.
- **División de trabajo**: Claude (Fable 5) → repo `baw-os`; Codex → repo `openclaw-skill-baw-os` (skill con persona dual Alicia+Hugo). El contrato de interfaz está en AGENTS.md §9.
- Siguen vigentes de ADR-016: webhooks-first + long-poll safety net, repo separado para el skill, CFDI/Stripe writes en Fase 6, in-app chat en 5B.

**Estado server-side (2026-06-11):** pipeline Discord completo (endpoint principal + `/process` + `/v1/interactions` GET/PATCH), botones de aprobación reparados y ejecutando vía dispatcher, `GET /v1/runs` reparado, UI `/agents` solo third-party con badges de conexión, cron cobranza, webhooks issue #22 migrados, guard de submodule en prebuild. Pendiente: Codex (skill), migraciones SQL en Supabase prod, env vars en Vercel, credenciales de Alicia/Hugo (Fran).

**Bugs encontrados y corregidos en main (patrón "columnas fantasma en selects"):**
- `GET /v1/runs` seleccionaba `completed_at, created_at` — columnas inexistentes en `agent_runs` (son `started_at, finished_at`). Todo GET devolvía 500.
- Botones Discord de aprobación: status `'approved'` (el CHECK admite `'granted'`), columna `resolved_by_discord_user` inexistente (migración `20260611` la agrega), y el grant nunca ejecutaba la acción.
- Lección: al escribir selects/updates de Supabase, verificar columnas contra `supabase/migrations/`, no contra memoria.

Docs canon:
- [ADR-016 Third-Party Agent Integration](./adr/ADR-016-third-party-agent-integration.md)
- [ADR-021 Third-Party Agents Discord](./adr/ADR-021-third-party-agents-discord.md) (D8 cerrado)
- [Sprint 5A Plan](./sprints/SPRINT_5A_PLAN.md) (alcance recortado a MVP — ver nota al inicio)
- Runbooks: `setup-discord-channel.md`, `setup-cloudflare-tunnel.md`, `alicia-skill-install.md`, `hugo-cos-connect.md`

---

## 1.bis · Sprint anterior

**Sprint 6 — Visual Rollout & Bug Bash · CERRADO el 2026-05-02.**

PRs cerrados en el sprint:
- #44 BaW Mark + Sidebar shell + Mark A canónico
- #45 Migrar `/me`, `/agents`, `/admin/roadmap` a tokens BaW
- #46 Owner Portal a tokens BaW
- #47 Onboarding wizard a tokens BaW
- #48 Visual audit final + cierre HEX residual
- #49 Sprint 6 followups (BawGrid en AppShell + bulk visible en Configurar cuenta)
- #50 Sprint 6 followups #2 (`/settings` real fix + bulk en `/units` + login race fix)
- #51 Hotfix login: `sync-session` cookie roundtrip + probe loop graceful fallback

**Resultado:** producción `baw-os.vercel.app` con visual unificado (Mark A + retícula de fondo + tokens `--baw-*`), wizard onboarding con bulk de unidades, `/units` con bulk también, login funcional con `?next=/admin`.

---

## 2 · Próximo sprint (Sprint 7) — propuestas a confirmar con Fran

Estas son hipótesis derivadas de issues abiertos y conversaciones recientes. **Confirmar con Fran antes de empezar.**

| Tema | Justificación | Issue/Doc |
|---|---|---|
| Cierre del tablero de cobranza real (Mateos) | Aparece como sugerencia en Codex (image-3); cliente piloto activo | Por crear issue |
| Gestión de edificios y propietarios | Backlog del PRD; CRUD aún incompleto | `docs/PRD.md` |
| Blindar deploy Vercel con `baw-design` | Build inestable cuando `design/baw-design/` cambia | Por crear issue |
| Migración legacy `member_role` enum | Deuda heredada de Sprint 3 | [#23](https://github.com/zxy-vc/baw-os/issues/23) |
| Migración HEX residual a tokens BaW | Deuda heredada Sprint 4-5 | [#24](https://github.com/zxy-vc/baw-os/issues/24) |
| `getOrgIdAsync()` shim en webhooks | Deuda heredada | [#22](https://github.com/zxy-vc/baw-os/issues/22) |

---

## 3 · Bugs conocidos abiertos

(Ninguno crítico al cierre del Sprint 6. Si encuentras uno, agrégalo aquí o abre issue.)

---

## 4 · Decisiones canónicas vigentes (refresco)

> Versión condensada. La fuente completa es `AGENTS.md` §2.

- **Logo:** Mark A (desfase pronunciado). Componente `BawMark` en `src/components/brand/BawMark.tsx`.
- **Retícula de fondo:** `BawGrid` debe estar visible en TODAS las pantallas como distintivo (decisión de Fran post Sprint 6 PR D).
- **Visual unificado:** toda la app debería verse como `/login` (decisión de Fran).
- **Tokens:** todos `--baw-*` desde `design/baw-design/tokens/index.css`. Nunca tokens paralelos.
- **Tipografía:** Inter via `next/font/google` en `src/app/layout.tsx`. No tocar.
- **Navegación:** 6 secciones top + 2 footer en `src/lib/navigation.ts`. Ver `AGENTS.md` §2.3.
- **Admin 3 capas:** L0 `/admin` (solo `fran@zxy.vc`) · L1 `/settings/account` · L2 `/me`. Ver `AGENTS.md` §2.4.
- **Org context:** `resolveOrgId()` en `src/lib/org-context.ts` es la única fuente de verdad de `org_id`. Cualquier query a Supabase filtra por `org_id`.

---

## 5 · Patrones de bug ya documentados (NO repetir)

Estos bugs ya pasaron una vez. Si los ves de nuevo, hay solución conocida:

### 5.1 — Loading eterno en pages que dependen de `useOrgContext()`

**Síntoma:** página queda en "Cargando…" infinito.
**Causa:** `useEffect(() => { if (orgId) load(orgId) }, [orgId])` — si `orgId === null` el `load()` jamás corre y `useState(true)` queda eterno.
**Fix canónico:** distinguir 3 estados:

```tsx
useEffect(() => {
  if (orgLoading) return
  if (orgId) { load(orgId); return }
  setLoading(false)  // sin org, no spinear
}, [orgId, orgLoading])
```

Y rama "no hay org" debe mostrar UI con CTAs, no `<div>` plano.
**Caso histórico:** PR #50 (`/settings`).

### 5.2 — Race condition en login con `?next=/admin`

**Síntoma:** infinite loop entre `/login` y la página destino.
**Causa:** `window.location.href` se ejecuta antes de que el browser commit el `Set-Cookie`.
**Fix canónico:** probe loop a `/api/me/whoami` con backoff antes de navegar; si falla, navegar igual con warn (no bloquear con error visible).
**Caso histórico:** PRs #50 + #51.

### 5.3 — Cookies a medio setear en endpoints de auth

**Síntoma:** browser recibe `Set-Cookie` sin `path` / `httpOnly` / `sameSite`.
**Causa:** crear un `NextResponse` nuevo y copiar cookies de otro response con `cookies.set(name, value, c)` donde `c` es el `ResponseCookie` original (shape incorrecto para `CookieOptions`).
**Fix canónico:** devolver el response original con `{ headers: response.headers }` en vez de reconstruir.
**Caso histórico:** PR #51 (`/api/auth/sync-session`).

### 5.4 — `Promise.all` que rechaza deja `setLoading(false)` sin ejecutar

**Síntoma:** spinner eterno cuando una de N queries falla.
**Causa:** `setLoading(false)` solo en `.then()`, no en `.finally()`.
**Fix:** siempre `try/finally` o `.finally(() => setLoading(false))`.

### 5.5 — `supabase-js` `.single()` rechaza con `PGRST116` cuando no hay row

**Fix:** usar `.maybeSingle()` cuando la row puede no existir.

---

## 6 · Stack y URLs vivas

- **Repo:** https://github.com/zxy-vc/baw-os
- **Producción:** https://baw-os.vercel.app
- **Supabase project:** `zlcgxmllaeweypyodvzk`
- **Org producción:** `BaW Operations` · slug `baw-operations` · id `81a011c4-4ea6-4b79-924d-73dbe6d35e14`
- **Owner humano:** Fran Durán · `fran@zxy.vc` (prod) · `franduranv@gmail.com` (personal)
- **Stack:** Next.js 14 App Router + TypeScript + Tailwind 3 + Supabase 2.43 + Vercel

---

## 7 · Cómo actualizar este archivo

Cualquier agente que cierre un sprint, mergee un PR mayor, o descubra un nuevo patrón de bug:

1. Edita la sección correspondiente de este archivo.
2. Actualiza la fecha al inicio.
3. Inclúyelo en el mismo PR que cierra el cambio (no PR separado).

Si el cambio es grande (nuevo sprint, nueva arquitectura), también actualiza `AGENTS.md`.
