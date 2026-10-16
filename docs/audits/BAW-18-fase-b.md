# BAW-18 · Fase B · Punto de corte del 809

> **Carril:** B-D · **Ticket:** BAW-18 · **Clasificación:** CORRECCIÓN DE DATOS (la ejecuta Fran a mano; nada corre solo).
> **Archivos:**
> - `supabase/migrations/20261015010000_baw18_payments_void.sql`: agrega `'void'` al ENUM `payment_status`.
> - `docs/audits/BAW-18-fase-b.sql`: Fase B1, un solo bloque `DO`, dry-run por defecto.
> - `docs/audits/BAW-18-fase-b-reversa.sql`: deshace **un** lote.
> - Código que reconoce `void` (§5).
>
> **Base:** `origin/main` @ `ad7a34c`. Datos de prod según Q0/Q1/Q3/Q4 corridas por Fran el 15-oct-2026 y su documento consolidado. Este PR no consultó la base.

---

## 0 · Enfoque: punto de corte, no reconstrucción

Los pagos cobrados antes del corte **nunca se registraron** en BaW OS: Fran tiene un Registro Maestro fuera del sistema, y los 6 departamentos de Enrique no tienen registros. Reconstruir esa historia dentro de BaW OS no es posible. Por eso:

- BaW OS cobra **desde `v_fecha_corte`** (default `2026-10-01`). En los contratos que siguen, `billing_start_date = v_fecha_corte`. Mission Control proyecta desde `billing_start_date ?? start_date` (`src/app/page.tsx:179-182`) y el cron no genera meses anteriores (`src/app/api/cron/payments/route.ts:90-96`).
- Las filas de renta `pending` con `due_date < corte` pasan a `void`. **Nunca DELETE.**
- El saldo histórico real (lo que alguien sí debe de antes del corte) queda **fuera** de este script. Ver §4.

## 1 · Qué hace la Fase B1 (este PR)

| # | Cambio | Detalle |
|---|---|---|
| 1 | `v_fecha_corte` parametrizada | Default `2026-10-01` |
| 2 | Anular renta `pending` anterior al corte | En los 6 contratos de Q3. También se anula la renta `pending` que vence **después del nuevo fin** de un contrato que se cierra (oct de D202; jul–oct del contrato viejo de D301) |
| 3 | Cerrar D102 y D202 | `status = v_st_terminado` (`terminated`), `end_date` 2026-10-11 y 2026-09-30. Unidades → `available`. El cargo de oct de D102 **se queda** (deuda real) salvo `v_anular_octubre_d102` |
| 3b | D303 → `available` | Sin contrato |
| 4 | D301 | El contrato viejo `c38fdd8f…` pasa a `v_st_d301_viejo` (`expired`) con fin 2024-12-06. Se crea el nuevo: Rodrigo Jiménez Ontiveros (occupant nuevo si no existe uno activo con ese nombre), 2026-07-01 → 2026-12-31, $8,000 + agua, día 5. La columna `aval` es José Luis Bautista Cano (`supabase/migrations/20260330_contracts_legal.sql:3`); el cotitular D. Jacobsen y la fecha de firma van en `notes`. Cargos jul–oct **pagados** solo si `v_registrar_pagos_d301` |
| 5 | `billing_start_date = corte` | D203, D204, D302 y el nuevo de D301 |
| 6 | `monthly_amount` real | D203, D204, D302 (ver §2: agua). Sus cargos `pending` desde el corte (octubre) se ajustan a la renta nueva, con el agua vigente de su mes (`v_ajustar_cargos_post_corte`). **Estatus y `end_date` no se tocan**: eso es la Fase B2 |
| 7 | Saldo inicial | `v_cargar_saldos_iniciales` default `false`. Con `true` el script **se detiene** (§4) |

**Resultado esperado** (dataset local que reproduce la foto del 2-oct: 57 meses / $374,900 / 30 sin fila; §6):

- se anulan 24 cargos por $178,200;
- Mission Control queda en **solo octubre**: D203 $5,000, D204 $5,550, D301 $8,250 y D302 $4,750, total $23,550;
- con `v_registrar_pagos_d301 = true`, D301 sale de la morosidad y el total baja a $15,300;
- el octubre de D102 ($8,250) queda como deuda real, pero **fuera de Mission Control** (§5).

En prod los montos de mora persistida difieren (cobranza los reescribe a diario), así que las cifras del dry-run de Fran mandan.

## 2 · Para Fran: pasos exactos

**Orden:** (a) mergear este PR y esperar el deploy, para que Cobranza, Cobros, estado de cuenta, reportes y portales reconozcan `void` → (b) migración → (c) dry-run → (d) aplicar.

1. **Migración (una vez).** SQL Editor de Supabase (proyecto `zlcgxmllaeweypyodvzk`) → copiar **completo** `supabase/migrations/20261015010000_baw18_payments_void.sql` → Run. Debe responder `Success. No rows returned`.
2. **Dry-run.** Copiar **completo** `docs/audits/BAW-18-fase-b.sql`, sin editar → Run. Debe salir **en rojo** un error que empieza con:
   ```
   DRY-RUN OK (nada se guardó) · huella=xxxxxxxxxxxx · lote=… · corte=2026-10-01 · hoy=… · contratos_cerrados=3 · contratos_actualizados=3 · contratos_creados=1 · … · veredicto=OK
   ```
   El rojo es el mecanismo: Postgres deshace todo. Revisa `anuladas`, `monto_anulado`, `rentas[…]`, `MC_despues_detalle` y `deuda_fuera_de_MC`. Si empieza con **`DETENTE:`**, no sigas y pega el mensaje en el PR.
3. **Aplicar.** Edita **solo** estas dos líneas y Run con el archivo completo:
   ```sql
   v_aplicar          boolean := true;
   v_esperado_huella  text    := 'xxxxxxxxxxxx';   -- la «huella=…» del paso 2
   ```
   Debe salir una tabla de **una fila** con `veredicto = OK` y el `run_id` del lote. **Guarda el `run_id`**: la reversa lo pide.
   - La huella resume **todo** el plan: todos los parámetros, cargos a anular, cargos a ajustar con su monto, rentas, los 6 contratos y las unidades. Si cualquiera de esas cosas cambió desde el dry-run, sale `DETENTE: la huella del dry-run (…) no coincide…` y no se guarda nada. Repite el paso 2.
4. **No lo vuelvas a correr.** Una segunda corrida da `DETENTE: la Fase B ya se aplicó…`.
5. **Revisar:** Q4 (`docs/audits/BAW-18-datos-809.md`) con `today` = hoy debe mostrar solo octubre.
6. **Reversa** (solo si hace falta): `docs/audits/BAW-18-fase-b-reversa.sql`.
   - Pega el `run_id` en `v_run` → Run (dry-run: `DRY-RUN OK … conflictos=0`).
   - Luego `v_aplicar := true` → Run.
   - Si algo del lote se tocó después (un cobro, un abono, una edición), se detiene y lista los conflictos.

### Parámetros (bloque al inicio del script)

| Parámetro | Default | Para qué |
|---|---|---|
| `v_aplicar` | `false` | `true` solo en el paso 3 |
| `v_esperado_huella` | `NULL` | Copiar del dry-run; si no coincide, no aplica |
| `v_fecha_corte` | `2026-10-01` | Desde aquí cobra BaW OS |
| `v_hoy` | hoy en CDMX | Fecha para estimar la morosidad de MC en el resumen |
| `v_actor` | `fran@zxy.vc` | `audit_log.actor_id` |
| `v_st_anulado` | `void` | Etiqueta de `payment_status` (la crea la migración) |
| `v_st_activo` | `active` | Estatus del contrato nuevo de D301 |
| `v_st_terminado` | `terminated` | D102 y D202 |
| `v_st_d301_viejo` | `expired` | Contrato viejo de D301 (`renewed` también vale) |
| `v_estatus_anulables` | `{pending}` | Estatus que se anulan o ajustan. Si hay `late` antes del corte, el script se detiene y pide agregarlo; `partial` nunca |
| `v_fin_d102` / `v_fin_d202` | `2026-10-11` / `2026-09-30` | Fin real |
| `v_anular_octubre_d102` | `false` | `true` = anular también el cargo de oct de D102 |
| `v_d301_*` | 2026-07-01 → 2026-12-31, $8,000, día 5, Rodrigo Jiménez Ontiveros, cotitular D. Jacobsen, aval José Luis Bautista Cano, firmado 2026-07-11 | Contrato nuevo de D301 |
| `v_registrar_pagos_d301` | `false` | `true` = cargos jul–oct como pagados ($8,250, efectivo, referencia `BaW-D301-2026-MM-1`, fecha de pago = vencimiento). Se detiene si ya hay cargos pagados de D301 en esos meses o un cargo/recibo con referencia `BaW-D301-…` |
| `v_d203_total` / `v_d203_incluye_agua` | `5000` / `true` | Renta que paga el inquilino. «5000 (incluye agua)» → `monthly_amount` = 5000 − agua vigente |
| `v_d204_total` / `v_d204_incluye_agua` | `5300` / `false` | **POR CONFIRMAR**: la tabla no dice si incluye agua. Con `false` se cobran 5300 + agua |
| `v_d302_total` / `v_d302_incluye_agua` | `4500` / `false` | «4500 + 250» |
| `v_ajustar_cargos_post_corte` | `true` | Ajusta a la renta nueva los cargos pendientes ≥ corte (octubre) |
| `v_cargar_saldos_iniciales` (+ `v_saldo_*`) | `false` | Con `true` se detiene (§4). Montos listos: D302 32,256 · D102 26,000 · D202 26,000 · D301 7,450 · D402 80,000 |

**Por qué «incluye agua»:** Mission Control y el cron **suman** el agua al `monthly_amount` (`src/app/page.tsx:188`, `src/lib/billing.ts:91`, `src/app/api/cron/payments/route.ts:100-106`). Si D203 guardara 5000, se le cobrarían 5250. El script resta el agua vigente del edificio para el mes del corte, con la misma regla que el cron (`service_rates` o $250, `src/lib/cobros.ts:56-76`). Al ajustar el cargo de octubre usa esa misma agua, y se detiene si el total de un «incluye agua» no cuadra.

## 3 · Guardas, bitácora y reversa

**Bloqueo.** Antes de validar nada, el script bloquea (`FOR UPDATE`) los contratos, los cargos de esos contratos y las unidades. Por las FKs hacia `payments`, eso también impide colgar abonos, asientos o CFDI nuevos mientras corre. La reversa hace lo mismo con todo lo del lote. Las escrituras revalidan sus condiciones y exigen el número exacto de filas.

**Guarda de dinero, una sola definición.** Un cargo con `amount_paid ≠ 0`, `confirmed_at`, `reference = pi_…`, abonos, bitácora o CFDI vigente **no se anula ni se ajusta**: el script se detiene.

**Guardas `DETENTE`.** El script aborta, sin guardar nada, si:

- hay más de una org;
- la Fase B ya se aplicó;
- falta una etiqueta de ENUM (incluido `void` sin la migración);
- una unidad no aparece exactamente una vez;
- alguno de los 6 contratos no existe, no es de su unidad (con `unit_id` nulo también) o ya no está `active`;
- ya hay otro contrato vigente en D301;
- hay dinero en un cargo a anular o a ajustar;
- queda renta impaga anterior al corte con otro estatus;
- un «incluye agua» no cuadra;
- los pagos de D301 se duplicarían;
- la huella no coincide;
- piden saldos iniciales.

**Bitácora.** Todo va en `audit_log` (`supabase/migrations/20260403_audit_log.sql:1-13`):

- una fila por entidad tocada, con `before_data`/`after_data` y `metadata.run_id`;
- una cabecera `baw18.fase_b.lote` con la huella, los parámetros y el resumen;
- el `crm_contact` que crea el trigger al dar de alta un occupant (`supabase/migrations/20260625_crm_occupant_sync.sql:42-54`) también queda registrado.

**Reversa.** No usa DELETE:

- UPDATE → restaura solo las columnas que cambiaron;
- cargos insertados (pagos de D301) → `void` con `amount_paid = 0`, para que no cuenten como cobrados en ningún agregado;
- contrato insertado → terminado + `archived_at`;
- occupant → `archived_at`;
- crm_contact → `descartado`.

Antes de tocar nada, con las filas bloqueadas, se detiene si:

- un cargo cambió en cualquier columna de dinero (`status`, `amount`, `rent_amount`, `water_fee`, `amount_paid`, `confirmed_at`, `reference`, `paid_date`) o tiene abonos, bitácora o CFDI;
- una columna que tocó el lote cambió;
- el contrato, occupant o crm_contact insertados ya no son idénticos a como se crearon;
- el contrato nuevo tiene cargos que el lote no creó. Con `v_anular_cargos_posteriores` se anulan, pero solo si no tienen dinero;
- reactivar un contrato que el lote cerró dejaría su unidad con dos contratos vigentes (por ejemplo, si después se dio de alta otro en D102).

## 4 · Saldos iniciales: no hay forma limpia hoy (propuesta, no implementada)

Un cargo «Saldo anterior al corte» con `due_date = corte − 1 día` no funciona con el esquema y el código actuales:

- **Mission Control no lo ve:** su mes es anterior a `billing_start_date` y la proyección empieza en el corte (`src/app/page.tsx:179-182`). Si se fechara dentro del corte, competiría con la renta del mes por la fila representante; solo una cuenta (`src/app/page.tsx:166-171`).
- **Cobranza sí lo ve y le persistiría 10% de mora** cada día, como a cualquier fila no pagada (`src/lib/agents/cobranza.ts:87-107`, `src/lib/mora-engine.ts:32-40`): $3,225 sobre los $32,256 de D302 y $8,000 sobre los $80,000 de D402.
- No hay columna para distinguir un saldo de una renta. `ancillary_charge_id` es para cargos accesorios (`supabase/migrations/20260616_03_payments_ancillary_link.sql:15`).

**Propuesta para un PR aparte** (requiere OK de Fran, porque toca esquema y la regla de mora):

1. Migración: `payments.charge_kind text NOT NULL DEFAULT 'rent' CHECK (charge_kind IN ('rent','ancillary','opening_balance'))`.
2. `src/lib/billing.ts` / Mission Control / Cobros: sumar aparte los `opening_balance` no pagados del contrato, sin depender del calendario de meses.
3. Cobranza: decidir si un saldo inicial genera mora (propuesta: no).
4. Cargarlos con un script como este: uno por contrato, `notes = 'Saldo anterior al corte (por confirmar)'`.

## 5 · Código que reconoce `void` (en este PR) y lo que queda pendiente

`void` es un estatus nuevo. Todo lector de `payments` que cuente deuda debe ignorarlo:

| Dónde | Cambio |
|---|---|
| `src/lib/billing.ts:53-71`, `src/lib/billing.ts:97-100` | `isVoidCharge`, `isCollectibleCharge`; `rankPayment('void') = 0` (un cargo vivo del mismo mes siempre gana); `computeMonthStatus` con cargo `void` → estatus `anulado`, adeudo 0. Lo usan Mission Control, Cobros, la cuenta del inquilino y los portales |
| `src/lib/agents/cobranza.ts:177` | Cobranza no persigue ni persiste mora en cargos `void`. Se filtra en JS: un filtro PostgREST con una etiqueta que todavía no existe en el ENUM truena |
| `src/lib/estado-cuenta.ts:157` | El estado de cuenta (PDF, cuentas combinadas) no los suma al saldo |
| `src/app/cobros/page.tsx:182`, `src/app/cobros/[contractId]/page.tsx:285` | Los meses `anulado` no se listan |
| `src/app/api/tenant/[token]/route.ts:72`, `src/app/api/portal/[token]/route.ts:91` | El inquilino no ve los meses anulados |
| `src/app/reportes/page.tsx:58` | Fuera de esperado y pendiente |
| `src/app/units/[id]/page.tsx:356-359` | Etiqueta «Anulado» |
| `src/app/api/cron/usage-snapshots/route.ts:111` | El GMV cobrado no cuenta cargos `void` |
| `src/app/api/payments/[id]/recompute/route.ts:29` | Rechaza (409) recalcular un cargo `void`, que lo regresaría a `pending`. Además la escritura queda condicionada al estatus leído |
| `src/app/api/payments/checkout/route.ts:30` | Antes de crear cualquier PaymentIntent, rechaza (409) cargos `void` o ya pagados |
| `src/app/api/ledger/route.ts:66` | Rechaza (409) marcar pagado un cargo `void` |
| `src/types/index.ts:8` | `PaymentStatus` incluye `'void'` |

Lectores que ya lo excluían: `/api/mora` (`src/app/api/mora/route.ts:58`), conserje (`src/app/api/conserje/cobros/route.ts:30`), y los que solo suman `status = 'paid'` (propietarios, liquidaciones).

**Pendiente después de B1:**

- **Deuda de contratos cerrados fuera de Mission Control y Cobros.** El octubre de D102 sigue `pending`, pero Mission Control y Cobros solo leen contratos `active`/`en_renovacion` (`src/app/page.tsx:123`, `src/app/cobros/page.tsx:126`). Tampoco aparece en `/mora` (`src/app/api/mora/route.ts:90`). Cobranza sí lo persigue (no mira el contrato). El dry-run lo reporta como `deuda_fuera_de_MC`. Decisión de producto pendiente.
- **D203, D204 y D302 siguen `active` con `end_date` vencida** hasta B2. Mission Control y el cron los cobran desde el corte, porque no miran `end_date`. Pero el Calendario no les pinta barra (`src/lib/calendar-occupancy.ts:159-160`, `src/lib/calendar-occupancy.ts:311`), así que «7 ocupadas vs barras» sigue sin cuadrar hasta B2. El runner de renovaciones los pasaría a `en_renovacion` solo en modo real (`src/lib/agents/renovaciones.ts:42-50`, `src/lib/agents/renovaciones.ts:93-97`); hoy está en dry-run porque el flag de WhatsApp está apagado (`src/app/api/cron/renovaciones/route.ts:24-25`).
- **Cuenta del inquilino de D102/D202** (`/cobros/[contractId]`): los meses anulados ya no se listan, pero los meses **sin fila** anteriores a la salida se siguen proyectando desde su `start_date` (`src/app/cobros/[contractId]/page.tsx:271`), porque B1 no les fija `billing_start_date` a los contratos cerrados. Solo afecta esa vista directa.
- **`waived`** se sigue tratando como pendiente (preexistente; follow-up).
- **Dato que no cuadra con «nunca se registraron».** Con los 6 contratos de Q3 (sin `billing_start_date`), Mission Control proyecta 113 meses al 2-oct. Que cuente solo 57 implica unas **55 filas `paid`** anteriores al corte en prod. El dataset de prueba las necesita para reproducir 57 / $374,900. B1 no las toca. Vale verlas con Q5/Q9/Q10 antes de aplicar.

## 6 · Prueba local (sin prod)

- **Base:** Postgres 16 con un esquema que reproduce prod:
  - ENUMs `payment_status` sin `void`, `contract_status`, `unit_status`, `payment_method`;
  - sin `payments.stripe_payment_intent_id`;
  - `occupants` con el trigger de CRM, `payment_receipts`, `payment_ledger` con su CHECK, `invoices` y `audit_log` con su CHECK;
  - los 6 contratos con los ids de Q3;
  - 28 cargos `pending` (jul–oct ×6 + feb D102 + mar–may D202) y 55 `paid`.
- **Q4 de main con `today = 2026-10-02`:** da **57 meses / $374,900 / 30 sin fila**, D302 a 700 días y D203 a 594. Es la foto del ticket.
- **Escenarios** (todos pasan):
  - sin migración → `DETENTE`;
  - dry-run OK (huella, 24 anuladas por $178,200, MC solo octubre);
  - aplicar sin huella → `DETENTE`; con un cargo cambiado entre dry-run y aplicación → `DETENTE` por huella;
  - aplicar → OK; segunda corrida → `DETENTE`;
  - reversa: dry-run → aplicar → **las 111 filas originales quedan idénticas**;
  - cobro posterior de un cargo ajustado → la reversa se detiene;
  - **carrera**: un pago concurrente queda bloqueado mientras corre la reversa;
  - CFDI en el cargo a ajustar → `DETENTE`;
  - cargo posterior del cron con recibo → la reversa se detiene aun con `v_anular_cargos_posteriores`;
  - pago de D301 ya registrado → `DETENTE`;
  - agua del edificio = $300 → D203 queda 4,700 + 300 = 5,000;
  - contrato nuevo o crm_contact editados después → la reversa se detiene;
  - `unit_id` nulo → `DETENTE`;
  - variante con pagos de D301 y octubre de D102 → MC $15,300; su reversa con un cargo del cron sin dinero → OK y 111 filas idénticas;
  - guardas: 2 orgs, `late`, saldos;
  - reversa de los pagos de D301 → `void` con `amount_paid = 0`; el criterio de GMV del snapshot da $0;
  - otro contrato vigente en D102 dado de alta después del lote → la reversa se detiene;
  - cambiar un parámetro (la renta de D301) entre dry-run y aplicación → `DETENTE` por huella.
- **Código:**
  - `tests/cobros/void-charges.test.ts`: cobranza, `rankPayment`, `computeMonthStatus` y `computeEstadoCuenta` con `void`;
  - `tests/cobros/void-api-guards.test.ts`: recompute y checkout responden 409 ante `void`; checkout no llega a llamar a Stripe (simulado).

## 7 · Fase B2 (NO en este PR; sin SQL)

Se hará a partir del **expediente digital** que arman Fran y el Lic. Hugo Sierra. Las renovaciones de las unidades de Enrique probablemente serán en enero. Alcance previsto:

1. **D401, D402 y D404:** dar de alta occupant + contrato (hoy no existen en BaW OS), con las fechas, renta y agua del contrato digitalizado; `billing_start_date = corte`; unidades → `occupied`. Deudas estimadas: D402 ~$80,000.
2. **Renovar D203, D204 y D302** con los contratos nuevos: estatus, `start_date`/`end_date` reales y renta confirmada. Hasta entonces siguen `active` con `end_date` vencida (§5).
3. **D102:** corregir el inicio real (11-feb-2026 según Fran; Q3 dice 2026-02-01) si el expediente lo confirma.
4. **Saldos iniciales** (§4), una vez aprobada la propuesta: D302 ~$32,256, D402 ~$80,000, grupo Núñez $52,000 (D102/D202), D301 marzo $7,450.
5. Mismo formato: bloque `DO`, dry-run, huella, guardas, bitácora por lote y reversa.
