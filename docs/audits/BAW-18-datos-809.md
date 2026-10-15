# BAW-18 · Diagnóstico de datos del 809

> **Carril:** LD · **Entrega 1:** «Lo que BaW OS dice del 809 es verdad» · **Recorrido:** primer día del mes (cobrar) → «ver quién debe».
> **Clasificación:** AJUSTE (solo documento; el usuario no lo nota).
> **Alcance:** solo diagnóstico. Nada de este documento escribe en la base. Todo el SQL de las secciones 4 y 5 es `SELECT` puro; el SQL de la sección 6 es un **esqueleto** de la Fase B que **no se ejecuta** sin el OK de Fran.
> **Org:** DuVa ReEs · `81a011c4-4ea6-4b79-924d-73dbe6d35e14` (única org en prod).
> **Base del análisis:** `origin/main` @ `2d73e27` (2026-10-01).

Convención: toda afirmación sobre el código va con `archivo:línea` de `main`. Lo que **no** se puede afirmar sin datos de prod está marcado como **hipótesis** y trae la consulta que la confirma o la descarta.

---

## 0 · Resumen ejecutivo

**Hipótesis principal:** la mayoría de los «57 pagos vencidos / $374,900» **no son filas de `payments`**. Son meses **proyectados** por Mission Control a partir de las fechas del contrato:

1. Mission Control no suma filas: recorre cada mes desde `billing_start_date ?? start_date` hasta el mes actual (`src/app/page.tsx:179-182`, `src/lib/billing.ts:21-44`). Si un mes no tiene una fila `paid`/`partial`, lo cuenta como `vencido` por el monto completo del contrato más agua (`src/lib/billing.ts:71`, `src/lib/billing.ts:84-93`).
2. La ventana es de 24 meses (`src/lib/billing.ts:11`, `src/lib/billing.ts:43`). Con corte en octubre de 2026, el mes más viejo posible es **2024-11**. Los atrasos de D302 (700, 670, 639 y 608 días al 2-oct-2026) corresponden **exactamente** a 2024-11-01, 2024-12-01, 2025-01-01 y 2025-02-01. Esos son los primeros cuatro meses de la ventana, con `payment_day = 1` (`src/app/page.tsx:184`). Eso indica que el contrato de D302 arranca en 2024-11 o antes y no tiene `billing_start_date`. La ventana corta el resto del histórico.
3. El cron mensual **no puede** haber creado cargos de 2024. Se agregó el 2026-04-02 (commit `a46987e`) y solo inserta el **mes en curso** (`src/app/api/cron/payments/route.ts:41-45`, `src/app/api/cron/payments/route.ts:109`). En el repo no hay ningún importador de pagos históricos (§1.3).
4. La columna `billing_start_date` existe **precisamente** para evitar que contratos viejos de 2023/2024 «generen 2 años de adeudo no verificado» (`supabase/migrations/20260628_contracts_billing_start.sql:1-13`). Si los contratos del 809 se capturaron con su `start_date` real y sin `billing_start_date`, cada mes previo a que BaW OS se usara para cobrar aparece como deuda. Esos meses caen en el bucket **«pagado por fuera sin registrar»**, salvo que Fran confirme que sí se deben.
5. Además, `units.status` («Ocupada») es un campo **manual**, independiente de `contracts` (§2). Nada lo actualiza cuando un contrato termina, vence o se renueva. Por otro lado, Mission Control **ignora `end_date` y `archived_at`** del contrato, mientras que el Calendario sí los respeta (§2.3). Por eso las tres pantallas cuentan cosas distintas.

**Qué corre Fran primero:** Q0 (esquema) → Q4 con `today = '2026-10-02'` (debe dar 57 / $374,900; si no cuadra, la réplica está mal y hay que parar) → Q3 (contratos) → Q2 (unidades ocupadas sin contrato) → Q11 (clasificación propuesta). Detalle en §7.

---

## 1 · Cómo nacen las filas de `payments`

### 1.1 Todos los escritores de `payments` en `main`

| # | Escritor | Qué inserta/actualiza | Cita |
|---|---|---|---|
| 1 | **Cron mensual** `GET /api/cron/payments` (Vercel Cron `0 6 1 * *`) | INSERT de la renta del **mes en curso** + cargos accesorios del mes | `vercel.json:3-6`, `src/app/api/cron/payments/route.ts:143-146` |
| 2 | Modal «Registrar pago» (`AbonoModal.ensureCharge`) | INSERT del cargo del mes que el usuario abre (`due_date = target.dueDate`, `status='pending'`) si aún no existe; luego abono + recompute | `src/components/cobros/AbonoModal.tsx:153-187` |
| 3 | Pago rápido (`quickPayMonth`) | INSERT del cargo del mes proyectado si no existe, + abono «Histórico (pago rápido)» con `paid_date = dueDate` | `src/lib/cobros-actions.ts:44-68`, `src/lib/cobros-actions.ts:73-84` |
| 4 | API Tier 2 `POST /api/payments` | INSERT `status='paid'` con `due_date = paid_date = hoy` | `src/app/api/payments/route.ts:40-53` |
| 5 | API de agentes `POST /api/v1/payments` | INSERT `status='paid'`, `due_date = body.due_date ?? hoy` | `src/app/api/v1/payments/route.ts:85-98` |
| 6 | Aprobación de agente (`payment.record`) | Igual que #5 | `src/lib/agents/v1/dispatcher.ts:135-148` |
| 7 | Seed histórico `mateos-809.sql` (**no** es migración) | 3 filas de abril 2026 (D202 `paid`, D302 `late`, D402 `late`) | `supabase/seed-examples/mateos-809.sql:62-87`, `supabase/seed-examples/mateos-809.sql:145-149` |

UPDATEs relevantes (no crean filas, pero cambian el estatus que lee Mission Control):

- `POST /api/payments/[id]/recompute` deriva `amount_paid`/`status` de la suma de abonos (`src/app/api/payments/[id]/recompute/route.ts:36-59`).
- Webhook de Stripe y conserje marcan `paid` **con** `amount_paid` = total (`src/app/api/webhooks/stripe/route.ts:42-58`, `src/app/api/conserje/cobros/[id]/route.ts:43-58`).
- `POST /api/ledger` marca `status='paid'` **sin** `amount_paid` (`src/app/api/ledger/route.ts:82-91`). Ver §3.3: Mission Control cuenta esa fila como `parcial` con adeudo completo.
- El runner de cobranza persiste `late_fee_amount` todos los días en cualquier fila no pagada (`src/lib/agents/cobranza.ts:87-106`). Desde PR #162 (mergeado el 2026-08-13) lo hace aunque esté en dry-run (`src/lib/agents/cobranza.ts:188-190`).

### 1.2 Qué respeta y qué no respeta el cron

`src/app/api/cron/payments/route.ts`:

| Regla | ¿La respeta? | Cita |
|---|---|---|
| `status` del contrato | Sí: solo `active` y `en_renovacion` | `route.ts:66-69` |
| `rent_type` | Sí: excluye STR | `route.ts:70` |
| `billing_start_date` / `start_date` | **Sí, a nivel mes**, desde el 2026-07-02 (commit `ac4a588`): no genera si `billing_start_date ?? start_date` es posterior al mes en curso | `route.ts:90-96` |
| `end_date` | **No.** Ni siquiera lo selecciona. Un contrato `active`/`en_renovacion` con `end_date` vencida sigue generando renta cada mes | `route.ts:68` |
| `archived_at` del contrato | **No** lo filtra | `route.ts:66-70` |
| `org_id` | No filtra por org (corre para todas); cada fila hereda el `org_id` del contrato | `route.ts:66-70`, `route.ts:104` |
| Ocupación real de la unidad (`units.status`) | No la consulta | `route.ts:66-70` |
| Estatus del contrato en **cargos accesorios** | **No.** Basta con `ancillary_charges.status='active'` y la vigencia del cargo; un contrato terminado sigue generando estacionamiento | `route.ts:117-122` |
| Mes que genera | Solo el mes en curso (`now()` del servidor) | `route.ts:41-45`, `route.ts:109` |
| Idempotencia | Dedup en memoria por `contract_id` + mes (renta) y por `ancillary_charge_id` + mes (accesorios). No hay índice único ni se revisa el error del INSERT | `route.ts:51-62`, `route.ts:145` |
| Día de vencimiento | `payment_day || 5` (Mission Control usa `|| 1`, `src/app/page.tsx:184`) | `route.ts:109` |

**Conclusión 1.2:** el cron puede generar basura de **meses recientes** (desde abril de 2026) para contratos con `end_date` vencida, archivados, o con estatus `active` aunque el inquilino ya se fue. **No puede** generar cargos de 2024 ni de principios de 2025.

### 1.3 ¿Hubo backfill o import?

- **En el repo, no hay importador de pagos.** El único bulk import (`/onboarding/bulk`, commit `98292b1`) llama a `/api/onboarding` y solo crea org, edificio, unidades (con `status: 'available'`) y propietario (`src/app/api/onboarding/route.ts:150-165`). No crea contratos ni pagos.
- El único «backfill» de `payments` en migraciones es `UPDATE ... SET amount_paid = amount WHERE status='paid' AND amount_paid IS NULL` (`supabase/migrations/20260617_payments_amount_paid.sql:15-17`). No crea filas.
- El seed `mateos-809.sql` **no es ejecutable** post-Sprint 3 según su README (`supabase/seed-examples/README.md:12-19`) y solo crea 3 pagos (`mateos-809.sql:145-149`). Pero sus **contratos** muestran el patrón de captura del 809: `start_date` históricas reales (2023-01 a 2024-03), `payment_day = 1` y sin `billing_start_date` (`mateos-809.sql:133-141`). Si los contratos de prod se capturaron igual (por seed, a mano o por SQL fuera del repo), eso basta para producir los atrasos observados **sin que exista ninguna fila**.
- Una carga manual o por SQL fuera del repo **no se puede descartar desde el código**. Q9 la detecta: muchas filas con el mismo `created_at` y `due_date` dispersos, o filas con `created_at` muy posterior a su `due_date`.

### 1.4 Respuesta directa: ¿cómo nacieron «cargos de ~700 días»?

- **Lo más probable es que no nacieron.** Mission Control los **proyecta** (§3). Para D302, 700/670/639/608 días = 2024-11-01…2025-02-01, que es justo el piso de la ventana de 24 meses (`src/lib/billing.ts:11`, `src/lib/billing.ts:43`). Q4 lo confirma con la columna `meses_sin_fila_en_payments`.
- D203 con 594 días = **2025-02-15**. Como el `dueDate` de Mission Control se arma con mes + `payment_day` del contrato (`src/app/page.tsx:184`), eso es consistente con `payment_day = 15` y un primer mes vencido en 2025-02. **Hipótesis por confirmar en Q3/Q4**; el seed tiene `payment_day = 1` para D203 (`mateos-809.sql:134`), así que prod difiere del seed.
- Si Q4 muestra que esos meses **sí** tienen fila: Q9 dirá cuándo se crearon (`created_at`) y Q6 si caen fuera del rango del contrato.

---

## 2 · «Ocupada» en Unidades vs barras del Calendario

### 2.1 De dónde sale «Ocupada»

- La pantalla Unidades lee `units` filtrando solo por org, edificio y `archived_at` (`src/app/units/page.tsx:97-108`). Cuenta «Ocupadas» con `u.status === 'occupied'` (`src/app/units/page.tsx:121-130`, chip en `src/app/units/page.tsx:340`). **No consulta `contracts`.**
- Mission Control usa el mismo campo para «Ocupación» y, ojo, también para el KPI **«Contratos activos»** (`src/app/page.tsx:212-215`, `src/app/page.tsx:362`). Ese KPI no cuenta contratos: cuenta unidades con `status='occupied'`.
- Quién escribe `units.status`:
  - edición manual en Unidades (`src/app/units/page.tsx:174-177`; modal `src/app/units/UnitModal.tsx:18`, `src/app/units/UnitModal.tsx:93`);
  - **solo** el alta de contrato desde la UI lo pone en `occupied` (`src/app/contracts/new/page.tsx:94`);
  - la API v1 y el dispatcher al crear unidad (`src/app/api/v1/units/route.ts:76`, `src/app/api/v1/units/route.ts:93`);
  - el onboarding, que crea en `available` (`src/app/api/onboarding/route.ts:156`);
  - el seed histórico (`mateos-809.sql:104-119`).
- **Nada lo regresa a `available`.** Ni editar el contrato a `terminated`/`expired` (`src/app/contracts/page.tsx:101-115`), ni renovarlo (`src/app/contracts/page.tsx:166`), ni el runner de renovaciones (`src/lib/agents/renovaciones.ts:93-97`). Crear contrato por API o agente tampoco pone la unidad en `occupied` (`src/app/api/contracts/route.ts:48-52`, `src/lib/agents/v1/dispatcher.ts:202-214`).

### 2.2 De dónde salen las barras del Calendario

- `/calendario` carga contratos con `org_id`, **`archived_at IS NULL`** y **`unit_id NOT NULL`** (`src/app/calendario/page.tsx:221-226`). Las unidades también se filtran por `archived_at IS NULL` (`src/app/calendario/page.tsx:214-220`).
- `contractToStay` solo pinta los estatus `active`, `pending`, `renewed`, `en_renovacion` y `expired` (`src/lib/calendar-occupancy.ts:103-106`, `src/lib/calendar-occupancy.ts:150`). La barra va de `start_date` a `end_date + 1` (`src/lib/calendar-occupancy.ts:159-160`); sin `end_date` llena hasta el borde (`src/lib/calendar-occupancy.ts:310`).
- Una barra solo se ve si intersecta la ventana visible (`src/lib/calendar-occupancy.ts:311`), que arranca en hoy − 7 días (`src/app/calendario/page.tsx:145`).

### 2.3 Por qué divergen (7 «ocupadas» vs 2 barras)

Una unidad puede estar «Ocupada» y no tener barra hoy por cualquiera de estas razones (Q2 dice cuál aplica a cada una):

| Causa | Unidades | Calendario | Mission Control |
|---|---|---|---|
| A. Sin ningún contrato | Ocupada (manual) | Sin barra | Sin cobro |
| B. Contrato archivado | Ocupada | Sin barra (`calendario/page.tsx:225`) | **Sí cobra**: no filtra `archived_at` (`src/app/page.tsx:119-124`) |
| C. Contrato `active`/`en_renovacion` con `end_date` vencida | Ocupada | Barra en el pasado, fuera de la ventana (`calendar-occupancy.ts:160`, `:311`) | **Sí cobra hasta hoy**: `scheduleMonths` no recibe `end_date` (`src/app/page.tsx:179-182`) |
| D. Contrato `terminated`/`cancelled` | Ocupada (nadie la libera) | Sin barra (`calendar-occupancy.ts:150`) | No cobra (`src/app/page.tsx:123`) |
| E. Contrato con `unit_id` nulo o de otra unidad/duplicada | Ocupada | Sin barra en esa fila (`calendario/page.tsx:226`) | Cobra si está activo |
| F. Contrato futuro (`start_date > hoy`) | Ocupada | Barra a la derecha, quizá fuera de la ventana | No cobra aún |

**Hipótesis:** D302 y D203 aparecen en la morosidad, así que tienen contrato `active`/`en_renovacion` (`src/app/page.tsx:123`), pero no tienen barra. Lo más probable es la causa **C** (en el seed, D203 termina 2025-12-31 y está `en_renovacion`, `mateos-809.sql:134`) o la **B**/**E** para D302 (en el seed no tiene `end_date`, `mateos-809.sql:137`, así que si fuera visible tendría barra abierta). Lo confirman Q2 y Q3.

---

## 3 · Cómo calcula Mission Control la morosidad

### 3.1 Algoritmo (`src/app/page.tsx`)

1. **Contratos:** `contracts` de la org activa con `status IN ('active','en_renovacion')`, **sin** filtro de `archived_at` ni de `end_date` (`src/app/page.tsx:106-108`, `src/app/page.tsx:119-124`).
2. **Pagos:** **todas** las filas de `payments` de esos contratos, incluidos los cargos accesorios: `contract_id, due_date, status, amount, amount_paid, late_fee_amount` (`src/app/page.tsx:150-156`).
3. **Agua:** `service_rates` de la org con `service='agua'` (`src/app/page.tsx:157-161`). Gana la tarifa específica del edificio sobre la general (`building_id IS NULL`) y, dentro de eso, la de `effective_from` más reciente ≤ mes (`src/lib/cobros.ts:56-76`). Si no hay tarifa, $250 (`src/app/page.tsx:188`).
4. **Una fila representante por contrato + mes** (`YYYY-MM` de `due_date`): gana `paid` > `partial` > cualquier otro estatus; en empate se queda la primera que llegó (`src/app/page.tsx:166-171`, `src/lib/billing.ts:47-51`). **No distingue renta de accesorio.**
5. **Meses:** `scheduleMonths(billing_start_date ?? start_date, mesActual)`, acotado a los **últimos 24 meses** (`src/app/page.tsx:173`, `src/app/page.tsx:179-182`, `src/lib/billing.ts:21-44`).
6. **Vencimiento:** `${mes}-${payment_day || 1}` (`src/app/page.tsx:184`).
7. **Estatus del mes** (`src/lib/billing.ts:70-94`):
   - `base = payment.amount ?? (monthly_amount + agua)`; `fee = late_fee_amount || 0`; `paid = amount_paid || 0` (`billing.ts:71-73`).
   - Fila `paid` o `partial` → `parcial` si `base + fee − paid > 0.001`, si no `pagado` (`billing.ts:74-80`).
   - Sin `payment_day` (null o 0) → `verbal`, adeudo 0 (`billing.ts:81-83`).
   - Hoy < vencimiento → `pendiente` (`billing.ts:84-87`).
   - `fee > 0` → `mora`, adeudo `base + fee` (`billing.ts:90-92`).
   - Si no → `vencido`, adeudo `base` (`billing.ts:93`).
8. **Morosidad** = Σ adeudo de los meses en `mora`, `vencido` o `parcial`. **«N pagos vencidos»** = número de **meses** contrato-mes, no de filas (`src/app/page.tsx:197-199`, `src/app/page.tsx:224-225`).
9. La tabla «Cobros pendientes» muestra los 5 más viejos (orden por `dueDate`, `src/app/page.tsx:202`, `src/app/page.tsx:250`) con `días = floor((ahora − dueDate) / 1 día)` (`src/app/page.tsx:256-259`).

### 3.2 Réplica SQL

Es la **consulta Q4** de §4. Reproduce los pasos 1-8 en SQL y entrega detalle por unidad, contrato y mes, subtotal por unidad y total. Para validar la réplica, córrela con `today = '2026-10-02'`: el total debería dar **57 / $374,900**. Diferencias esperables, menores:

- `late_fee_amount` cambia a diario por el cron de cobranza (`src/lib/agents/cobranza.ts:96-106`), así que hoy la mora persistida puede no ser la del 2-oct.
- Empates de la fila representante: el navegador toma la primera que devuelve PostgREST (sin `ORDER BY`, `src/app/page.tsx:152-155`); Q4 desempata por `created_at`.
- PostgREST corta en 1000 filas por defecto. Si el org tuviera más de 1000 pagos de contratos activos, Mission Control vería menos que Q4 (Q9 da el conteo).

### 3.3 Hallazgos colaterales del cálculo (todos inflan la morosidad)

| Hallazgo | Efecto | Cita |
|---|---|---|
| Ignora `end_date` | Un contrato vencido sin cambiar de estatus cobra todos los meses hasta hoy | `src/app/page.tsx:179-182` |
| Ignora `archived_at` | Un contrato archivado sigue en la morosidad (el Calendario lo oculta) | `src/app/page.tsx:119-124` vs `src/app/calendario/page.tsx:225` |
| Meses sin fila = vencido | Todo el histórico previo a BaW OS cuenta como deuda si no hay `billing_start_date` | `src/lib/billing.ts:71`, `:93`; `supabase/migrations/20260628_contracts_billing_start.sql:1-13` |
| Ventana móvil de 24 meses | Cada mes el mes más viejo sale de la cuenta: la «deuda» baja sola sin que nadie pague | `src/lib/billing.ts:43` |
| `paid` sin `amount_paid` (vía `/api/ledger`) | Se lee como `parcial` con adeudo = cargo completo | `src/app/api/ledger/route.ts:82-91` + `src/lib/billing.ts:77-79` |
| `waived` (y un futuro `void`) | No son `paid`/`partial` → se cuentan como `vencido`/`mora` | `src/lib/billing.ts:74`, `:90-93`; enum `docs/schema.sql:113` |
| Pagos con `due_date = hoy` (API, agentes) | El dinero cae en el mes del registro, no en el mes que pagó; ese mes queda `vencido` | `src/app/api/payments/route.ts:47-48`, `src/app/api/v1/payments/route.ts:92-93` |
| Dos pagos el mismo mes | Solo uno representa al mes; el otro no salda ningún mes | `src/app/page.tsx:166-171` |
| Accesorio como representante | Si falta la fila de renta y hay un accesorio pendiente, `base` = monto del accesorio | `src/app/page.tsx:168`, `src/lib/billing.ts:71` |
| Mora persistida diaria | 5% o 10% sobre cada fila vencida, en todas las filas no `paid` y sin `confirmed_at`, sin mirar el contrato | `src/lib/mora-engine.ts:32-40`, `src/lib/agents/cobranza.ts:96-106` |

---

## 4 · Paquete de consultas SQL de SOLO LECTURA

**Cómo usarlas**

- Todas son `SELECT` (o `WITH … SELECT`). Ninguna escribe, crea objetos ni llama funciones con efectos.
- Pégalas una por una en el SQL Editor de Supabase (proyecto `zlcgxmllaeweypyodvzk`). Corren como `postgres`, sin RLS; por eso **todas** filtran por `org_id`.
- Parámetros en el CTE `p` al inicio de cada consulta: `org_id` y `today`. Para reproducir la foto del 2-oct, cambia `today` por `'2026-10-02'::date`.
- Los estatus se comparan como `::text` porque en prod pueden ser ENUM o TEXT (drift, ver Q0) y porque `'cancelled'`/`'void'` no existen en los ENUM documentados (`docs/schema.sql:84`, `docs/schema.sql:113`). Comparar un ENUM contra una etiqueta inexistente truena.
- **Validación previa (sin datos de prod):** todas las consultas Q0-Q11 se corrieron dentro de `BEGIN READ ONLY … ROLLBACK` en un Postgres 16 local, con un esquema mínimo que usa ENUMs para los estatus (el peor caso de drift) y datos sintéticos estilo `mateos-809.sql`. Ninguna falló; una escritura habría abortado la transacción de solo lectura. Con D203 en `payment_day = 15` y factura desde 2025-02, Q4 reproduce los 594 días; con D302 desde 2024-03, reproduce 700/670/639/608. La migración y el script de la Fase B (§6) se probaron igual: el `ROLLBACK` final no deja cambios y las guardas abortan si el plan no cuadra.
- Si Q0 muestra que falta alguna columna (`billing_start_date`, `archived_at`, `late_fee_amount`, `ancillary_charge_id`, `amount_paid`, `stripe_payment_intent_id`), detente y avisa: las demás consultas la usan.

---

### Q0 · Preflight de esquema

**Qué responde:** ¿qué tipo tienen las columnas de estatus (ENUM o TEXT)? ¿Qué valores admiten? ¿Existen todas las columnas que usan las consultas siguientes? ¿Hay CHECK sobre `payments.status`? (Define si la Fase B necesita migración para `'void'`.)

```sql
-- Q0.a · Columnas usadas por este paquete
SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('payments','status'), ('payments','amount_paid'), ('payments','late_fee_amount'),
    ('payments','ancillary_charge_id'), ('payments','stripe_payment_intent_id'),
    ('payments','confirmed_at'), ('payments','rent_amount'), ('payments','water_fee'),
    ('contracts','status'), ('contracts','billing_start_date'), ('contracts','archived_at'),
    ('contracts','rent_type'), ('contracts','payment_day'),
    ('units','status'), ('units','archived_at'), ('units','building_id'),
    ('service_rates','effective_from'), ('invoices','payment_id'),
    ('payment_receipts','payment_id'), ('payment_ledger','payment_id')
  )
ORDER BY table_name, column_name;
```

```sql
-- Q0.b · Etiquetas de los ENUM de estatus (vacío = la columna es TEXT)
SELECT t.typname, e.enumsortorder, e.enumlabel
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('payment_status', 'contract_status', 'unit_status')
ORDER BY t.typname, e.enumsortorder;
```

```sql
-- Q0.c · CHECK constraints sobre payments / contracts / units
SELECT conrelid::regclass AS tabla, conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid IN ('public.payments'::regclass, 'public.contracts'::regclass, 'public.units'::regclass)
  AND contype = 'c'
ORDER BY 1, 2;
```

---

### Q1 · Inventario del 809

**Qué responde:** ¿cuántos edificios y unidades tiene la org, y cómo se reparten por `units.status`? (Debe dar 16 unidades en el 809 y 7 `occupied`.)

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id
)
SELECT b.id AS building_id,
       b.name AS edificio,
       count(u.id) AS unidades,
       count(u.id) FILTER (WHERE u.archived_at IS NOT NULL) AS archivadas,
       count(u.id) FILTER (WHERE u.status::text = 'occupied' AND u.archived_at IS NULL) AS ocupadas,
       count(u.id) FILTER (WHERE u.status::text = 'available' AND u.archived_at IS NULL) AS disponibles,
       count(u.id) FILTER (WHERE u.status::text NOT IN ('occupied','available') AND u.archived_at IS NULL) AS otras,
       string_agg(u.number || ':' || u.status::text, ', ' ORDER BY u.number) AS detalle
FROM buildings b
CROSS JOIN p
LEFT JOIN units u ON u.building_id = b.id
WHERE b.org_id = p.org_id
GROUP BY b.id, b.name
ORDER BY b.name;
```

---

### Q2 · Unidades con status «ocupado» sin contrato vigente

**Qué responde:** de las unidades marcadas `occupied`, ¿cuáles no tienen contrato vigente hoy y por qué (causas A-F de §2.3)? También dice si el Calendario las pinta hoy y si Mission Control les cobra.
*Vigente* = estatus `active`/`en_renovacion`/`pending`, no archivado, `start_date ≤ hoy` y (`end_date` nula o ≥ hoy).

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id,
         (now() AT TIME ZONE 'America/Mexico_City')::date AS today
),
c AS (
  SELECT c.*,
         (c.status::text IN ('active','en_renovacion','pending')
           AND c.archived_at IS NULL
           AND c.start_date <= p.today
           AND (c.end_date IS NULL OR c.end_date >= p.today)) AS vigente,
         (c.status::text IN ('active','pending','renewed','en_renovacion','expired')
           AND c.archived_at IS NULL
           AND c.start_date <= p.today
           AND (c.end_date IS NULL OR c.end_date >= p.today)) AS calendario_pinta_hoy,
         (c.status::text IN ('active','en_renovacion')) AS mission_control_cobra
  FROM contracts c
  CROSS JOIN p
  WHERE c.org_id = p.org_id
)
SELECT u.number AS unidad,
       u.status::text AS unit_status,
       count(c.id) AS contratos_total,
       count(c.id) FILTER (WHERE c.vigente) AS contratos_vigentes,
       bool_or(COALESCE(c.calendario_pinta_hoy, false)) AS calendario_pinta_hoy,
       bool_or(COALESCE(c.mission_control_cobra, false)) AS mission_control_cobra,
       CASE
         WHEN count(c.id) = 0 THEN 'A. sin ningún contrato'
         WHEN bool_or(c.vigente) THEN 'OK: tiene contrato vigente'
         WHEN bool_and(c.archived_at IS NOT NULL) THEN 'B. solo contratos archivados'
         WHEN bool_or(c.status::text IN ('active','en_renovacion') AND c.end_date < p.today)
           THEN 'C. contrato active/en_renovacion con end_date vencida'
         WHEN bool_or(c.start_date > p.today) THEN 'F. solo contrato futuro'
         ELSE 'D. solo contratos terminados/expirados/renovados/cancelados'
       END AS diagnostico,
       string_agg(
         c.status::text || ' ' || c.start_date || '→' || COALESCE(c.end_date::text, '∞')
           || CASE WHEN c.billing_start_date IS NOT NULL THEN ' (factura desde ' || c.billing_start_date || ')' ELSE '' END
           || CASE WHEN c.archived_at IS NOT NULL THEN ' [ARCHIVADO]' ELSE '' END,
         ' | ' ORDER BY c.start_date) AS contratos
FROM units u
CROSS JOIN p
LEFT JOIN c ON c.unit_id = u.id
WHERE u.org_id = p.org_id
  AND u.status::text = 'occupied'
  AND u.archived_at IS NULL
GROUP BY u.id, u.number, u.status, p.today
ORDER BY (bool_or(COALESCE(c.vigente, false))), u.number;
```

> La causa **E** (contrato que apunta a otra unidad o a ninguna) no aparece aquí porque el JOIN es por `unit_id`. Esos casos salen en Q3, columna `problema_unidad`.

---

### Q3 · Todos los contratos con status y fechas

**Qué responde:** inventario completo de contratos de la org, con las banderas que explican cada pantalla: ¿lo cuenta Mission Control? ¿le genera renta el cron? ¿lo pinta el Calendario hoy? ¿`end_date` vencida? ¿problema de unidad? ¿Desde qué mes y cuántos meses proyecta Mission Control?

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id,
         (now() AT TIME ZONE 'America/Mexico_City')::date AS today
)
SELECT u.number AS unidad,
       u.status::text AS unit_status,
       c.id AS contract_id,
       o.name AS inquilino,
       c.status::text AS contract_status,
       c.rent_type,
       c.start_date,
       c.billing_start_date,
       c.end_date,
       c.payment_day,
       c.monthly_amount,
       c.archived_at,
       c.created_at,
       (c.status::text IN ('active','en_renovacion')) AS mission_control_lo_cuenta,
       (c.status::text IN ('active','en_renovacion') AND c.rent_type <> 'STR') AS cron_le_genera_renta,
       (c.status::text IN ('active','pending','renewed','en_renovacion','expired')
         AND c.archived_at IS NULL AND c.unit_id IS NOT NULL
         AND c.start_date <= p.today
         AND (c.end_date IS NULL OR c.end_date >= p.today)) AS calendario_lo_pinta_hoy,
       (c.end_date IS NOT NULL AND c.end_date < p.today) AS end_date_vencida,
       CASE
         WHEN c.unit_id IS NULL THEN 'sin unidad'
         WHEN u.id IS NULL THEN 'unidad inexistente'
         WHEN u.org_id <> c.org_id THEN 'unidad de otra org'
         WHEN u.archived_at IS NOT NULL THEN 'unidad archivada'
       END AS problema_unidad,
       CASE WHEN c.status::text IN ('active','en_renovacion') THEN to_char(w.ini, 'YYYY-MM') END AS mc_primer_mes_proyectado,
       CASE WHEN c.status::text IN ('active','en_renovacion') THEN
         GREATEST(0, (extract(year FROM p.today)::int * 12 + extract(month FROM p.today)::int)
                   - (extract(year FROM w.ini)::int * 12 + extract(month FROM w.ini)::int) + 1)
       END AS mc_meses_proyectados
FROM contracts c
CROSS JOIN p
LEFT JOIN units u ON u.id = c.unit_id
LEFT JOIN occupants o ON o.id = c.occupant_id
CROSS JOIN LATERAL (
  SELECT GREATEST(
           date_trunc('month', COALESCE(c.billing_start_date, c.start_date, p.today)),
           date_trunc('month', p.today) - interval '23 months'
         )::date AS ini
) w
WHERE c.org_id = p.org_id
ORDER BY u.number NULLS FIRST, c.start_date;
```

---

### Q4 · Réplica exacta de la morosidad de Mission Control (agrupada por unidad, contrato y mes)

**Qué responde:** ¿qué meses cuenta Mission Control como vencidos, por cuánto, y cuántos de ellos **no tienen fila** en `payments` (proyección pura)? Devuelve el detalle contrato-mes, el subtotal por unidad y el total (con `today = '2026-10-02'` debe dar 57 / $374,900).

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id,
         (now() AT TIME ZONE 'America/Mexico_City')::date AS today
         -- Foto del reporte: '2026-10-02'::date AS today
),
-- page.tsx:119-124 · contratos active/en_renovacion (sin filtro de archived_at ni end_date)
c AS (
  SELECT c.id AS contract_id, c.unit_id, COALESCE(c.monthly_amount, 0) AS monthly_amount, c.payment_day,
         c.start_date, c.billing_start_date, c.end_date, c.status::text AS contract_status,
         c.archived_at AS contract_archived_at,
         u.number AS unit_number, u.building_id, u.status::text AS unit_status, o.name AS occupant_name
  FROM contracts c
  CROSS JOIN p
  LEFT JOIN units u ON u.id = c.unit_id
  LEFT JOIN occupants o ON o.id = c.occupant_id
  WHERE c.org_id = p.org_id
    AND c.status::text IN ('active', 'en_renovacion')
),
-- billing.ts:21-44 · scheduleMonths(billing_start_date ?? start_date, mes actual), últimos 24 meses
m AS (
  SELECT c.*, gs::date AS month_start
  FROM c
  CROSS JOIN p
  CROSS JOIN LATERAL generate_series(
    GREATEST(date_trunc('month', COALESCE(c.billing_start_date, c.start_date, p.today)),
             date_trunc('month', p.today) - interval '23 months'),
    date_trunc('month', p.today),
    interval '1 month') AS gs
),
-- page.tsx:150-171 · una fila representante por contrato+mes (paid > partial > resto); incluye accesorios
pay AS (
  SELECT DISTINCT ON (py.contract_id, date_trunc('month', py.due_date))
         py.contract_id, date_trunc('month', py.due_date)::date AS month_start,
         py.id AS payment_id, py.status::text AS payment_status, py.amount AS payment_amount,
         py.amount_paid, py.late_fee_amount, py.ancillary_charge_id
  FROM payments py
  WHERE py.contract_id IN (SELECT contract_id FROM c)
  ORDER BY py.contract_id, date_trunc('month', py.due_date),
           CASE py.status::text WHEN 'paid' THEN 3 WHEN 'partial' THEN 2 ELSE 1 END DESC,
           py.created_at
),
-- page.tsx:184 (vencimiento) + page.tsx:188 / cobros.ts:56-76 (agua, fallback 250)
x AS (
  SELECT m.*, pay.payment_id, pay.payment_status, pay.payment_amount, pay.amount_paid,
         pay.late_fee_amount, pay.ancillary_charge_id,
         (m.month_start + (COALESCE(NULLIF(m.payment_day, 0), 1) - 1))::date AS due_date,
         COALESCE((
           SELECT sr.amount FROM service_rates sr
           WHERE sr.org_id = (SELECT org_id FROM p) AND sr.service = 'agua'
             AND to_char(sr.effective_from::date, 'YYYY-MM') <= to_char(m.month_start, 'YYYY-MM')
             AND (sr.building_id = m.building_id OR sr.building_id IS NULL)
           ORDER BY (sr.building_id IS NOT DISTINCT FROM m.building_id) DESC, sr.effective_from DESC
           LIMIT 1), 250) AS water_fee
  FROM m
  LEFT JOIN pay ON pay.contract_id = m.contract_id AND pay.month_start = m.month_start
),
-- billing.ts:70-94 · computeMonthStatus
s AS (
  SELECT x.*,
         COALESCE(x.payment_amount, x.monthly_amount + x.water_fee) AS base,
         COALESCE(x.late_fee_amount, 0) AS fee,
         COALESCE(x.amount_paid, 0) AS paid
  FROM x
),
v AS (
  SELECT s.*,
         CASE
           WHEN s.payment_status IN ('paid', 'partial') THEN
             CASE WHEN GREATEST(0, s.base + s.fee - s.paid) > 0.001 THEN 'parcial' ELSE 'pagado' END
           WHEN COALESCE(s.payment_day, 0) = 0 THEN 'verbal'
           WHEN (SELECT today FROM p) < s.due_date THEN 'pendiente'
           WHEN s.fee > 0 THEN 'mora'
           ELSE 'vencido'
         END AS mc_status
  FROM s
),
-- page.tsx:197-199, 224-225 · solo mora/vencido/parcial suman a la morosidad
o AS (
  SELECT v.*,
         CASE v.mc_status
           WHEN 'parcial' THEN GREATEST(0, v.base + v.fee - v.paid)
           WHEN 'mora' THEN v.base + v.fee
           ELSE v.base
         END AS owed,
         (SELECT today FROM p) - v.due_date AS dias_atraso
  FROM v
  WHERE v.mc_status IN ('mora', 'vencido', 'parcial')
)
SELECT CASE WHEN GROUPING(o.unit_number) = 1 THEN '== TOTAL =='
            ELSE COALESCE(o.unit_number, '(sin unidad)') END AS unidad,
       CASE WHEN GROUPING(o.month_start) = 1 AND GROUPING(o.unit_number) = 0 THEN '-- subtotal unidad --'
            ELSE to_char(o.month_start, 'YYYY-MM') END AS mes,
       o.contract_id,
       count(*) AS pagos_vencidos,
       sum(o.owed) AS adeudo_mc,
       sum(o.fee) AS de_ello_mora_persistida,
       max(o.dias_atraso) AS max_dias_atraso,
       string_agg(DISTINCT o.mc_status, ',') AS estatus_mc,
       count(*) FILTER (WHERE o.payment_id IS NULL) AS meses_sin_fila_en_payments,
       CASE WHEN GROUPING(o.month_start) = 0 THEN max(o.payment_id::text) END AS payment_id,
       CASE WHEN GROUPING(o.month_start) = 0 THEN max(o.payment_status) END AS payment_status,
       bool_or(o.ancillary_charge_id IS NOT NULL) AS representante_es_accesorio,
       bool_or(o.end_date IS NOT NULL AND o.month_start > date_trunc('month', o.end_date)) AS mes_despues_de_end_date,
       bool_or(o.month_start < date_trunc('month', o.start_date)) AS mes_antes_de_start_date,
       bool_or(o.contract_archived_at IS NOT NULL) AS contrato_archivado
FROM o
GROUP BY GROUPING SETS ((o.unit_number, o.contract_id, o.month_start), (o.unit_number), ())
ORDER BY GROUPING(o.unit_number), o.unit_number, GROUPING(o.month_start) DESC, o.month_start;
```

> Si `meses_sin_fila_en_payments` ≈ `pagos_vencidos` en el total, la hipótesis principal queda confirmada: la morosidad es proyección, no filas.

---

### Q5 · Filas de `payments` vencidas, agrupadas por unidad, contrato y mes

**Qué responde:** la misma pregunta que Q4, pero desde la **tabla**: ¿qué filas reales están sin pagar y vencidas, de **cualquier** contrato (incluidos no activos y huérfanos, que Mission Control no ve pero el runner de cobranza sí, `src/lib/agents/cobranza.ts:152-160`)?

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id,
         (now() AT TIME ZONE 'America/Mexico_City')::date AS today
)
SELECT CASE WHEN GROUPING(u.number) = 1 THEN '== TOTAL ==' ELSE COALESCE(u.number, '(sin unidad)') END AS unidad,
       py.contract_id,
       c.status::text AS contract_status,
       CASE WHEN GROUPING(date_trunc('month', py.due_date)) = 1 AND GROUPING(u.number) = 0 THEN '-- subtotal unidad --'
            ELSE to_char(date_trunc('month', py.due_date), 'YYYY-MM') END AS mes,
       count(*) AS filas,
       string_agg(py.status::text, ',' ORDER BY py.created_at) AS estatus_filas,
       sum(py.amount) AS cargo,
       sum(COALESCE(py.late_fee_amount, 0)) AS mora,
       sum(COALESCE(py.amount_paid, 0)) AS pagado,
       sum(py.amount + COALESCE(py.late_fee_amount, 0) - COALESCE(py.amount_paid, 0)) AS saldo,
       max(p.today - py.due_date) AS max_dias_atraso,
       bool_or(py.ancillary_charge_id IS NOT NULL) AS incluye_accesorio,
       min(py.created_at) AS primera_creada
FROM payments py
CROSS JOIN p
LEFT JOIN contracts c ON c.id = py.contract_id
LEFT JOIN units u ON u.id = c.unit_id
WHERE py.org_id = p.org_id
  AND py.status::text NOT IN ('paid', 'void', 'waived')
  AND py.due_date <= p.today
GROUP BY GROUPING SETS ((u.number, py.contract_id, c.status, date_trunc('month', py.due_date)), (u.number), ())
ORDER BY GROUPING(u.number), u.number, GROUPING(date_trunc('month', py.due_date)) DESC, date_trunc('month', py.due_date);
```

---

### Q6 · Cargos antes de `start_date` o de `billing_start_date`, o después de `end_date`

**Qué responde:** ¿hay filas de `payments` fuera del rango facturable del contrato (comparando a nivel mes)? Son candidatas directas a «basura generada». Los meses **proyectados** fuera de rango salen en Q4 (`mes_despues_de_end_date`, `mes_antes_de_start_date`).

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id
)
SELECT u.number AS unidad,
       c.id AS contract_id,
       c.status::text AS contract_status,
       c.start_date, c.billing_start_date, c.end_date,
       py.id AS payment_id,
       py.due_date,
       py.status::text AS payment_status,
       py.amount, py.amount_paid, py.late_fee_amount,
       (py.ancillary_charge_id IS NOT NULL) AS es_accesorio,
       py.created_at,
       (date_trunc('month', py.due_date) < date_trunc('month', c.start_date)) AS antes_de_start,
       (c.billing_start_date IS NOT NULL
         AND date_trunc('month', py.due_date) < date_trunc('month', c.billing_start_date)) AS antes_de_billing_start,
       (c.end_date IS NOT NULL
         AND date_trunc('month', py.due_date) > date_trunc('month', c.end_date)) AS despues_de_end
FROM payments py
JOIN contracts c ON c.id = py.contract_id
CROSS JOIN p
LEFT JOIN units u ON u.id = c.unit_id
WHERE py.org_id = p.org_id
  AND (
        date_trunc('month', py.due_date) < date_trunc('month', c.start_date)
     OR (c.billing_start_date IS NOT NULL AND date_trunc('month', py.due_date) < date_trunc('month', c.billing_start_date))
     OR (c.end_date IS NOT NULL AND date_trunc('month', py.due_date) > date_trunc('month', c.end_date))
  )
ORDER BY u.number, py.due_date;
```

---

### Q7 · Cargos de contratos terminados, cancelados, expirados o renovados

**Qué responde:** ¿qué filas cuelgan de contratos que ya no están `active`/`en_renovacion`? Mission Control no las cuenta (`src/app/page.tsx:123`), pero el runner de cobranza sí les persiste mora y les mandaría WhatsApp (`src/lib/agents/cobranza.ts:152-160`). La columna `cobranza_la_toca` lo indica.

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id,
         (now() AT TIME ZONE 'America/Mexico_City')::date AS today
)
SELECT u.number AS unidad,
       c.id AS contract_id,
       c.status::text AS contract_status,
       c.start_date, c.end_date, c.archived_at,
       py.id AS payment_id,
       py.due_date,
       py.status::text AS payment_status,
       py.amount, py.amount_paid, py.late_fee_amount,
       (py.ancillary_charge_id IS NOT NULL) AS es_accesorio,
       py.created_at,
       (py.status::text <> 'paid' AND py.confirmed_at IS NULL) AS cobranza_la_toca,
       (py.due_date > c.end_date) AS vence_despues_de_end_date
FROM payments py
JOIN contracts c ON c.id = py.contract_id
CROSS JOIN p
LEFT JOIN units u ON u.id = c.unit_id
WHERE py.org_id = p.org_id
  AND c.status::text NOT IN ('active', 'en_renovacion')
ORDER BY (py.status::text = 'paid'), u.number, py.due_date;
```

---

### Q8 · Pagos vencidos sin contrato ligado

**Qué responde:** ¿hay filas vencidas y sin pagar cuyo `contract_id` es nulo, apunta a un contrato inexistente o de otra org, o a un contrato sin unidad o archivado? Mission Control no las ve; cobranza sí (`src/lib/agents/cobranza.ts:152-160`).

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id,
         (now() AT TIME ZONE 'America/Mexico_City')::date AS today
)
SELECT py.id AS payment_id,
       py.org_id,
       py.contract_id,
       py.due_date,
       py.status::text AS payment_status,
       py.amount, py.amount_paid, py.late_fee_amount,
       (py.ancillary_charge_id IS NOT NULL) AS es_accesorio,
       py.created_at,
       CASE
         WHEN py.contract_id IS NULL THEN 'contract_id NULL'
         WHEN c.id IS NULL THEN 'contrato inexistente'
         WHEN c.org_id IS DISTINCT FROM py.org_id THEN 'contrato de otra org'
         WHEN c.unit_id IS NULL THEN 'contrato sin unidad'
         WHEN u.id IS NULL THEN 'unidad inexistente'
         WHEN c.archived_at IS NOT NULL THEN 'contrato archivado'
       END AS problema
FROM payments py
CROSS JOIN p
LEFT JOIN contracts c ON c.id = py.contract_id
LEFT JOIN units u ON u.id = c.unit_id
WHERE (py.org_id = p.org_id OR py.org_id IS NULL)
  AND py.status::text NOT IN ('paid', 'void', 'waived')
  AND py.due_date <= p.today
  AND (py.contract_id IS NULL
       OR c.id IS NULL
       OR c.org_id IS DISTINCT FROM py.org_id
       OR c.unit_id IS NULL
       OR u.id IS NULL
       OR c.archived_at IS NOT NULL)
ORDER BY py.due_date;
```

---

### Q9 · Origen de las filas: ¿cron, captura retroactiva o import?

**Qué responde:** ¿cuándo se crearon las filas de `payments` respecto a su `due_date`? Patrones esperados:

- **Cron:** filas creadas el día 1 de cada mes (~06:00 UTC) con `due_date` en ese mismo mes (`vercel.json:3-6`, `src/app/api/cron/payments/route.ts:109`).
- **Captura retroactiva** (AbonoModal o pago rápido): `created_at` muy posterior a `due_date` (`src/components/cobros/AbonoModal.tsx:173-182`, `src/lib/cobros-actions.ts:64-68`).
- **Import/backfill:** muchas filas con el mismo `created_at` (al segundo) y `due_date` repartidos en muchos meses.

```sql
-- Q9.a · Filas por instante de creación (a nivel minuto)
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id
)
SELECT date_trunc('minute', py.created_at) AS creado,
       count(*) AS filas,
       count(DISTINCT py.contract_id) AS contratos,
       count(DISTINCT date_trunc('month', py.due_date)) AS meses_distintos,
       min(py.due_date) AS due_min,
       max(py.due_date) AS due_max,
       count(*) FILTER (WHERE py.due_date < py.created_at::date - 45) AS retroactivas_45d,
       count(*) FILTER (WHERE py.ancillary_charge_id IS NOT NULL) AS accesorios,
       string_agg(DISTINCT py.status::text, ',') AS estatus
FROM payments py
CROSS JOIN p
WHERE py.org_id = p.org_id
GROUP BY 1
ORDER BY 1;
```

```sql
-- Q9.b · Arranque operativo de BaW OS para la org (go-live) y volumen
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id
)
SELECT
  (SELECT min(created_at) FROM units     WHERE org_id = p.org_id) AS primera_unidad_creada,
  (SELECT min(created_at) FROM contracts WHERE org_id = p.org_id) AS primer_contrato_creado,
  (SELECT min(created_at) FROM payments  WHERE org_id = p.org_id) AS primer_pago_creado,
  (SELECT min(due_date)   FROM payments  WHERE org_id = p.org_id) AS due_date_mas_viejo,
  (SELECT count(*)        FROM payments  WHERE org_id = p.org_id) AS filas_payments,
  (SELECT count(*)        FROM payment_receipts WHERE org_id = p.org_id) AS abonos,
  (SELECT count(*)        FROM payment_ledger   WHERE org_id = p.org_id) AS asientos_bitacora
FROM p;
```

---

### Q10 · Evidencia de dinero e inconsistencias por fila

**Qué responde:** ¿qué filas tienen evidencia de pago que Mission Control no ve, o están mal registradas? Esto alimenta el bucket «pagado por fuera / registro incompleto».

- `DUPLICADO`: más de una fila de renta para el mismo contrato y mes; solo una cuenta (`src/app/page.tsx:166-171`).
- `PAID_SIN_MONTO`: `paid` con `amount_paid` menor que cargo + mora. Mission Control lo ve como `parcial` (`src/lib/billing.ts:77-79`). Lo produce `/api/ledger` (`src/app/api/ledger/route.ts:82-91`).
- `PAGO_FECHADO_HOY`: `paid` con `due_date = paid_date = fecha de creación`. Es el patrón de la API o los agentes (`src/app/api/payments/route.ts:47-48`, `src/lib/agents/v1/dispatcher.ts:142-143`); el pago puede corresponder a otro mes.
- `ABONOS_SIN_REFLEJAR`: hay abonos, bitácora, CFDI o Stripe ligados, pero la fila sigue sin `paid`/`partial` (recompute fallido).
- `BITACORA_SIN_CARGO`: asientos de `payment_ledger` sin `payment_id`, es decir, dinero registrado que no salda ningún mes.

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id
),
ev AS (
  SELECT py.id AS payment_id,
         (SELECT COALESCE(sum(r.amount), 0) FROM payment_receipts r WHERE r.payment_id = py.id) AS abonos,
         (SELECT count(*) FROM payment_ledger l WHERE l.payment_id = py.id) AS asientos,
         (SELECT count(*) FROM invoices i WHERE i.payment_id = py.id AND COALESCE(i.status, '') <> 'cancelled') AS cfdis
  FROM payments py
  CROSS JOIN p
  WHERE py.org_id = p.org_id
)
SELECT 'DUPLICADO' AS hallazgo, u.number AS unidad, py.contract_id, py.id AS payment_id,
       to_char(py.due_date, 'YYYY-MM') AS mes, py.status::text AS status, py.amount, py.amount_paid,
       'filas de renta en el mismo mes: ' || d.n AS detalle
FROM payments py
CROSS JOIN p
JOIN (
  SELECT contract_id, date_trunc('month', due_date) AS mes, count(*) AS n
  FROM payments
  WHERE org_id = (SELECT org_id FROM p) AND ancillary_charge_id IS NULL
  GROUP BY 1, 2 HAVING count(*) > 1
) d ON d.contract_id = py.contract_id AND d.mes = date_trunc('month', py.due_date)
LEFT JOIN contracts c ON c.id = py.contract_id
LEFT JOIN units u ON u.id = c.unit_id
WHERE py.org_id = p.org_id AND py.ancillary_charge_id IS NULL

UNION ALL
SELECT 'PAID_SIN_MONTO', u.number, py.contract_id, py.id, to_char(py.due_date, 'YYYY-MM'), py.status::text,
       py.amount, py.amount_paid,
       'faltante: ' || (py.amount + COALESCE(py.late_fee_amount, 0) - COALESCE(py.amount_paid, 0))
FROM payments py
CROSS JOIN p
LEFT JOIN contracts c ON c.id = py.contract_id
LEFT JOIN units u ON u.id = c.unit_id
WHERE py.org_id = p.org_id
  AND py.status::text = 'paid'
  AND py.amount + COALESCE(py.late_fee_amount, 0) - COALESCE(py.amount_paid, 0) > 0.001

UNION ALL
SELECT 'PAGO_FECHADO_HOY', u.number, py.contract_id, py.id, to_char(py.due_date, 'YYYY-MM'), py.status::text,
       py.amount, py.amount_paid,
       'due_date = paid_date = creado (' || py.due_date || '); notes: ' || COALESCE(py.notes, '')
FROM payments py
CROSS JOIN p
LEFT JOIN contracts c ON c.id = py.contract_id
LEFT JOIN units u ON u.id = c.unit_id
WHERE py.org_id = p.org_id
  AND py.status::text = 'paid'
  AND py.due_date = py.paid_date
  AND py.due_date = py.created_at::date

UNION ALL
SELECT 'ABONOS_SIN_REFLEJAR', u.number, py.contract_id, py.id, to_char(py.due_date, 'YYYY-MM'), py.status::text,
       py.amount, py.amount_paid,
       'abonos=' || ev.abonos || ' asientos=' || ev.asientos || ' cfdis=' || ev.cfdis
         || ' stripe=' || COALESCE(py.stripe_payment_intent_id, '-')
FROM payments py
CROSS JOIN p
JOIN ev ON ev.payment_id = py.id
LEFT JOIN contracts c ON c.id = py.contract_id
LEFT JOIN units u ON u.id = c.unit_id
WHERE py.org_id = p.org_id
  AND py.status::text NOT IN ('paid', 'partial')
  AND (ev.abonos > 0 OR ev.asientos > 0 OR ev.cfdis > 0 OR py.stripe_payment_intent_id IS NOT NULL)

UNION ALL
SELECT 'BITACORA_SIN_CARGO', u.number, l.contract_id, NULL, to_char(l.created_at, 'YYYY-MM'), NULL,
       l.total, NULL,
       'asiento ' || l.id || ' por ' || l.total || ' (' || COALESCE(l.notes, '') || ')'
FROM payment_ledger l
CROSS JOIN p
LEFT JOIN units u ON u.id = l.unit_id
WHERE l.org_id = p.org_id
  AND l.payment_id IS NULL

ORDER BY 1, 2, 5;
```

---

### Q11 · Clasificación propuesta de cada mes vencido (solo lectura)

**Qué responde:** para cada contrato-mes que Mission Control cuenta como vencido (misma lógica que Q4), ¿en qué bucket cae según la regla de §5? Devuelve el detalle, el subtotal por bucket y el total. **Es una propuesta: Fran valida fila por fila antes de cualquier Fase B.** Control: el `== TOTAL ==` de Q11 debe ser idéntico al de Q4 (mismos meses, mismo adeudo).

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id,
         (now() AT TIME ZONE 'America/Mexico_City')::date AS today
),
golive AS (
  SELECT date_trunc('month', min(created_at))::date AS mes_golive
  FROM payments WHERE org_id = (SELECT org_id FROM p)
),
c AS (
  SELECT c.id AS contract_id, c.unit_id, COALESCE(c.monthly_amount, 0) AS monthly_amount, c.payment_day,
         c.start_date, c.billing_start_date, c.end_date, c.status::text AS contract_status,
         c.archived_at AS contract_archived_at,
         u.number AS unit_number, u.building_id, u.status::text AS unit_status
  FROM contracts c
  CROSS JOIN p
  LEFT JOIN units u ON u.id = c.unit_id
  WHERE c.org_id = p.org_id
    AND c.status::text IN ('active', 'en_renovacion')
),
m AS (
  SELECT c.*, gs::date AS month_start
  FROM c
  CROSS JOIN p
  CROSS JOIN LATERAL generate_series(
    GREATEST(date_trunc('month', COALESCE(c.billing_start_date, c.start_date, p.today)),
             date_trunc('month', p.today) - interval '23 months'),
    date_trunc('month', p.today),
    interval '1 month') AS gs
),
pay AS (
  SELECT DISTINCT ON (py.contract_id, date_trunc('month', py.due_date))
         py.contract_id, date_trunc('month', py.due_date)::date AS month_start,
         py.id AS payment_id, py.status::text AS payment_status, py.amount AS payment_amount,
         py.amount_paid, py.late_fee_amount, py.ancillary_charge_id, py.stripe_payment_intent_id
  FROM payments py
  WHERE py.contract_id IN (SELECT contract_id FROM c)
  ORDER BY py.contract_id, date_trunc('month', py.due_date),
           CASE py.status::text WHEN 'paid' THEN 3 WHEN 'partial' THEN 2 ELSE 1 END DESC,
           py.created_at
),
-- Evidencia por contrato: pagos que no saldan su mes (sobrantes en un mismo mes o fuera del calendario)
-- y primer mes con pago registrado en BaW OS.
ctr AS (
  SELECT c.contract_id,
         count(py.id) FILTER (WHERE py.status::text IN ('paid','partial') AND py.ancillary_charge_id IS NULL)
           - count(DISTINCT date_trunc('month', py.due_date)) FILTER (WHERE py.status::text IN ('paid','partial') AND py.ancillary_charge_id IS NULL)
           AS pagos_sobrantes,
         count(py.id) FILTER (WHERE py.status::text IN ('paid','partial') AND py.ancillary_charge_id IS NULL
                                AND date_trunc('month', py.due_date) < date_trunc('month', COALESCE(c.billing_start_date, c.start_date)))
           AS pagos_fuera_de_calendario,
         min(date_trunc('month', py.due_date)) FILTER (WHERE py.status::text IN ('paid','partial'))::date AS primer_mes_pagado
  FROM c
  LEFT JOIN payments py ON py.contract_id = c.contract_id
  GROUP BY c.contract_id
),
x AS (
  SELECT m.*, pay.payment_id, pay.payment_status, pay.payment_amount, pay.amount_paid,
         pay.late_fee_amount, pay.ancillary_charge_id, pay.stripe_payment_intent_id,
         (m.month_start + (COALESCE(NULLIF(m.payment_day, 0), 1) - 1))::date AS due_date,
         COALESCE((
           SELECT sr.amount FROM service_rates sr
           WHERE sr.org_id = (SELECT org_id FROM p) AND sr.service = 'agua'
             AND to_char(sr.effective_from::date, 'YYYY-MM') <= to_char(m.month_start, 'YYYY-MM')
             AND (sr.building_id = m.building_id OR sr.building_id IS NULL)
           ORDER BY (sr.building_id IS NOT DISTINCT FROM m.building_id) DESC, sr.effective_from DESC
           LIMIT 1), 250) AS water_fee
  FROM m
  LEFT JOIN pay ON pay.contract_id = m.contract_id AND pay.month_start = m.month_start
),
s AS (
  SELECT x.*,
         COALESCE(x.payment_amount, x.monthly_amount + x.water_fee) AS base,
         COALESCE(x.late_fee_amount, 0) AS fee,
         COALESCE(x.amount_paid, 0) AS paid
  FROM x
),
v AS (
  SELECT s.*,
         CASE
           WHEN s.payment_status IN ('paid', 'partial') THEN
             CASE WHEN GREATEST(0, s.base + s.fee - s.paid) > 0.001 THEN 'parcial' ELSE 'pagado' END
           WHEN COALESCE(s.payment_day, 0) = 0 THEN 'verbal'
           WHEN (SELECT today FROM p) < s.due_date THEN 'pendiente'
           WHEN s.fee > 0 THEN 'mora'
           ELSE 'vencido'
         END AS mc_status
  FROM s
),
o AS (
  SELECT v.*,
         CASE v.mc_status
           WHEN 'parcial' THEN GREATEST(0, v.base + v.fee - v.paid)
           WHEN 'mora' THEN v.base + v.fee
           ELSE v.base
         END AS owed,
         ctr.pagos_sobrantes, ctr.pagos_fuera_de_calendario, ctr.primer_mes_pagado,
         (SELECT COALESCE(sum(r.amount), 0) FROM payment_receipts r WHERE r.payment_id = v.payment_id) AS abonos,
         (SELECT count(*) FROM payment_ledger l WHERE l.payment_id = v.payment_id) AS asientos,
         (SELECT count(*) FROM invoices i WHERE i.payment_id = v.payment_id AND COALESCE(i.status, '') <> 'cancelled') AS cfdis,
         EXISTS (
           SELECT 1 FROM contracts c2
           WHERE c2.unit_id = v.unit_id AND c2.id <> v.contract_id
             AND c2.status::text IN ('active','en_renovacion','pending','renewed','expired')
             AND c2.archived_at IS NULL
             AND date_trunc('month', c2.start_date) <= v.month_start
             AND (c2.end_date IS NULL OR date_trunc('month', c2.end_date) >= v.month_start)
         ) AS otro_contrato_misma_unidad
  FROM v
  JOIN ctr ON ctr.contract_id = v.contract_id
  WHERE v.mc_status IN ('mora', 'vencido', 'parcial')
),
k AS (
  SELECT o.*,
         CASE
           -- BASURA GENERADA: el mes no debería existir para este contrato
           WHEN o.contract_archived_at IS NOT NULL
             THEN 'B1 BASURA · contrato archivado'
           WHEN o.month_start < date_trunc('month', o.start_date)
             THEN 'B2 BASURA · mes antes de start_date'
           WHEN o.end_date IS NOT NULL AND o.month_start > date_trunc('month', o.end_date) AND o.contract_status = 'active'
             THEN 'B3 BASURA? · mes después de end_date con contrato active (¿el inquilino se fue?)'
           WHEN o.otro_contrato_misma_unidad
             THEN 'B4 REVISAR · dos contratos facturan la misma unidad-mes'
           WHEN o.ancillary_charge_id IS NOT NULL
             THEN 'B5 REVISAR · la fila del mes es un accesorio (cálculo mezclado)'
           -- PAGADO, REGISTRO INCOMPLETO: hay rastro de dinero en BaW OS
           WHEN o.payment_status = 'paid'
             THEN 'P1 PAGADO · fila paid sin amount_paid completo'
           WHEN o.abonos > 0 OR o.asientos > 0 OR o.cfdis > 0 OR o.stripe_payment_intent_id IS NOT NULL
             THEN 'P2 PAGADO · abonos/bitácora/CFDI/Stripe sin reflejar'
           -- PAGADO POR FUERA SIN REGISTRAR (probable)
           WHEN o.pagos_sobrantes > 0 OR o.pagos_fuera_de_calendario > 0
             THEN 'P3 PAGADO POR FUERA? · el contrato tiene pagos que no saldan su mes'
           WHEN o.primer_mes_pagado IS NOT NULL AND o.month_start < o.primer_mes_pagado
             THEN 'P4 PAGADO POR FUERA? · histórico anterior al primer pago registrado del contrato'
           WHEN o.month_start < (SELECT mes_golive FROM golive)
             THEN 'P5 FRAN DECIDE · mes anterior al arranque de BaW OS en la org'
           -- DEUDA REAL (probable)
           WHEN o.end_date IS NOT NULL AND o.month_start > date_trunc('month', o.end_date)
             THEN 'R2 DEUDA REAL? · en_renovacion tras end_date (confirmar que sigue el inquilino)'
           WHEN o.unit_status IS DISTINCT FROM 'occupied'
             THEN 'R3 DEUDA REAL? · la unidad no está marcada ocupada'
           ELSE 'R1 DEUDA REAL · en rango, sin evidencia de pago'
         END AS clasificacion
  FROM o
)
SELECT CASE WHEN GROUPING(k.clasificacion) = 1 THEN '== TOTAL ==' ELSE k.clasificacion END AS clasificacion,
       CASE WHEN GROUPING(k.unit_number) = 1 THEN NULL ELSE COALESCE(k.unit_number, '(sin unidad)') END AS unidad,
       CASE WHEN GROUPING(k.month_start) = 1 THEN NULL ELSE to_char(k.month_start, 'YYYY-MM') END AS mes,
       CASE WHEN GROUPING(k.month_start) = 0 THEN max(k.contract_id::text) END AS contract_id,
       CASE WHEN GROUPING(k.month_start) = 0 THEN max(k.payment_id::text) END AS payment_id,
       count(*) AS meses,
       sum(k.owed) AS adeudo_mc,
       max((SELECT today FROM p) - k.due_date) AS max_dias_atraso
FROM k
GROUP BY GROUPING SETS ((k.clasificacion, k.unit_number, k.month_start), (k.clasificacion), ())
ORDER BY GROUPING(k.clasificacion), k.clasificacion, GROUPING(k.unit_number) DESC, k.unit_number, k.month_start;
```

---

## 5 · Regla de clasificación (propuesta, sin ejecutar)

Cada **contrato-mes** que Mission Control cuenta como vencido cae en **un** bucket. Se evalúa en orden y gana la primera regla que aplica, igual que el `CASE` de Q11. Las reglas con «?» son **candidatas**: requieren confirmación de Fran antes de cualquier corrección.

### Basura generada (no debe existir como cargo)

| Regla | Condición | Por qué | Corrección en Fase B |
|---|---|---|---|
| B1 | Contrato archivado | El Calendario lo oculta, pero Mission Control lo cobra (`src/app/page.tsx:119-124` vs `src/app/calendario/page.tsx:225`) | Contrato → `terminated` vía UI; filas → `void` |
| B2 | Mes antes de `start_date` (pasa si `billing_start_date < start_date`) | Antes del contrato no hay renta | Corregir `billing_start_date`; filas → `void` |
| B3? | Mes posterior a `end_date` con estatus `active` | El runner de renovaciones debió pasarlo a `en_renovacion` si el inquilino seguía (`src/lib/agents/renovaciones.ts:42-50`, `:93-97`); que siga `active` sugiere un dato viejo | Si Fran confirma salida: contrato → `terminated`/`expired`, unidad → `available`, filas → `void`. Si sigue: va a R2 |
| B4 | Dos contratos facturan la misma unidad en el mismo mes | Una unidad tiene un solo inquilino por mes; uno de los dos contratos sobra | Fran elige cuál es real; el otro → `terminated`, sus filas → `void` |
| B5 | La fila representante del mes es un cargo accesorio | Error de cálculo: mezcla accesorio con renta (`src/app/page.tsx:168`) | No es dato: arreglarlo en código (Fase B, prerequisito) |
| — | Filas fuera de rango (Q6), de contratos no activos (Q7) o huérfanas (Q8) | No las ve Mission Control, pero sí cobranza (`src/lib/agents/cobranza.ts:152-160`) | → `void` |

### Pagado por fuera sin registrar (o con registro incompleto)

| Regla | Condición | Por qué | Corrección en Fase B |
|---|---|---|---|
| P1 | Fila `paid` con `amount_paid` incompleto | `/api/ledger` marca `paid` sin monto (`src/app/api/ledger/route.ts:82-91`) | Recompute o abono por la diferencia vía UI; **no** `void` |
| P2 | Hay abonos, bitácora, CFDI o Stripe ligados y la fila no está `paid`/`partial` | Recompute fallido (`src/lib/cobros-actions.ts:86`) | `POST /api/payments/[id]/recompute` desde la UI |
| P3? | El contrato tiene pagos que no saldan su mes (dos en un mes, o `due_date = hoy` vía API) | El dinero entró, pero en el mes equivocado (`src/app/api/payments/route.ts:47-48`) | Reasignar el pago al mes correcto (UI: quitar el pago directo y registrar el abono en el mes que corresponde) |
| P4? | Mes anterior al primer pago registrado del contrato, con pagos posteriores | Patrón de «histórico previo a BaW OS» | Si Fran lo confirma: `billing_start_date` = primer mes que BaW OS administra (UI de contratos, `src/app/contracts/page.tsx:101-115`) |
| P5 | Mes anterior al arranque de BaW OS en la org (Q9.b) | No hay sistema de registro previo; el adeudo no está verificado (`supabase/migrations/20260628_contracts_billing_start.sql:1-6`) | **Fran decide** con estados de cuenta o la bitácora en Notion: si se pagó, `billing_start_date`; si se debe, pasa a deuda real |

### Deuda real

| Regla | Condición | Acción |
|---|---|---|
| R1 | En rango del contrato, contrato vigente, sin evidencia de pago, mes ≥ arranque de BaW OS | Se queda. Es la cifra que debe mostrar Mission Control |
| R2? | Contrato `en_renovacion` con mes posterior a `end_date` | Diseño vigente: se sigue facturando (`src/lib/agents/renovaciones.ts:93`). Es deuda real **solo si** el inquilino sigue en la unidad |
| R3? | Contrato vigente, pero la unidad no está marcada `occupied` | `units.status` es manual (§2.1); hay que confirmar ocupación |

**Criterio de cierre:** los buckets `?` y `FRAN DECIDE` deben quedar en cero (resueltos fila por fila por Fran) antes de correr cualquier paso de la Fase B.

---

## 6 · Esqueleto de la corrección (Fase B) · NO EJECUTAR

> Requiere OK explícito de Fran. Toca datos de prod y, si hace falta `void`, el esquema (`CLAUDE.md` §1.4). Nunca `DELETE`. Todo cambio debe ser reversible y auditable.

### 6.0 Prerequisitos de código (PR aparte, antes de tocar datos)

Hoy `void` **no se reconoce** en el código: `computeMonthStatus` trataría una fila `void` como `vencido` (`src/lib/billing.ts:74`, `:90-93`), y el runner de cobranza le persistiría mora e intentaría cobrarla (`src/lib/agents/cobranza.ts:104-106`, `:158-159`). Marcar `void` sin este PR **no baja** la morosidad (y sube el conteo si la fila existe). Cambios mínimos:

1. `src/lib/billing.ts`: `rankPayment('void') = 0` (una fila viva siempre gana) y `computeMonthStatus` con fila `void` (o `waived`) → estatus `anulado`, `owed = 0`, excluido del conteo.
2. `src/lib/agents/cobranza.ts:104-106` y `:158-159`: excluir `void` y `waived` además de `paid`.
3. `src/app/api/cron/payments/route.ts:51-62`: **mantener** que una fila `void` cuente como «ya generada» (no regenerar el mes anulado). Hoy ya es así; agregar un test.
4. Decidir con Fran si `scheduleMonths` debe respetar `end_date` en contratos `active` (§3.3). Para `en_renovacion` el diseño actual es seguir facturando.
5. Tests en `tests/cobros/` para los cuatro puntos.

### 6.1 Migración (solo si Q0 lo exige) · número reservado `20261015010000`

Archivo propuesto: `supabase/migrations/20261015010000_baw18_payments_void.sql`. **No se crea en este PR.**

```sql
-- BaW OS — BAW-18 Fase B: estatus 'void' para cargos anulados (sin DELETE).
-- Aditiva e idempotente. Mismo patrón defensivo que 20260615_contract_status_en_renovacion.sql.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'void';
  END IF;
END $$;
-- Si Q0.c mostró un CHECK sobre payments.status que no admite 'void', recrearlo aquí incluyéndolo.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text;

COMMENT ON COLUMN public.payments.void_reason IS
  'BAW-18: motivo de anulación (regla B1-B5 / Q6-Q8). Un cargo void no se cobra ni cuenta en morosidad.';
-- Rollback: ALTER TABLE public.payments DROP COLUMN voided_at, DROP COLUMN void_reason;
-- (los valores de un ENUM no se pueden quitar; 'void' sin uso es inocuo)
```

> Nota: un valor nuevo de ENUM no se puede usar en la misma transacción que lo agrega. La migración se aplica sola y el script de datos (6.3) corre después.

### 6.2 Correcciones que NO son SQL (se hacen en la UI, con su bitácora)

- **Contratos** (B1, B3, B4, P4, P5): `billing_start_date`, `end_date` y `status` desde la edición de contratos (`src/app/contracts/page.tsx:101-115`). Esto elimina meses **proyectados** que no tienen fila: no hay nada que anular, el remedio es la fecha.
- **Unidades:** `status` desde Unidades (`src/app/units/page.tsx:174-177`) para que coincida con Q2.
- **Pagos por fuera con evidencia** (P1-P3): registrarlos con el modal de abonos o el pago rápido, que crean el abono, el asiento de bitácora y hacen recompute (`src/lib/cobros-actions.ts:44-100`).

### 6.3 Script de datos: preflight → dry-run → commit

```sql
-- =====================================================================
-- BAW-18 Fase B · anular cargos basura · ESQUELETO, NO EJECUTAR SIN OK
-- Paso 1: correr TAL CUAL (termina en ROLLBACK = dry-run).
-- Paso 2: solo con OK de Fran, cambiar el ROLLBACK final por COMMIT.
-- =====================================================================

-- PREFLIGHT (solo lectura): debe devolver 'void' entre las etiquetas o el CHECK lo admite.
SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'payment_status' AND e.enumlabel = 'void';

BEGIN;

-- 1) Plan aprobado por Fran: un renglón por cargo a anular (ids salidos de Q6/Q7/Q8/Q11).
CREATE TEMP TABLE baw18_plan (
  payment_id       uuid PRIMARY KEY,
  regla            text NOT NULL,   -- 'B1'…'B5' | 'Q6' | 'Q7' | 'Q8'
  esperado_status  text NOT NULL,   -- estatus actual esperado (guarda contra carreras)
  esperado_amount  numeric NOT NULL
) ON COMMIT DROP;

INSERT INTO baw18_plan (payment_id, regla, esperado_status, esperado_amount) VALUES
  -- ('00000000-0000-0000-0000-000000000000', 'B1', 'pending', 5000.00),
  (NULL, NULL, NULL, NULL);  -- ← placeholder: falla a propósito hasta que Fran llene el plan

-- 2) Guardas: abortar si algo del plan no cuadra.
DO $$
DECLARE n_plan int; n_ok int;
BEGIN
  SELECT count(*) INTO n_plan FROM baw18_plan;
  SELECT count(*) INTO n_ok
  FROM baw18_plan pl
  JOIN payments py ON py.id = pl.payment_id
  WHERE py.org_id = '81a011c4-4ea6-4b79-924d-73dbe6d35e14'
    AND py.status::text = pl.esperado_status
    AND py.amount = pl.esperado_amount
    AND py.status::text NOT IN ('paid', 'partial', 'void')
    AND COALESCE(py.amount_paid, 0) = 0
    AND py.stripe_payment_intent_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM payment_receipts r WHERE r.payment_id = py.id)
    AND NOT EXISTS (SELECT 1 FROM payment_ledger   l WHERE l.payment_id = py.id)
    AND NOT EXISTS (SELECT 1 FROM invoices         i WHERE i.payment_id = py.id AND COALESCE(i.status,'') <> 'cancelled');
  IF n_ok <> n_plan THEN
    RAISE EXCEPTION 'BAW-18: % de % cargos pasan las guardas; abortando', n_ok, n_plan;
  END IF;
END $$;

-- 3) Respaldo dentro de la misma transacción (se queda solo si se hace COMMIT).
CREATE TABLE IF NOT EXISTS public.baw18_payments_before_void AS
  SELECT now() AS snapshot_at, py.* FROM payments py WHERE false;
INSERT INTO public.baw18_payments_before_void
  SELECT now(), py.* FROM payments py JOIN baw18_plan pl ON pl.payment_id = py.id;

-- 4) Anular (nunca DELETE).
UPDATE payments py
SET status      = 'void',
    voided_at   = now(),
    void_reason = 'BAW-18 ' || pl.regla,
    updated_at  = now()
FROM baw18_plan pl
WHERE py.id = pl.payment_id
  AND py.status::text = pl.esperado_status
RETURNING py.id, py.contract_id, py.due_date, py.amount, pl.regla;

-- 5) Bitácora de auditoría (append-only).
INSERT INTO audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14', 'human', 'fran@zxy.vc', 'payment.void',
       'payment', b.id, to_jsonb(b), jsonb_build_object('status', 'void'),
       jsonb_build_object('ticket', 'BAW-18', 'regla', pl.regla)
FROM public.baw18_payments_before_void b
JOIN baw18_plan pl ON pl.payment_id = b.id;

-- 6) Postcheck: volver a correr Q4 aquí dentro y comparar con el total esperado que aprobó Fran.

ROLLBACK;  -- ← DRY-RUN. Cambiar a COMMIT solo con OK explícito de Fran.
```

**Reversa (si hiciera falta):** `UPDATE payments py SET status = b.status, voided_at = NULL, void_reason = NULL FROM public.baw18_payments_before_void b WHERE py.id = b.id;` más un asiento `payment.unvoid` en `audit_log`.

---

## 7 · Orden sugerido para Fran

1. **Q0**: confirma tipos y columnas. Si falta alguna, para y avisa.
2. **Q4 con `today = '2026-10-02'`**: debe dar **57 / $374,900**. Si cuadra, la réplica es fiel. Revisa `meses_sin_fila_en_payments` en el total: si es casi 57, la hipótesis principal queda confirmada.
3. **Q3**: contratos con `start_date` viejas, `billing_start_date` nulas, `end_date` vencidas o archivados.
4. **Q2**: las 5 unidades «Ocupadas» sin contrato vigente y su causa (A-F).
5. **Q11**: clasificación propuesta. Fran resuelve los `?` y `FRAN DECIDE`.
6. **Q9**: descarta un import o backfill fuera del repo.
7. **Q5-Q8 y Q10**: filas que Mission Control no ve, pero que cobranza sí toca.

Con eso se arma el plan de la Fase B (§6), que va en otro PR y con OK explícito.
