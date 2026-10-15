# BAW-18 · Diagnóstico de datos del 809

> **Carril:** LD · **Entrega 1:** «Lo que BaW OS dice del 809 es verdad» · **Recorrido:** primer día del mes (cobrar) → «ver quién debe».
> **Clasificación:** AJUSTE (solo documento; el usuario no lo nota).
> **Alcance:** solo diagnóstico. Nada de este documento escribe en la base. Todo el SQL de §4 es de **solo lectura**. El SQL de §6 es un **esqueleto** de la Fase B que **no se ejecuta** sin el OK de Fran.
> **Org:** DuVa ReEs · `81a011c4-4ea6-4b79-924d-73dbe6d35e14`. Según el reporte del ticket (2-oct-2026) es la única org en prod; Q1 lo verifica.
> **Base del análisis:** `origin/main` @ `2d73e27` (2026-10-01).

**Convención:**

- Toda afirmación sobre el **código** lleva `archivo:línea` de `main`.
- Toda afirmación sobre **datos de prod** sale del reporte del ticket (2-oct-2026), y lo digo así, o es una **hipótesis**. Cada hipótesis trae la consulta que la confirma o la descarta. Este documento no consultó la base.

---

## 0 · Resumen ejecutivo

**Hipótesis principal:** la mayor parte de los «57 pagos vencidos / $374,900» que reporta el ticket **no son filas de `payments`**. Son meses que Mission Control **proyecta** a partir de las fechas del contrato:

1. Mission Control no suma filas. Recorre cada mes desde `billing_start_date ?? start_date` hasta el mes actual (`src/app/page.tsx:179-182`, `src/lib/billing.ts:21-44`). Para cada mes sin fila `paid`/`partial`, el resultado depende del contrato y de la fila del mes (`src/lib/billing.ts:71-93`):
   - si el contrato tiene `payment_day` y ya pasó el vencimiento, el mes cuenta como **`vencido`** por `payment.amount` o, si no hay fila, por renta del contrato + agua; o como **`mora`** si la fila trae recargo;
   - si no tiene `payment_day`, es `verbal`; si aún no vence, es `pendiente`. Ninguno de los dos suma.
2. La ventana es de 24 meses (`src/lib/billing.ts:11`, `src/lib/billing.ts:43`). Con corte en octubre de 2026, el mes más viejo posible es **2024-11**. Los atrasos de D302 que reporta el ticket (700, 670, 639 y 608 días al 2-oct-2026) corresponden **exactamente** a 2024-11-01, 2024-12-01, 2025-01-01 y 2025-02-01: los primeros cuatro meses de la ventana con `payment_day = 1` (`src/app/page.tsx:184`).
   - **Hipótesis:** el inicio de facturación de D302 (`billing_start_date`, o `start_date` si es nula) es 2024-11 o anterior, y la ventana corta el resto del histórico. Q3 lo confirma.
3. El cron mensual **no puede** haber creado cargos de 2024. Se agregó el 2026-04-02 (commit `a46987e`) y solo inserta el **mes en curso** (`src/app/api/cron/payments/route.ts:41-45`, `src/app/api/cron/payments/route.ts:109`). En el repo no hay ningún importador de pagos históricos (§1.3).
4. La columna `billing_start_date` existe precisamente para que contratos viejos de 2023/2024 no generen «2 años de adeudo no verificado» (`supabase/migrations/20260628_contracts_billing_start.sql:1-13`).
   - **Hipótesis:** los contratos del 809 se capturaron con su `start_date` real y sin `billing_start_date`. Si es así, cada mes previo a que BaW OS se usara para cobrar aparece como deuda. Esos meses caerían en **«pagado por fuera sin registrar»**, salvo que Fran confirme que sí se deben.
5. `units.status` («Ocupada») es un campo **manual**, independiente de `contracts` (§2.1). Además, Mission Control **ignora `end_date` y `archived_at`** del contrato, mientras que el Calendario sí los respeta (§2.3). Por eso las tres pantallas cuentan cosas distintas.

**Qué corre Fran primero:** Q0 (esquema) → Q4 con `today = '2026-10-02'` (§3.2 explica cómo leer el resultado) → Q3 (contratos) → Q2 (unidades ocupadas) → Q11 (clasificación propuesta). Detalle en §7.

---

## 1 · Cómo nacen y cambian las filas de `payments`

### 1.1 Escritores de `payments` en `main`

**INSERT (crean filas)**

| # | Escritor | Qué hace | Cita |
|---|---|---|---|
| 1 | **Cron mensual** `GET /api/cron/payments` (Vercel Cron `0 6 1 * *`) | INSERT de la renta del **mes en curso** + cargos accesorios del mes | `vercel.json:3-6`, `src/app/api/cron/payments/route.ts:143-146` |
| 2 | Modal «Registrar pago» (`AbonoModal`) | INSERT del cargo del mes abierto (`due_date = target.dueDate`, `status='pending'`) si no existe | `src/components/cobros/AbonoModal.tsx:153-187` |
| 2b | (mismo modal) | Después: INSERT del abono en `payment_receipts` y recompute del cargo | `src/components/cobros/AbonoModal.tsx:201-218` |
| 3 | Pago rápido (`quickPayMonth`) | INSERT del cargo del mes proyectado si no existe, + abono «Histórico (pago rápido)» con `paid_date = dueDate` | `src/lib/cobros-actions.ts:44-68`, `src/lib/cobros-actions.ts:73-84` |
| 4 | API Tier 2 `POST /api/payments` | INSERT `status='paid'` con `due_date = paid_date = hoy` | `src/app/api/payments/route.ts:40-53` |
| 5 | API de agentes `POST /api/v1/payments` | INSERT `status='paid'`, `due_date = body.due_date ?? hoy` | `src/app/api/v1/payments/route.ts:85-98` |
| 6 | Aprobación de agente (`payment.record`) | Igual que #5 | `src/lib/agents/v1/dispatcher.ts:135-148` |
| 7 | Seed histórico `mateos-809.sql` (**no** es migración) | 3 filas de abril 2026 (D202 `paid`, D302 `late`, D402 `late`) | `supabase/seed-examples/mateos-809.sql:62-87`, `supabase/seed-examples/mateos-809.sql:145-149` |

**UPDATE (cambian lo que lee Mission Control)**

| # | Escritor | Qué hace | Cita |
|---|---|---|---|
| 8 | `PATCH /api/payments/[id]` (API key) | Puede cambiar `status`, `amount`, `amount_paid`, `late_fee_amount` y **`due_date`**; esto último mueve el cargo a otro mes | `src/app/api/payments/[id]/route.ts:7-11`, `src/app/api/payments/[id]/route.ts:26-32` |
| 9 | «Quitar pago directo» (cuenta del inquilino) | Regresa la fila a `pending`, `amount_paid = 0` y limpia los datos del pago | `src/app/cobros/[contractId]/page.tsx:355-374` |
| 10 | Borrar abono | DELETE del abono + recompute; **la bitácora conserva su asiento** | `src/app/cobros/[contractId]/page.tsx:338-346` |
| 11 | `POST /api/payments/[id]/recompute` | Deriva `amount_paid`/`status` **solo** de la suma de `payment_receipts` | `src/app/api/payments/[id]/recompute/route.ts:28-59` |
| 12 | Webhook de Stripe / conserje | Marcan `paid` **con** `amount_paid` = total | `src/app/api/webhooks/stripe/route.ts:42-58`, `src/app/api/conserje/cobros/[id]/route.ts:44-58` |
| 13 | `POST /api/ledger` | Marca `status='paid'` **sin tocar** `amount_paid`: conserva el valor previo, típicamente 0/null. Mission Control la lee como `parcial` por `cargo + mora − amount_paid` (§3.3) | `src/app/api/ledger/route.ts:82-91` |
| 14 | `POST /api/payments/checkout` | Guarda `stripe_payment_intent_id` al **crear** el intent, antes de que se cobre nada | `src/app/api/payments/checkout/route.ts:18-36` |
| 15 | Runner de cobranza (cron diario) | Selecciona filas de la org no `paid`, sin `confirmed_at` y con vencimiento ≤ hoy UTC + 5 días. A las **ya vencidas** les persiste `late_fee_amount`. Desde PR #162 (mergeado el 2026-08-13) lo hace también en dry-run | `src/lib/agents/cobranza.ts:144-161`, `src/lib/agents/cobranza.ts:87-106`, `src/lib/agents/cobranza.ts:188-190` |

### 1.2 Qué respeta y qué no respeta el cron

`src/app/api/cron/payments/route.ts`:

| Regla | ¿La respeta? | Cita |
|---|---|---|
| `status` del contrato | Sí: solo `active` y `en_renovacion` | `route.ts:66-69` |
| `rent_type` | Sí: excluye STR | `route.ts:70` |
| `billing_start_date` / `start_date` | **Sí, a nivel mes**, desde el 2026-07-02 (commit `ac4a588`): no genera si `billing_start_date ?? start_date` es posterior al mes en curso | `route.ts:90-96` |
| `end_date` | **No.** Ni siquiera la selecciona: un contrato `active`/`en_renovacion` con `end_date` vencida sigue generando renta | `route.ts:68` |
| `archived_at` del contrato | **No** lo filtra | `route.ts:66-70` |
| `org_id` | No filtra por org (corre para todas); cada fila hereda el `org_id` del contrato | `route.ts:66-70`, `route.ts:104` |
| Ocupación de la unidad (`units.status`) | No la consulta | `route.ts:66-70` |
| Estatus del contrato en **cargos accesorios** | **No.** Basta con `ancillary_charges.status='active'` y la vigencia del cargo | `route.ts:117-122` |
| Mes que genera | Solo el mes en curso (`now()` del servidor) | `route.ts:41-45`, `route.ts:109` |
| Idempotencia | Dedup **en memoria** por contrato + mes (renta) y por cargo accesorio + mes. No revisa el error del INSERT. El esquema documentado solo tiene la PK (`docs/schema.sql:117`): no hay restricción única por contrato/cargo + mes (`docs/schema.sql:116-131`). En prod lo verifica Q0.d | `route.ts:51-62`, `route.ts:145` |
| Día de vencimiento | `payment_day || 5` (Mission Control usa `|| 1`, `src/app/page.tsx:184`) | `route.ts:109` |

**Conclusión 1.2:** el cron puede generar basura de **meses recientes** (desde abril de 2026) en contratos con `end_date` vencida, archivados, o `active` aunque el inquilino ya se haya ido. **No puede** generar cargos de 2024 ni de principios de 2025.

### 1.3 ¿Hubo backfill o import?

- **No hay importador de pagos en el repo.** El único bulk import (`/onboarding/bulk`, commit `98292b1`) llama a `/api/onboarding` (`src/app/onboarding/bulk/page.tsx:141-149`). Ese endpoint solo crea:
  - la org (`src/app/api/onboarding/route.ts:94-101`);
  - el edificio (`src/app/api/onboarding/route.ts:130-142`);
  - las unidades, con `status: 'available'` (`src/app/api/onboarding/route.ts:150-161`);
  - el propietario (`src/app/api/onboarding/route.ts:178-182`).

  No crea contratos ni pagos.
- El único «backfill» de `payments` en migraciones es `UPDATE ... SET amount_paid = amount WHERE status='paid' AND amount_paid IS NULL` (`supabase/migrations/20260617_payments_amount_paid.sql:15-17`). No crea filas.
- El seed `mateos-809.sql` **no es ejecutable** después del Sprint 3, según su README (`supabase/seed-examples/README.md:12-19`), y solo crea 3 pagos (`mateos-809.sql:145-149`). Sus **contratos** sí muestran un patrón de captura (`mateos-809.sql:133-141`):
  - ocho de nueve tienen `start_date` reales de 2023-01 a 2025-09 (`mateos-809.sql:133-140`); D202 empieza en 2026-04 (`mateos-809.sql:141`);
  - todos tienen `payment_day = 1` y ninguno tiene `billing_start_date`.

  **Hipótesis:** si los contratos de prod se capturaron igual (por seed, a mano o por SQL fuera del repo), eso basta para producir los atrasos del ticket **sin que exista ninguna fila**.
- Una carga manual o por SQL fuera del repo **no se puede descartar desde el código**. Q9 la detecta: muchas filas con el mismo `created_at` y `due_date` repartidos, o filas con `created_at` muy posterior a su `due_date`.

### 1.4 Respuesta directa: ¿cómo nacieron «cargos de ~700 días»?

- **Hipótesis principal: no nacieron.** Mission Control los **proyecta** (§3). Para D302, 700/670/639/608 días = 2024-11-01…2025-02-01, que es justo el piso de la ventana de 24 meses (`src/lib/billing.ts:11`, `src/lib/billing.ts:43`). Q4 lo confirma o lo descarta con la columna `meses_sin_fila_en_payments`.
- D203 con 594 días = **2025-02-15**. El `dueDate` de Mission Control se arma con el mes + el `payment_day` del contrato (`src/app/page.tsx:184`).
  - **Hipótesis:** eso es consistente con `payment_day = 15` y un primer mes vencido en 2025-02. En el seed, D203 tiene `payment_day = 1` (`mateos-809.sql:134`), así que prod no sería igual al seed. Lo confirman Q3/Q4.
- Si Q4 muestra que esos meses **sí** tienen fila: Q9 dice cuándo se crearon (`created_at`) y Q6 si caen fuera del rango del contrato.

---

## 2 · «Ocupada» en Unidades vs barras del Calendario

### 2.1 De dónde sale «Ocupada»

- **Unidades no consulta `contracts`.** Lee `units` filtrando solo por org, edificio y `archived_at` (`src/app/units/page.tsx:97-108`). El conteo de «Ocupadas» es `u.status === 'occupied'` (`src/app/units/page.tsx:121-130`), y la opción del filtro «Ocupadas» usa el mismo valor (`src/app/units/page.tsx:340`).
- Mission Control usa el mismo campo para «Ocupación» y **también para el KPI «Contratos activos»** (`src/app/page.tsx:212-215`, `src/app/page.tsx:362`). Ese KPI no cuenta contratos: cuenta unidades con `status='occupied'`.
- Quién escribe `units.status`:
  - edición manual en Unidades (`src/app/units/page.tsx:174-177`; modal: `src/app/units/UnitModal.tsx:18`, `src/app/units/UnitModal.tsx:93`);
  - **solo** el alta de contrato desde la UI la pone en `occupied` (`src/app/contracts/new/page.tsx:94`);
  - el alta de unidad por API v1 (`src/app/api/v1/units/route.ts:76`, `src/app/api/v1/units/route.ts:93`) y por el dispatcher de agentes (`src/lib/agents/v1/dispatcher.ts:104-111`);
  - el onboarding, que la crea en `available` (`src/app/api/onboarding/route.ts:156`);
  - el seed histórico (`mateos-809.sql:104-119`).
- **Nada la regresa a `available`:**
  - editar el contrato a `terminated`/`expired` (`src/app/contracts/page.tsx:101-115`);
  - renovarlo (`src/app/contracts/page.tsx:166`);
  - el runner de renovaciones (`src/lib/agents/renovaciones.ts:93-97`).

  Y crear un contrato por API o por agente tampoco pone la unidad en `occupied` (`src/app/api/contracts/route.ts:48-52`, `src/lib/agents/v1/dispatcher.ts:202-214`).

### 2.2 De dónde salen las barras del Calendario

- `/calendario` carga los contratos de la org con **`archived_at IS NULL`** y **`unit_id NOT NULL`** (`src/app/calendario/page.tsx:221-226`). Las unidades también se filtran por `archived_at IS NULL` (`src/app/calendario/page.tsx:214-220`).
- `contractToStay` solo pinta los estatus `active`, `pending`, `renewed`, `en_renovacion` y `expired` (`src/lib/calendar-occupancy.ts:103-106`, `src/lib/calendar-occupancy.ts:150`).
- La barra va de `start_date` a `end_date + 1` (`src/lib/calendar-occupancy.ts:159-160`). Sin `end_date`, llena hasta el borde (`src/lib/calendar-occupancy.ts:310`).
- Una barra solo se ve si intersecta la ventana visible (`src/lib/calendar-occupancy.ts:311`). Por defecto la ventana es de 31 días desde hoy − 7 (`src/app/calendario/page.tsx:144-145`, `src/app/calendario/page.tsx:283`); en pantallas de menos de 640 px es de 14 días (`src/app/calendario/page.tsx:185-189`).

### 2.3 Por qué divergen (7 «ocupadas» vs 2 barras, según el ticket)

Una unidad puede estar «Ocupada» y no tener barra en la ventana de hoy por cualquiera de estas razones. Q2 dice cuál aplica a cada una.

| Causa | Unidades | Calendario | Mission Control |
|---|---|---|---|
| A. Sin ningún contrato | Ocupada (manual) | Sin barra | No proyecta |
| B. Contrato archivado | Ocupada | Sin barra (`src/app/calendario/page.tsx:225`) | **Sí proyecta**: no filtra `archived_at` (`src/app/page.tsx:119-124`) |
| C. Contrato `active`/`en_renovacion` con `end_date` anterior a la ventana visible (hoy − 7) | Ocupada | Barra fuera de la ventana (`src/lib/calendar-occupancy.ts:160`, `src/lib/calendar-occupancy.ts:311`) | **Sí proyecta hasta hoy**: `scheduleMonths` no recibe `end_date` (`src/app/page.tsx:179-182`) |
| D. Contrato `terminated`/`cancelled` | Ocupada (nadie la libera) | Sin barra (`src/lib/calendar-occupancy.ts:150`) | No proyecta (`src/app/page.tsx:123`) |
| E. Contrato con `unit_id` nulo o ligado a otra unidad | Ocupada | Sin barra en esa fila (`src/app/calendario/page.tsx:226`) | Proyecta si está `active`/`en_renovacion` |
| F. Contrato que empieza después de la ventana | Ocupada | Sin barra en la ventana | Proyecta solo si su mes de facturación ya llegó. Como `scheduleMonths` trabaja por mes, un contrato que arranca más tarde **este mismo mes** puede generar adeudo si su `payment_day` ya pasó (`src/lib/billing.ts:25-35`, `src/lib/billing.ts:84-93`) |

**Hipótesis:** D302 y D203 aparecen en la morosidad del ticket, así que tendrían contrato `active`/`en_renovacion` (`src/app/page.tsx:123`), pero no tienen barra. Lo más probable:

- **D203:** causa **C**. En el seed termina el 2025-12-31 y está `en_renovacion` (`mateos-809.sql:134`).
- **D302:** causa **B** o **E**. En el seed no tiene `end_date` (`mateos-809.sql:137`), así que, si fuera visible, tendría una barra abierta.

Lo confirman Q2 y Q3.

---

## 3 · Cómo calcula Mission Control la morosidad

### 3.1 Algoritmo (`src/app/page.tsx`)

1. **Contratos:** `contracts` de la org activa con `status IN ('active','en_renovacion')`, **sin** filtro de `archived_at` ni de `end_date` (`src/app/page.tsx:106-108`, `src/app/page.tsx:119-124`). Si hay un edificio seleccionado, se filtra por el edificio de la unidad con join `!inner`; con «Todos», no se filtra (`src/app/page.tsx:99-108`, `src/app/page.tsx:124`).
2. **Pagos:** **todas** las filas de `payments` de esos contratos, incluidos los cargos accesorios: `contract_id, due_date, status, amount, amount_paid, late_fee_amount` (`src/app/page.tsx:150-156`).
3. **Agua:** `service_rates` de la org con `service='agua'` (`src/app/page.tsx:157-161`). Gana la tarifa del edificio sobre la general (`building_id IS NULL`) y, entre ellas, la de `effective_from` más reciente ≤ mes (`src/lib/cobros.ts:56-76`). Sin tarifa, se usan $250 (`src/app/page.tsx:188`).
4. **Una fila representante por contrato + mes** (`YYYY-MM` de `due_date`): gana `paid`, luego `partial`, luego cualquier otro estatus. En empate se queda la **primera que devuelve PostgREST**, que no ordena (`src/app/page.tsx:152-155`, `src/app/page.tsx:166-171`, `src/lib/billing.ts:47-51`). **No distingue renta de accesorio.**
5. **Meses:** `scheduleMonths(billing_start_date ?? start_date, mesActual)`, acotado a los **últimos 24 meses** (`src/app/page.tsx:173`, `src/app/page.tsx:179-182`, `src/lib/billing.ts:21-44`).
6. **Vencimiento:** `${mes}-${payment_day || 1}` (`src/app/page.tsx:184`).
7. **Estatus del mes** (`src/lib/billing.ts:70-94`):
   - `base = payment.amount ?? (monthly_amount + agua)`; `fee = late_fee_amount || 0`; `paid = amount_paid || 0` (`billing.ts:71-73`).
   - Fila `paid` o `partial` → `parcial` si `base + fee − paid > 0.001`, si no `pagado` (`billing.ts:74-80`).
   - Sin `payment_day` (null o 0) → `verbal`, adeudo 0 (`billing.ts:81-83`).
   - Hoy (medianoche local del navegador, `billing.ts:75`) < vencimiento → `pendiente` (`billing.ts:84-87`).
   - `fee > 0` → `mora`, adeudo `base + fee` (`billing.ts:90-92`).
   - Si no → `vencido`, adeudo `base` (`billing.ts:93`).
8. **Morosidad** = Σ adeudo de los meses en `mora`, `vencido` o `parcial`. **«N pagos vencidos»** cuenta **meses** contrato-mes, no filas (`src/app/page.tsx:197-199`, `src/app/page.tsx:224-225`).
9. La tabla «Cobros pendientes» muestra los 5 más viejos, ordenados por `dueDate` (`src/app/page.tsx:202`, `src/app/page.tsx:250`). Los días se calculan como `max(0, floor((ahora − dueDate) / 1 día))` (`src/app/page.tsx:256-259`).

### 3.2 Réplica SQL y cómo leerla

La réplica es la **consulta Q4** de §4. Reproduce los pasos 1-8 y entrega el detalle por unidad, contrato y mes, el subtotal por unidad y el total. Parámetros: `building_id` (NULL = «Todos») y `today`.

**Cómo leer Q4 con `today = '2026-10-02'`:**

- Si da **57 / $374,900**, es evidencia fuerte (no prueba) de que la réplica es fiel; cambios que se compensen podrían conservar ambos totales. Por eso se compara también el detalle por unidad.
- **Si no cuadra, no significa necesariamente que la réplica esté mal.** Cambiar `today` no reconstruye la foto: después del 2-oct pudieron cambiar la mora persistida (el cron de cobranza la reescribe a diario, `src/lib/agents/cobranza.ts:96-106`), los abonos, los PATCH o los contratos. En ese caso, compara contra el detalle por unidad del screenshot (D302, D203…).

**Divergencias conocidas, que Q4 marca:**

- **Empates de la fila representante:** el navegador toma la primera fila que llega, sin orden (`src/app/page.tsx:152-155`), y Q4 desempata por `created_at`. Si en el mismo contrato-mes hay varias filas del mayor rango con montos o estatus distintos, el adeudo **puede diferir y no es solo una diferencia menor**. Q4 las cuenta en `meses_con_empate_ambiguo` sobre **todos** los meses proyectados, incluidos los que con el desempate de SQL salen `pagado`; para esos meses no se afirma equivalencia.
- **Zona horaria:** Q4 fija `today` en `America/Mexico_City`; la UI usa la fecha local del navegador (`src/lib/billing.ts:75`).
- **Límite de filas de PostgREST:** Supabase limita por defecto la respuesta (`max_rows`, normalmente 1000). Es configuración del proyecto, no versionada en el repo, así que hay que verificarla en Supabase. Si el org tuviera más filas de las que permite, Mission Control vería menos que Q4 (Q9.b da el conteo).

### 3.3 Hallazgos colaterales del cálculo (distorsionan la morosidad; la mayoría la inflan)

| Hallazgo | Efecto | Cita |
|---|---|---|
| Ignora `end_date` | Un contrato vencido que no cambió de estatus se sigue proyectando cada mes hasta hoy | `src/app/page.tsx:179-182` |
| Ignora `archived_at` | Un contrato archivado sigue en la morosidad; el Calendario lo oculta | `src/app/page.tsx:119-124` vs `src/app/calendario/page.tsx:225` |
| Mes sin fila, con `payment_day` y ya vencido = `vencido` por renta + agua | El histórico previo a BaW OS cuenta como deuda si no hay `billing_start_date` | `src/lib/billing.ts:71`, `src/lib/billing.ts:93`; `supabase/migrations/20260628_contracts_billing_start.sql:1-13` |
| Ventana móvil de 24 meses | Cada mes sale de la cuenta el mes más viejo: la «deuda» baja sin que nadie pague (aquí **reduce** la cifra) | `src/lib/billing.ts:43` |
| `paid` sin actualizar `amount_paid` (vía `/api/ledger`) | Se lee como `parcial` con adeudo = cargo + mora − `amount_paid` previo (el cargo completo si era 0/null) | `src/app/api/ledger/route.ts:82-91`, `src/lib/billing.ts:77-79` |
| `waived` (y un futuro `void`) | No son `paid`/`partial`, así que se tratan igual que `pending`: `vencido`/`mora` si ya venció (o `verbal`/`pendiente` cuando aplica) | `src/lib/billing.ts:74`, `src/lib/billing.ts:81-93`; enum `docs/schema.sql:113` |
| Pagos registrados con `due_date = hoy` (API, agentes) | El dinero cae en el mes del registro y el mes que se pagó queda `vencido` | `src/app/api/payments/route.ts:47-48`, `src/app/api/v1/payments/route.ts:92-93` |
| Dos pagos en el mismo mes | Solo uno representa al mes; el otro no salda ningún mes | `src/app/page.tsx:166-171` |
| Accesorio como representante | Si falta la fila de renta, `base` = monto del accesorio (puede **subestimar** o sobrestimar) | `src/app/page.tsx:168`, `src/lib/billing.ts:71` |
| Mora persistida a diario | Escalonada: 0% de 1 a 5 días, 5% de 6 a 15, 10% desde 16. Se aplica a toda fila no `paid` y sin `confirmed_at`, sin mirar el contrato | `src/lib/mora-engine.ts:17-23`, `src/lib/mora-engine.ts:32-40`, `src/lib/agents/cobranza.ts:96-106` |

---

## 4 · Paquete de consultas SQL de SOLO LECTURA

**Cómo usarlas**

- Todas son `SELECT` o `WITH … SELECT`. Ninguna escribe, crea objetos ni llama funciones con efectos.
- Pégalas una por una en el SQL Editor de Supabase (proyecto `zlcgxmllaeweypyodvzk`). Para blindarlas, puedes envolver cada una en `BEGIN READ ONLY; … ROLLBACK;`.
- El editor corre como `postgres`, sin RLS; por eso todas filtran por `org_id`. Las excepciones son las de catálogo (Q0) y Q1.a, que lista a propósito todas las orgs.
- Parámetros en el CTE `p` al inicio de cada consulta:
  - `org_id`;
  - `today` (para reproducir la foto del 2-oct, cámbialo por `'2026-10-02'::date`);
  - en Q5, Q7 y Q8, `today_utc`: fecha UTC real, porque el runner de cobranza calcula su horizonte en UTC (`src/lib/agents/cobranza.ts:147-150`). Las columnas de cobranza describen **hoy**, no la foto;
  - en Q4 y Q11, también `building_id` (NULL = «Todos los edificios»).
- Los estatus se comparan como `::text` porque en prod pueden ser ENUM o TEXT (drift; ver Q0). Además, `'cancelled'` y `'void'` no existen en los ENUM documentados (`docs/schema.sql:84`, `docs/schema.sql:113`), y comparar un ENUM contra una etiqueta que no existe truena.
- Si Q0 muestra que falta alguna columna (`billing_start_date`, `archived_at`, `late_fee_amount`, `ancillary_charge_id`, `amount_paid`, `stripe_payment_intent_id`, `confirmed_at`), detente y avisa: las demás consultas las usan.
- **Validación previa (sin datos de prod):** Q0-Q11 se corrieron dentro de `BEGIN READ ONLY … ROLLBACK` en un Postgres 16 local, con un esquema mínimo que usa ENUMs para los estatus (el peor caso de drift) y datos sintéticos estilo `mateos-809.sql`.
  - Ninguna consulta falló; una escritura habría abortado la transacción de solo lectura.
  - Con D203 en `payment_day = 15` y factura desde 2025-02, Q4 reproduce los 594 días. Con D302 desde 2024-03, reproduce 700/670/639/608. El total de Q11 coincide con el de Q4.
  - El esqueleto de §6 se probó igual: el `ROLLBACK` final no deja cambios y las guardas abortan si el plan no cuadra.

---

### Q0 · Preflight de esquema

**Qué responde:**

- ¿Qué tipo tienen las columnas de estatus (ENUM o TEXT) y qué valores admiten?
- ¿Existen las columnas que usan las demás consultas?
- ¿Hay CHECK sobre `payments.status`?
- ¿Hay índices únicos y FKs sobre `payments`?

Con eso se define si la Fase B necesita migración para `'void'` y si sus bloqueos protegen abonos y bitácora.

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

```sql
-- Q0.d · Índices de payments y FKs que apuntan a payments (abonos, bitácora, CFDI)
SELECT 'indice' AS tipo, indexname AS nombre, indexdef AS definicion
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'payments'
UNION ALL
SELECT 'fk_hacia_payments', conname, conrelid::regclass || ': ' || pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'f' AND confrelid = 'public.payments'::regclass
ORDER BY 1, 2;
```

---

### Q1 · Inventario del 809

**Qué responde:** ¿qué orgs hay, cuántos edificios y unidades tiene la org, y cómo se reparten por `units.status`? Según el ticket se esperan una sola org, 16 unidades y 7 `occupied`.

```sql
-- Q1.a · Orgs en la base (el ticket dice que hay una sola)
SELECT id, name, created_at FROM organizations ORDER BY created_at;
```

```sql
-- Q1.b · Unidades por edificio y status
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

**Qué responde:** de las unidades `occupied`, ¿cuáles no tienen contrato vigente hoy y por qué (causas de §2.3)? También dice si el Calendario les pinta barra en su ventana por defecto y si Mission Control les proyecta meses.

- *Vigente:* estatus `active`/`en_renovacion`/`pending`, no archivado, `start_date ≤ hoy` y `end_date` nula o ≥ hoy.
- *Barra en el Calendario:* estatus visible, no archivado y el rango del contrato intersecta `[hoy − 7, hoy + 24)`, que es la ventana de escritorio por defecto (`src/app/calendario/page.tsx:144-145`).
- *Mission Control proyecta:* estatus `active`/`en_renovacion` y su mes de inicio de facturación ya llegó (`src/app/page.tsx:123`, `src/lib/billing.ts:21-44`).

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
           AND c.start_date < p.today + 24
           AND (c.end_date IS NULL OR c.end_date >= p.today - 7)) AS barra_en_ventana_calendario,
         (c.status::text IN ('active','en_renovacion')
           AND date_trunc('month', COALESCE(c.billing_start_date, c.start_date)) <= date_trunc('month', p.today))
           AS mission_control_proyecta
  FROM contracts c
  CROSS JOIN p
  WHERE c.org_id = p.org_id
)
SELECT u.number AS unidad,
       u.status::text AS unit_status,
       count(c.id) AS contratos_total,
       count(c.id) FILTER (WHERE c.vigente) AS contratos_vigentes,
       bool_or(COALESCE(c.barra_en_ventana_calendario, false)) AS barra_en_ventana_calendario,
       bool_or(COALESCE(c.mission_control_proyecta, false)) AS mission_control_proyecta,
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

> La causa **E** (contrato ligado a otra unidad o a ninguna) no aparece aquí porque el JOIN es por `unit_id`. Esos casos salen en Q3, columna `problema_unidad`.

---

### Q3 · Todos los contratos con status y fechas

**Qué responde:** inventario completo de contratos de la org, con banderas que explican cada pantalla:

- ¿Mission Control le proyecta meses? ¿Desde qué mes y cuántos?
- ¿El cron le generaría renta si corriera hoy?
- ¿El Calendario lo pinta en su ventana por defecto?
- ¿La `end_date` ya venció?
- ¿Tiene algún problema de unidad?

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
       -- src/app/page.tsx:123 + billing.ts:21-44
       (c.status::text IN ('active','en_renovacion')
         AND date_trunc('month', COALESCE(c.billing_start_date, c.start_date)) <= date_trunc('month', p.today))
         AS mission_control_proyecta,
       -- cron/payments/route.ts:57-59, 66-70, 88-96 (si corriera hoy)
       (c.status::text IN ('active','en_renovacion') AND c.rent_type <> 'STR'
         AND date_trunc('month', COALESCE(c.billing_start_date, c.start_date)) <= date_trunc('month', p.today)
         AND NOT EXISTS (
           SELECT 1 FROM payments x
           WHERE x.contract_id = c.id AND x.ancillary_charge_id IS NULL
             AND date_trunc('month', x.due_date) = date_trunc('month', p.today)))
         AS cron_generaria_renta_hoy,
       -- calendario/page.tsx:214-226 + calendar-occupancy.ts:150, 311 (ventana [hoy-7, hoy+24))
       (c.status::text IN ('active','pending','renewed','en_renovacion','expired')
         AND c.archived_at IS NULL AND c.unit_id IS NOT NULL
         AND u.id IS NOT NULL AND u.org_id = c.org_id AND u.archived_at IS NULL
         AND c.start_date < p.today + 24
         AND (c.end_date IS NULL OR c.end_date >= p.today - 7)) AS calendario_lo_pinta_en_ventana,
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

### Q4 · Réplica de la morosidad de Mission Control (agrupada por unidad, contrato y mes)

**Qué responde:** ¿qué meses cuenta Mission Control como vencidos, por cuánto, y cuántos de ellos **no tienen fila** en `payments` (proyección pura)? Devuelve el detalle contrato-mes, el subtotal por unidad y el total.

- `meses_con_empate_ambiguo` marca los meses donde el navegador podría elegir otra fila representante (§3.2).
- Con `today = '2026-10-02'` y `building_id = NULL`, se compara contra 57 / $374,900 (cómo leerlo: §3.2).

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id,
         NULL::uuid AS building_id,          -- NULL = «Todos»; o el id del edificio seleccionado
         (now() AT TIME ZONE 'America/Mexico_City')::date AS today
         -- Foto del reporte: '2026-10-02'::date AS today
),
-- page.tsx:99-124 · contratos active/en_renovacion (sin filtro de archived_at ni end_date)
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
    AND (p.building_id IS NULL OR u.building_id = p.building_id)
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
-- page.tsx:150-171 · todas las filas de esos contratos (incluye accesorios), con su rango
pr AS (
  SELECT py.*, date_trunc('month', py.due_date)::date AS ms,
         CASE py.status::text WHEN 'paid' THEN 3 WHEN 'partial' THEN 2 ELSE 1 END AS rk
  FROM payments py
  WHERE py.contract_id IN (SELECT contract_id FROM c)
),
-- una representante por contrato+mes (paid > partial > resto); empate → created_at
pay AS (
  SELECT DISTINCT ON (pr.contract_id, pr.ms)
         pr.contract_id, pr.ms AS month_start,
         pr.id AS payment_id, pr.status::text AS payment_status, pr.amount AS payment_amount,
         pr.amount_paid, pr.late_fee_amount, pr.ancillary_charge_id,
         (SELECT count(DISTINCT (q.status::text, q.amount, q.amount_paid, q.late_fee_amount))
          FROM pr q WHERE q.contract_id = pr.contract_id AND q.ms = pr.ms AND q.rk = pr.rk) > 1 AS empate_ambiguo
  FROM pr
  ORDER BY pr.contract_id, pr.ms, pr.rk DESC, pr.created_at
),
-- page.tsx:184 (vencimiento) + page.tsx:188 / cobros.ts:56-76 (agua, fallback 250)
x AS (
  SELECT m.*, pay.payment_id, pay.payment_status, pay.payment_amount, pay.amount_paid,
         pay.late_fee_amount, pay.ancillary_charge_id, COALESCE(pay.empate_ambiguo, false) AS empate_ambiguo,
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
-- page.tsx:197-199, 224-225, 256-259 · solo mora/vencido/parcial suman; días ≥ 0.
-- Se conservan todos los meses para contar empates ambiguos también donde SQL eligió 'pagado'.
o AS (
  SELECT v.*,
         (v.mc_status IN ('mora', 'vencido', 'parcial')) AS en_morosidad,
         CASE v.mc_status
           WHEN 'parcial' THEN GREATEST(0, v.base + v.fee - v.paid)
           WHEN 'mora' THEN v.base + v.fee
           WHEN 'vencido' THEN v.base
           ELSE 0
         END AS owed,
         GREATEST(0, (SELECT today FROM p) - v.due_date) AS dias_atraso
  FROM v
)
SELECT CASE WHEN GROUPING(o.unit_id) = 1 THEN '== TOTAL =='
            ELSE COALESCE(o.unit_number, '(sin unidad)') END AS unidad,
       CASE WHEN GROUPING(o.month_start) = 1 AND GROUPING(o.unit_id) = 0 THEN '-- subtotal unidad --'
            ELSE to_char(o.month_start, 'YYYY-MM') END AS mes,
       o.contract_id,
       count(*) FILTER (WHERE o.en_morosidad) AS pagos_vencidos,
       COALESCE(sum(o.owed) FILTER (WHERE o.en_morosidad), 0) AS adeudo_mc,
       COALESCE(sum(o.fee) FILTER (WHERE o.en_morosidad), 0) AS de_ello_mora_persistida,
       max(o.dias_atraso) FILTER (WHERE o.en_morosidad) AS max_dias_atraso,
       string_agg(DISTINCT o.mc_status, ',') AS estatus_mc,
       count(*) FILTER (WHERE o.en_morosidad AND o.payment_id IS NULL) AS meses_sin_fila_en_payments,
       count(*) FILTER (WHERE o.empate_ambiguo) AS meses_con_empate_ambiguo,
       CASE WHEN GROUPING(o.month_start) = 0 THEN max(o.payment_id::text) END AS payment_id,
       CASE WHEN GROUPING(o.month_start) = 0 THEN max(o.payment_status) END AS payment_status,
       bool_or(o.ancillary_charge_id IS NOT NULL) AS representante_es_accesorio,
       bool_or(o.end_date IS NOT NULL AND o.month_start > date_trunc('month', o.end_date)) AS mes_despues_de_end_date,
       bool_or(o.month_start < date_trunc('month', o.start_date)) AS mes_antes_de_start_date,
       bool_or(o.contract_archived_at IS NOT NULL) AS contrato_archivado
FROM o
GROUP BY GROUPING SETS ((o.unit_id, o.unit_number, o.contract_id, o.month_start), (o.unit_id, o.unit_number), ())
-- Se muestran los meses en morosidad y los meses con empate ambiguo (aunque SQL los vea pagados), más el total.
HAVING GROUPING(o.unit_id) = 1
    OR count(*) FILTER (WHERE o.en_morosidad) > 0
    OR count(*) FILTER (WHERE o.empate_ambiguo) > 0
ORDER BY GROUPING(o.unit_id), o.unit_number, GROUPING(o.month_start) DESC, o.month_start;
```

> Si en el total `meses_sin_fila_en_payments` ≈ `pagos_vencidos`, la hipótesis principal queda confirmada: la morosidad es proyección, no filas. Las filas de detalle con `pagos_vencidos = 0` son meses que SQL ve pagados pero con empate ambiguo: el navegador podría contarlos.

---

### Q5 · Filas de `payments` con saldo y vencidas, agrupadas por unidad, contrato y mes

**Qué responde:** la misma pregunta que Q4, pero desde la **tabla**: ¿qué filas reales tienen saldo y ya vencieron, de **cualquier** contrato? Incluye contratos no activos y huérfanos. Columnas de cobranza (describen **hoy**, en UTC como el runner):

- `filas_que_cobranza_selecciona` reproduce el filtro real: misma org, `confirmed_at` nulo, `status <> 'paid'` y vencimiento ≤ fecha UTC + 5 días (`src/lib/agents/cobranza.ts:24`, `src/lib/agents/cobranza.ts:147-161`).
- `filas_con_mora_persistida_por_cobranza`: de esas, las que ya vencieron; a esas les persiste el recargo (`src/lib/agents/cobranza.ts:87-106`).

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id,
         (now() AT TIME ZONE 'America/Mexico_City')::date AS today,
         (now() AT TIME ZONE 'UTC')::date AS today_utc
)
SELECT CASE WHEN GROUPING(u.id) = 1 THEN '== TOTAL ==' ELSE COALESCE(u.number, '(sin unidad)') END AS unidad,
       py.contract_id,
       c.status::text AS contract_status,
       CASE WHEN GROUPING(date_trunc('month', py.due_date)) = 1 AND GROUPING(u.id) = 0 THEN '-- subtotal unidad --'
            ELSE to_char(date_trunc('month', py.due_date), 'YYYY-MM') END AS mes,
       count(*) AS filas,
       string_agg(py.status::text, ',' ORDER BY py.created_at) AS estatus_filas,
       sum(py.amount) AS cargo,
       sum(COALESCE(py.late_fee_amount, 0)) AS mora,
       sum(COALESCE(py.amount_paid, 0)) AS pagado,
       sum(py.amount + COALESCE(py.late_fee_amount, 0) - COALESCE(py.amount_paid, 0)) AS saldo,
       max(p.today - py.due_date) AS max_dias_atraso,
       count(*) FILTER (WHERE py.confirmed_at IS NULL AND py.status::text <> 'paid'
                          AND py.due_date <= p.today_utc + 5) AS filas_que_cobranza_selecciona,
       count(*) FILTER (WHERE py.confirmed_at IS NULL AND py.status::text <> 'paid'
                          AND py.due_date <= p.today_utc) AS filas_con_mora_persistida_por_cobranza,
       bool_or(py.ancillary_charge_id IS NOT NULL) AS incluye_accesorio,
       min(py.created_at) AS primera_creada
FROM payments py
CROSS JOIN p
LEFT JOIN contracts c ON c.id = py.contract_id
LEFT JOIN units u ON u.id = c.unit_id
WHERE py.org_id = p.org_id
  AND py.status::text NOT IN ('paid', 'void', 'waived')
  AND py.due_date <= p.today
GROUP BY GROUPING SETS ((u.id, u.number, py.contract_id, c.status, date_trunc('month', py.due_date)), (u.id, u.number), ())
ORDER BY GROUPING(u.id), u.number, GROUPING(date_trunc('month', py.due_date)) DESC, date_trunc('month', py.due_date);
```

---

### Q6 · Cargos antes de `start_date` o de `billing_start_date`, o después de `end_date`

**Qué responde:** ¿hay filas de `payments` fuera del rango facturable del contrato (comparando a nivel mes)? Son candidatas a «basura generada».

- `mission_control_proyecta_mes` dice si ese mes entra en la proyección de Mission Control con «Todos los edificios». Por ejemplo, los meses posteriores a `end_date` de un contrato `active` **sí** entran (§3.3).
- Los meses **proyectados** fuera de rango, sin fila, salen en Q4 (`mes_despues_de_end_date`, `mes_antes_de_start_date`).

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id,
         (now() AT TIME ZONE 'America/Mexico_City')::date AS today
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
         AND date_trunc('month', py.due_date) > date_trunc('month', c.end_date)) AS despues_de_end,
       (c.org_id = p.org_id
         AND c.status::text IN ('active','en_renovacion')
         AND date_trunc('month', py.due_date) >= date_trunc('month', COALESCE(c.billing_start_date, c.start_date))
         AND date_trunc('month', py.due_date) <= date_trunc('month', p.today)
         AND date_trunc('month', py.due_date) >= date_trunc('month', p.today) - interval '23 months')
         AS mission_control_proyecta_mes
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

**Qué responde:** ¿qué filas cuelgan de contratos que ya no están `active`/`en_renovacion`?

- Mission Control no las cuenta (`src/app/page.tsx:123`).
- El runner de cobranza **no** mira el estatus del contrato (`src/lib/agents/cobranza.ts:154-161`). Si una fila cumple su filtro (`cobranza_la_selecciona`), entra a la cobranza. Si además ya venció (`cobranza_le_persiste_mora`), le persiste el recargo (`src/lib/agents/cobranza.ts:87-106`). Las filas `paid` nunca entran.

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id,
         (now() AT TIME ZONE 'UTC')::date AS today_utc
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
       (py.status::text <> 'paid' AND py.confirmed_at IS NULL AND py.due_date <= p.today_utc + 5) AS cobranza_la_selecciona,
       (py.status::text <> 'paid' AND py.confirmed_at IS NULL AND py.due_date <= p.today_utc) AS cobranza_le_persiste_mora,
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

### Q8 · Pagos vencidos sin contrato ligado (o ligados a un contrato inválido)

**Qué responde:** ¿hay filas de la org, vencidas y sin pagar, cuyo `contract_id` es nulo, apunta a un contrato inexistente o de otra org, o a un contrato sin unidad o archivado?

- `mission_control_proyecta_mes`: un contrato archivado o sin unidad **sí** puede entrar en Mission Control con «Todos los edificios» (`src/app/page.tsx:106-108`, `src/app/page.tsx:119-124`). Uno nulo, inexistente o de otra org, no.
- `cobranza_la_selecciona` reproduce el filtro del runner, con el horizonte en UTC (`src/lib/agents/cobranza.ts:147-161`). Como Q8 solo lista filas vencidas, a las seleccionadas también les persiste el recargo (`src/lib/agents/cobranza.ts:87-106`).

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id,
         (now() AT TIME ZONE 'America/Mexico_City')::date AS today,
         (now() AT TIME ZONE 'UTC')::date AS today_utc
)
SELECT py.id AS payment_id,
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
       END AS problema,
       (c.id IS NOT NULL AND c.org_id = py.org_id
         AND c.status::text IN ('active','en_renovacion')
         AND date_trunc('month', py.due_date) >= date_trunc('month', COALESCE(c.billing_start_date, c.start_date))
         AND date_trunc('month', py.due_date) <= date_trunc('month', p.today)
         AND date_trunc('month', py.due_date) >= date_trunc('month', p.today) - interval '23 months')
         AS mission_control_proyecta_mes,
       (py.status::text <> 'paid' AND py.confirmed_at IS NULL AND py.due_date <= p.today_utc + 5) AS cobranza_la_selecciona
FROM payments py
CROSS JOIN p
LEFT JOIN contracts c ON c.id = py.contract_id
LEFT JOIN units u ON u.id = c.unit_id
WHERE py.org_id = p.org_id
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

> Las filas con `org_id` nulo no pertenecen a ninguna org y aquí no se atribuyen al 809. Si hace falta, revísalas aparte con `WHERE org_id IS NULL`.

---

### Q9 · Origen de las filas: ¿cron, captura retroactiva o import?

**Qué responde:** ¿cuándo se crearon las filas de `payments` respecto a su `due_date`? Patrones esperados:

- **Cron:** filas creadas el día 1 de cada mes (~06:00 UTC) con `due_date` en ese mismo mes (`vercel.json:3-6`, `src/app/api/cron/payments/route.ts:109`).
- **Captura retroactiva** (AbonoModal o pago rápido): `created_at` muy posterior al `due_date` (`src/components/cobros/AbonoModal.tsx:173-182`, `src/lib/cobros-actions.ts:64-68`).
- **Import o backfill:** muchas filas con el mismo `created_at` y `due_date` repartidos en muchos meses.

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

**Qué responde:** ¿qué filas tienen registros incompletos o señales de dinero que Mission Control no ve? Alimenta el bucket «pagado / registro incompleto» y la lista «por revisar».

- `DUPLICADO`: más de una fila de renta para el mismo contrato y mes. Solo una cuenta (`src/app/page.tsx:166-171`).
- `PAID_SIN_MONTO`: fila `paid` con `amount_paid` menor que cargo + mora. Mission Control la ve como `parcial` (`src/lib/billing.ts:77-79`). La produce `/api/ledger` (`src/app/api/ledger/route.ts:82-91`).
- `PAGO_FECHADO_HOY`: fila `paid` con `due_date = paid_date = fecha de creación`. Es el patrón de la API y los agentes (`src/app/api/payments/route.ts:47-48`, `src/lib/agents/v1/dispatcher.ts:142-143`); el pago puede corresponder a otro mes.
- `ABONOS_DESFASADOS`: la suma de abonos no coincide con `amount_paid`. El recompute solo suma abonos (`src/app/api/payments/[id]/recompute/route.ts:28-40`), así que esto indica un recompute fallido o una edición directa. Un `partial` con `amount_paid` igual a sus abonos **no** se lista: es deuda correctamente registrada.
- `SENAL_EXTERNA` (**por revisar, no prueba de pago**): fila sin `paid`/`partial` pero con asiento de bitácora, CFDI o `stripe_payment_intent_id`.
  - El id de Stripe se guarda al **crear** el intent, antes de cobrar (`src/app/api/payments/checkout/route.ts:18-36`).
  - La bitácora conserva su asiento aunque se borre el abono (`src/app/cobros/[contractId]/page.tsx:338-346`).
- `BITACORA_SIN_CARGO`: asientos de `payment_ledger` sin `payment_id`. Mission Control solo lee `payments` (`src/app/page.tsx:150-171`) y solo descuenta lo que está en `amount_paid` de la fila del mes (`src/lib/billing.ts:71-79`), así que ese dinero anotado no salda ningún mes.

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id
),
ev AS (
  SELECT py.id AS payment_id,
         (SELECT COALESCE(sum(r.amount), 0) FROM payment_receipts r WHERE r.payment_id = py.id) AS abonos,
         (SELECT count(*) FROM payment_receipts r WHERE r.payment_id = py.id) AS n_abonos,
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
SELECT 'ABONOS_DESFASADOS', u.number, py.contract_id, py.id, to_char(py.due_date, 'YYYY-MM'), py.status::text,
       py.amount, py.amount_paid,
       'suma de abonos=' || ev.abonos || ' (' || ev.n_abonos || ' abonos) vs amount_paid=' || COALESCE(py.amount_paid, 0)
FROM payments py
CROSS JOIN p
JOIN ev ON ev.payment_id = py.id
LEFT JOIN contracts c ON c.id = py.contract_id
LEFT JOIN units u ON u.id = c.unit_id
WHERE py.org_id = p.org_id
  AND ev.n_abonos > 0
  AND abs(ev.abonos - COALESCE(py.amount_paid, 0)) > 0.001

UNION ALL
SELECT 'SENAL_EXTERNA', u.number, py.contract_id, py.id, to_char(py.due_date, 'YYYY-MM'), py.status::text,
       py.amount, py.amount_paid,
       'asientos=' || ev.asientos || ' cfdis=' || ev.cfdis
         || ' stripe_intent=' || COALESCE(py.stripe_payment_intent_id, '-') || ' (por revisar; no prueba pago)'
FROM payments py
CROSS JOIN p
JOIN ev ON ev.payment_id = py.id
LEFT JOIN contracts c ON c.id = py.contract_id
LEFT JOIN units u ON u.id = c.unit_id
WHERE py.org_id = p.org_id
  AND py.status::text NOT IN ('paid', 'partial')
  AND (ev.asientos > 0 OR ev.cfdis > 0 OR py.stripe_payment_intent_id IS NOT NULL)

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

**Qué responde:** para cada contrato-mes que Mission Control cuenta como vencido (misma lógica y parámetros que Q4), ¿en qué bucket cae según la regla de §5? Devuelve el detalle por contrato-mes, el subtotal por bucket y el total.

- **Es una propuesta: Fran valida fila por fila antes de cualquier Fase B.**
- Control: el `== TOTAL ==` de Q11 debe ser idéntico al de Q4 (mismos meses, mismo adeudo).

```sql
WITH p AS (
  SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14'::uuid AS org_id,
         NULL::uuid AS building_id,
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
    AND (p.building_id IS NULL OR u.building_id = p.building_id)
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
pr AS (
  SELECT py.*, date_trunc('month', py.due_date)::date AS ms,
         CASE py.status::text WHEN 'paid' THEN 3 WHEN 'partial' THEN 2 ELSE 1 END AS rk
  FROM payments py
  WHERE py.contract_id IN (SELECT contract_id FROM c)
),
pay AS (
  SELECT DISTINCT ON (pr.contract_id, pr.ms)
         pr.contract_id, pr.ms AS month_start,
         pr.id AS payment_id, pr.status::text AS payment_status, pr.amount AS payment_amount,
         pr.amount_paid, pr.late_fee_amount, pr.ancillary_charge_id, pr.stripe_payment_intent_id
  FROM pr
  ORDER BY pr.contract_id, pr.ms, pr.rk DESC, pr.created_at
),
-- Evidencia por contrato: pagos que no saldan su mes (sobrantes en un mismo mes o
-- anteriores al calendario) y primer mes con pago registrado en BaW OS.
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
         (SELECT count(*) FROM payment_receipts r WHERE r.payment_id = v.payment_id) AS n_abonos,
         (SELECT count(*) FROM payment_ledger l WHERE l.payment_id = v.payment_id) AS asientos,
         (SELECT count(*) FROM invoices i WHERE i.payment_id = v.payment_id AND COALESCE(i.status, '') <> 'cancelled') AS cfdis,
         -- ¿Otro contrato de la misma unidad también está en el calendario facturable de MC ese mes?
         EXISTS (
           SELECT 1 FROM contracts c2
           WHERE c2.unit_id = v.unit_id AND c2.id <> v.contract_id
             AND c2.org_id = (SELECT org_id FROM p)
             AND c2.status::text IN ('active','en_renovacion')
             AND date_trunc('month', COALESCE(c2.billing_start_date, c2.start_date)) <= v.month_start
         ) AS otro_contrato_factura_mismo_mes
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
           WHEN o.otro_contrato_factura_mismo_mes
             THEN 'B4 REVISAR · dos contratos facturan la misma unidad-mes'
           WHEN o.ancillary_charge_id IS NOT NULL
             THEN 'B5 REVISAR · la fila del mes es un accesorio (cálculo mezclado)'
           -- PAGADO, REGISTRO INCOMPLETO: el registro en BaW OS está mal
           WHEN o.payment_status = 'paid'
             THEN 'P1 PAGADO · fila paid sin amount_paid completo'
           WHEN o.n_abonos > 0 AND abs(o.abonos - o.paid) > 0.001
             THEN 'P2 PAGADO? · abonos desfasados de amount_paid (recompute)'
           -- PAGADO POR FUERA SIN REGISTRAR (probable)
           WHEN o.pagos_sobrantes > 0 OR o.pagos_fuera_de_calendario > 0
             THEN 'P3 PAGADO POR FUERA? · el contrato tiene pagos que no saldan su mes'
           WHEN o.primer_mes_pagado IS NOT NULL AND o.month_start < o.primer_mes_pagado
             THEN 'P4 PAGADO POR FUERA? · histórico anterior al primer pago registrado del contrato'
           WHEN o.month_start < (SELECT mes_golive FROM golive)
             THEN 'P5 FRAN DECIDE · mes anterior al arranque de BaW OS en la org'
           -- SEÑAL EXTERNA: hay rastro (Stripe/bitácora/CFDI) pero no prueba pago
           WHEN (o.payment_status IS NULL OR o.payment_status NOT IN ('paid', 'partial'))
                AND (o.asientos > 0 OR o.cfdis > 0 OR o.stripe_payment_intent_id IS NOT NULL)
             THEN 'S1 REVISAR · señal externa (Stripe/bitácora/CFDI), no prueba pago'
           -- DEUDA REAL (probable)
           WHEN o.end_date IS NOT NULL AND o.month_start > date_trunc('month', o.end_date)
             THEN 'R2 DEUDA REAL? · en_renovacion tras end_date (confirmar que sigue el inquilino)'
           WHEN o.unit_status IS DISTINCT FROM 'occupied'
             THEN 'R3 DEUDA REAL? · la unidad no está marcada ocupada'
           ELSE 'R1 DEUDA REAL · en rango, sin evidencia de pago (incluye saldos parciales bien registrados)'
         END AS clasificacion
  FROM o
)
SELECT CASE WHEN GROUPING(k.clasificacion) = 1 THEN '== TOTAL ==' ELSE k.clasificacion END AS clasificacion,
       CASE WHEN GROUPING(k.contract_id) = 0 THEN COALESCE(k.unit_number, '(sin unidad)') END AS unidad,
       CASE WHEN GROUPING(k.contract_id) = 0 THEN to_char(k.month_start, 'YYYY-MM') END AS mes,
       k.contract_id,
       CASE WHEN GROUPING(k.contract_id) = 0 THEN max(k.payment_id::text) END AS payment_id,
       CASE WHEN GROUPING(k.contract_id) = 0 THEN max(k.payment_status) END AS payment_status,
       count(*) AS meses,
       sum(k.owed) AS adeudo_mc,
       max(GREATEST(0, (SELECT today FROM p) - k.due_date)) AS max_dias_atraso
FROM k
GROUP BY GROUPING SETS ((k.clasificacion, k.unit_id, k.unit_number, k.contract_id, k.month_start), (k.clasificacion), ())
ORDER BY GROUPING(k.clasificacion), k.clasificacion, GROUPING(k.contract_id) DESC, k.unit_number, k.month_start;
```

---

## 5 · Regla de clasificación (propuesta, sin ejecutar)

Cada **contrato-mes** que Mission Control cuenta como vencido cae en **un** bucket. Las reglas se evalúan en el orden de las tablas y gana la primera que aplica, igual que el `CASE` de Q11. Las reglas con «?», `REVISAR` o `FRAN DECIDE` son **candidatas**: requieren confirmación de Fran antes de cualquier corrección.

### Basura generada (no debe existir como cargo)

| Regla | Condición | Por qué | Corrección en Fase B |
|---|---|---|---|
| B1 | Contrato archivado | El Calendario lo oculta pero Mission Control lo proyecta (`src/app/page.tsx:119-124` vs `src/app/calendario/page.tsx:225`) | Contrato → `terminated` vía UI; filas → `void` |
| B2 | Mes antes de `start_date` (pasa si `billing_start_date < start_date`) | Antes del contrato no hay renta | Corregir `billing_start_date`; filas → `void` |
| B3? | Mes posterior a `end_date` con estatus `active` | El runner de renovaciones pasa a `en_renovacion` los contratos `active` vencidos, pero solo en modo real (`src/lib/agents/renovaciones.ts:42-50`, `src/lib/agents/renovaciones.ts:93-97`). Que siga `active` sugiere un dato viejo o que el runner no corrió en modo real | Si Fran confirma la salida: contrato → `terminated`/`expired`, unidad → `available`, filas → `void`. Si el inquilino sigue: pasa a R2 |
| B4 | Otro contrato `active`/`en_renovacion` de la misma unidad también está en el calendario facturable de Mission Control ese mes | Una unidad tiene un solo inquilino por mes; Mission Control cobra ambos (`src/app/page.tsx:123`, `src/app/page.tsx:179-182`) | Fran elige cuál es el real; el otro → `terminated`, sus filas → `void` |
| B5 | La fila representante del mes es un cargo accesorio | Error de cálculo: mezcla accesorio con renta (`src/app/page.tsx:168`) | No es dato: se arregla en código (prerequisito de la Fase B) |
| — | Filas fuera de rango (Q6), de contratos no activos (Q7) o con contrato inválido (Q8) | Pueden o no entrar en Mission Control (columna `mission_control_proyecta_mes`). El runner de cobranza toma las que cumplen su filtro (columna `cobranza_la_selecciona`), sin mirar el contrato (`src/lib/agents/cobranza.ts:154-161`) | → `void`, con OK fila por fila |

### Pagado (registro incompleto) o pagado por fuera sin registrar

| Regla | Condición | Por qué | Corrección en Fase B |
|---|---|---|---|
| P1 | Fila `paid` con `amount_paid` incompleto | `/api/ledger` marca `paid` sin tocar `amount_paid` (`src/app/api/ledger/route.ts:82-91`) | **Conciliar antes de registrar:** el recompute **reemplaza** `amount_paid` por la suma de abonos (`src/app/api/payments/[id]/recompute/route.ts:36-46`). Registrar solo la diferencia **aumentaría** el saldo si el pago previo no tiene abonos. Hay que reconstruir abonos que respalden **todo** lo pagado, con evidencia (o «quitar pago directo» y re-registrarlo completo, `src/app/cobros/[contractId]/page.tsx:355-374`). **No** `void` |
| P2? | La suma de abonos ≠ `amount_paid` | El recompute solo suma abonos (`src/app/api/payments/[id]/recompute/route.ts:28-40`); un desfase indica recompute fallido o edición directa | Recompute desde la UI (`src/lib/cobros-actions.ts:28-31`) y volver a clasificar |
| P3? | El contrato tiene pagos que no saldan su mes: dos en el mismo mes, o anteriores al calendario | El dinero entró, pero en otro mes: la API registra con `due_date = hoy` (`src/app/api/payments/route.ts:47-48`) y el PATCH puede mover `due_date` (`src/app/api/payments/[id]/route.ts:7-11`) | Reasignarlo al mes correcto desde la UI: «quitar pago directo» (`src/app/cobros/[contractId]/page.tsx:355-374`) y registrar el abono en el mes que corresponde |
| P4? | Mes anterior al primer pago registrado del contrato, con pagos posteriores | Patrón de «histórico previo a BaW OS» | Si Fran lo confirma: `billing_start_date` = primer mes que administra BaW OS (UI de contratos, `src/app/contracts/page.tsx:101-115`) |
| P5 | Mes anterior al arranque de BaW OS en la org (Q9.b) | **Hipótesis:** antes de esa fecha los pagos se registraban fuera de BaW OS. El repo solo acredita que `billing_start_date` existe para no facturar histórico no verificado (`supabase/migrations/20260628_contracts_billing_start.sql:1-6`) | **Fran decide** con estados de cuenta o la bitácora de Notion. Si se pagó: `billing_start_date`. Si se debe: pasa a deuda real |
| S1 | Sin `paid`/`partial`, pero con asiento de bitácora, CFDI o id de Stripe | **No prueba pago.** El id de Stripe se guarda al crear el intent (`src/app/api/payments/checkout/route.ts:18-36`) y la bitácora conserva asientos de abonos borrados (`src/app/cobros/[contractId]/page.tsx:338-346`) | Fran revisa contra Stripe, el CFDI o el banco; luego reclasifica |

### Deuda real

| Regla | Condición | Acción |
|---|---|---|
| R1 | En el rango del contrato, contrato vigente, sin evidencia de pago, mes ≥ arranque de BaW OS. Incluye los saldos parciales bien registrados | Se queda. Es la cifra que debe mostrar Mission Control |
| R2? | Contrato `en_renovacion` en un mes posterior a `end_date` | Por diseño se sigue facturando (`src/lib/agents/renovaciones.ts:93`). Es deuda real **solo si** el inquilino sigue en la unidad |
| R3? | Contrato vigente, pero la unidad no está marcada `occupied` | `units.status` es manual (§2.1): hay que confirmar la ocupación |

**Criterio de cierre:** antes de correr cualquier paso de la Fase B, los buckets `?`, `REVISAR` y `FRAN DECIDE` deben quedar en cero, resueltos fila por fila por Fran.

---

## 6 · Esqueleto de la corrección (Fase B) · NO EJECUTAR

> Requiere OK explícito de Fran. Toca datos de prod y, para `void`, el esquema (`CLAUDE.md` §1.4). Nunca `DELETE`. Todo cambio debe ser reversible y quedar auditado.

### 6.0 Prerequisitos de código (PR aparte, antes de tocar datos)

Hoy el código **no reconoce** `void`:

- `computeMonthStatus` trataría una fila `void` igual que una `pending`: `vencido` o `mora` si ya venció, `verbal`/`pendiente` si aplica (`src/lib/billing.ts:47-51`, `src/lib/billing.ts:74-93`). Marcar `void` sin este PR **no cambia** la morosidad.
- El runner de cobranza la seguiría seleccionando y le persistiría mora (`src/lib/agents/cobranza.ts:104-106`, `src/lib/agents/cobranza.ts:158-159`).

Cambios mínimos:

1. `src/lib/billing.ts`: `rankPayment('void') = 0`, para que una fila viva siempre gane; y en `computeMonthStatus`, una fila `void` (o `waived`) → estatus `anulado`, `owed = 0`, fuera del conteo.
2. `src/lib/agents/cobranza.ts:104-106` y `src/lib/agents/cobranza.ts:158-159`: excluir `void` y `waived` además de `paid`.
3. `src/app/api/cron/payments/route.ts:51-62`: **mantener** que una fila `void` cuente como «ya generada», para no regenerar el mes anulado. Hoy ya es así; agregar un test.
4. Decidir con Fran si `scheduleMonths` debe respetar `end_date` en contratos `active` (§3.3). Para `en_renovacion`, el diseño actual es seguir facturando.
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
  'BAW-18: motivo de anulación (regla B1-B5 / Q6-Q8) + id de lote. Un cargo void no se cobra ni cuenta en morosidad.';

-- Respaldo por lote: una fila por (lote, cargo). Solo crece; nunca se edita.
CREATE TABLE IF NOT EXISTS public.baw18_payments_void_backup (
  run_id      uuid        NOT NULL,
  payment_id  uuid        NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  row_data    jsonb       NOT NULL,
  PRIMARY KEY (run_id, payment_id)
);
ALTER TABLE public.baw18_payments_void_backup ENABLE ROW LEVEL SECURITY;  -- sin políticas: solo service_role
-- Rollback: DROP TABLE public.baw18_payments_void_backup;
--           ALTER TABLE public.payments DROP COLUMN voided_at, DROP COLUMN void_reason;
-- (un valor de ENUM no se puede quitar; 'void' sin uso es inocuo)
```

> Un valor nuevo de ENUM no se puede usar en la misma transacción que lo agrega. La migración se aplica sola y el script de datos (6.3) corre después.

### 6.2 Correcciones que NO son SQL (se hacen en la UI, con su bitácora)

- **Contratos** (B1, B3, B4, P4, P5): `billing_start_date`, `end_date` y `status` desde la edición de contratos (`src/app/contracts/page.tsx:101-115`). Esto elimina meses **proyectados sin fila**: ahí no hay nada que anular; el remedio es la fecha.
- **Unidades:** `status` desde Unidades (`src/app/units/page.tsx:174-177`), para que coincida con Q2.
- **Pagos con evidencia** (P1-P3): registrar los abonos con el modal o el pago rápido, que crean abono, recompute y asiento de bitácora (`src/components/cobros/AbonoModal.tsx:201-233`, `src/lib/cobros-actions.ts:44-100`). Para P1, ver la advertencia de conciliación en §5.

### 6.3 Script de datos: preflight → bloqueo → guardas → dry-run → commit

```sql
-- =====================================================================
-- BAW-18 Fase B · anular cargos basura · ESQUELETO, NO EJECUTAR SIN OK
-- Paso 1: correr TAL CUAL (termina en ROLLBACK = dry-run).
-- Paso 2: solo con OK de Fran, cambiar el ROLLBACK final por COMMIT.
-- =====================================================================

-- PREFLIGHT (solo lectura): 'void' debe existir (enum o CHECK) y la tabla de respaldo también.
SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'payment_status' AND e.enumlabel = 'void';
SELECT to_regclass('public.baw18_payments_void_backup') AS tabla_respaldo;

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 0) Identificador del lote: todo lo que sigue queda acotado a él.
CREATE TEMP TABLE baw18_run ON COMMIT DROP AS SELECT gen_random_uuid() AS run_id;

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

-- 2) Bloqueo de las filas del plan hasta el COMMIT/ROLLBACK. Con las FKs hacia payments
--    (Q0.d), esto también bloquea abonos, asientos o CFDI nuevos sobre estos cargos.
SELECT py.id FROM payments py JOIN baw18_plan pl ON pl.payment_id = py.id ORDER BY py.id FOR UPDATE OF py;

-- 3) Guardas (después del bloqueo): abortar si algo del plan no cuadra.
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

-- 4) Respaldo del lote (se conserva solo con COMMIT).
INSERT INTO public.baw18_payments_void_backup (run_id, payment_id, row_data)
SELECT r.run_id, py.id, to_jsonb(py)
FROM payments py
JOIN baw18_plan pl ON pl.payment_id = py.id
CROSS JOIN baw18_run r;

-- 5) Anular (nunca DELETE), revalidando todas las guardas en el UPDATE y exigiendo
--    que se actualicen exactamente las filas del plan.
DO $$
DECLARE n_plan int; n_upd int; v_run uuid;
BEGIN
  SELECT run_id INTO v_run FROM baw18_run;
  SELECT count(*) INTO n_plan FROM baw18_plan;
  UPDATE payments py
  SET status      = 'void',
      voided_at   = now(),
      void_reason = 'BAW-18 ' || pl.regla || ' · lote ' || v_run,
      updated_at  = now()
  FROM baw18_plan pl
  WHERE py.id = pl.payment_id
    AND py.org_id = '81a011c4-4ea6-4b79-924d-73dbe6d35e14'
    AND py.status::text = pl.esperado_status
    AND py.amount = pl.esperado_amount
    AND COALESCE(py.amount_paid, 0) = 0
    AND py.stripe_payment_intent_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM payment_receipts r WHERE r.payment_id = py.id)
    AND NOT EXISTS (SELECT 1 FROM payment_ledger   l WHERE l.payment_id = py.id)
    AND NOT EXISTS (SELECT 1 FROM invoices         i WHERE i.payment_id = py.id AND COALESCE(i.status,'') <> 'cancelled');
  GET DIAGNOSTICS n_upd = ROW_COUNT;
  IF n_upd <> n_plan THEN
    RAISE EXCEPTION 'BAW-18: se anularían % de % cargos; abortando', n_upd, n_plan;
  END IF;
END $$;

-- 6) Bitácora de auditoría, acotada a este lote.
INSERT INTO audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14', 'human', 'fran@zxy.vc', 'payment.void',
       'payment', b.payment_id, b.row_data, jsonb_build_object('status', 'void'),
       jsonb_build_object('ticket', 'BAW-18', 'regla', pl.regla, 'run_id', b.run_id)
FROM public.baw18_payments_void_backup b
JOIN baw18_run r ON r.run_id = b.run_id
JOIN baw18_plan pl ON pl.payment_id = b.payment_id;

-- 7) Postcheck del lote: debe devolver exactamente las filas del plan, ya en 'void'.
SELECT py.id, py.contract_id, py.due_date, py.amount, py.status::text, py.void_reason
FROM payments py
JOIN public.baw18_payments_void_backup b ON b.payment_id = py.id
JOIN baw18_run r ON r.run_id = b.run_id
ORDER BY py.due_date;
-- Postcheck de morosidad: Q4 replica el código ACTUAL, que no conoce 'void'. Para medir
-- el efecto de 6.0, correr «Q4-postB»: Q4 con dos cambios
--   · en el CTE pr:  CASE py.status::text WHEN 'paid' THEN 3 WHEN 'partial' THEN 2 WHEN 'void' THEN 0 ELSE 1 END
--   · en el CTE v, primer WHEN:  WHEN s.payment_status IN ('void','waived') THEN 'anulado'
-- y comparar con el total que aprobó Fran.

ROLLBACK;  -- ← DRY-RUN. Cambiar a COMMIT solo con OK explícito de Fran.
```

**Reversa de un lote** (solo ese lote; si Q0.a dice que `status` es TEXT, quita el cast):

```sql
-- Sustituir <RUN_ID> por el id del lote (está en void_reason y en audit_log.metadata->>'run_id').
-- Solo revierte cargos cuya anulación VIGENTE pertenece a ese lote (void_reason), y audita
-- exclusivamente las filas que el UPDATE realmente cambió (RETURNING).
BEGIN;
WITH rev AS (
  UPDATE payments py
  SET status      = (b.row_data->>'status')::payment_status,
      voided_at   = NULL,
      void_reason = NULL,
      updated_at  = now()
  FROM public.baw18_payments_void_backup b
  WHERE b.run_id = '<RUN_ID>'::uuid
    AND py.id = b.payment_id
    AND py.status::text = 'void'
    AND py.void_reason LIKE '% · lote ' || b.run_id::text
  RETURNING py.id, b.run_id
)
INSERT INTO audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
SELECT '81a011c4-4ea6-4b79-924d-73dbe6d35e14', 'human', 'fran@zxy.vc', 'payment.unvoid', 'payment', rev.id,
       jsonb_build_object('ticket', 'BAW-18', 'run_id', rev.run_id)
FROM rev;
ROLLBACK;  -- ← cambiar a COMMIT solo con OK de Fran
```

---

## 7 · Orden sugerido para Fran

1. **Q0**: confirma tipos, columnas, índices y FKs. Si falta algo, para y avisa.
2. **Q1**: confirma una sola org, 16 unidades y 7 ocupadas, como dice el ticket.
3. **Q4 con `today = '2026-10-02'` y `building_id = NULL`**: compárala contra 57 / $374,900 y contra el detalle por unidad (cómo leerla: §3.2). Revisa en el total `meses_sin_fila_en_payments` (hipótesis principal) y `meses_con_empate_ambiguo`.
4. **Q3**: contratos con `start_date` viejas, `billing_start_date` nulas, `end_date` vencidas o archivados.
5. **Q2**: unidades «Ocupadas» sin contrato vigente y su causa.
6. **Q11**: clasificación propuesta. Fran resuelve los `?`, `REVISAR` y `FRAN DECIDE`.
7. **Q9**: descarta un import o backfill fuera del repo.
8. **Q5-Q8 y Q10**: filas que Mission Control no ve o ve mal, y las que el runner de cobranza selecciona.

Con eso se arma el plan de la Fase B (§6), que va en otro PR y con OK explícito.
