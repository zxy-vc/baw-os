# Conector v1 para Engrane — `/api/connectors/v1/`

> ENG-624 · Decisión de Fran (2026-10-18): **BaW OS es el sistema especializado y Engrane se conecta encima, de solo lectura. Cada dato vive en un solo lugar.**
> Reglas versionadas como `connectors-v1.2026-10-21` (campo `source.rules` de cada respuesta). Si una regla cambia, cambia la versión y este documento en el mismo PR.

---

## 1 · Qué es y qué no es

- **Solo lectura.** Las rutas exportan únicamente `GET`. Lo único que el conector escribe es su propia bitácora de lecturas (`connector_access_log`, §2.3). Nada de reservas, unidades, contratos ni pagos se crea o modifica desde aquí.
- **Separado de `/api/v1`.** `/api/v1` es la API de agentes (credenciales `sk_live_…` de un agente del catálogo). El conector usa llaves propias `ck_live_…` que **no** pertenecen a un agente y **no** sirven en `/api/v1` (ni al revés).
- **No arregla las pantallas.** El calendario, el sitio público y /cobros siguen contando a su manera; §5 documenta en qué difieren del conector para que nadie se sorprenda.

## 2 · Llaves

### 2.1 Modelo

| Regla | Cómo se cumple |
|---|---|
| Una llave por organización × espacio de Engrane | `connector_keys (org_id, consumer='engrane', consumer_ref=<id del espacio>)`; índice único parcial: a lo más **una activa** por espacio |
| Nunca una llave de servicio global | Toda llave tiene `org_id NOT NULL`; todo lo que lee se filtra por las unidades de esa org |
| Limitable por edificio | `building_ids` (`NULL` = todos los edificios de la org) |
| Limitable por dataset | `datasets` ⊆ `units, reservations, occupancy, revenue, guests` (p.ej. una llave sin `guests`) |
| Revocable | `status='revoked'` con efecto inmediato; un trigger impide reactivarla. Rotar = revocar + crear |
| Hash en base | Solo se guarda `sha256(llave)` + prefijo de 16 caracteres; el valor completo se muestra **una vez** al crearla |
| Vencimiento opcional | `expires_at` |

### 2.2 Administración (sesión humana, `pm_owner` / `pm_admin` de la org activa)

```bash
# Crear (la respuesta trae api_key UNA sola vez)
curl -X POST https://baw-os.vercel.app/api/admin/connectors/keys \
  -H 'content-type: application/json' --cookie '<sesión>' \
  -d '{"consumer_ref":"<id del espacio en Engrane>","label":"Engrane · Mateos 809","building_ids":["<uuid edificio>"]}'
# Opcionales: "datasets":["units","occupancy"], "expires_in_days":365

GET    /api/admin/connectors/keys                    # listar (sin hash)
DELETE /api/admin/connectors/keys/<id>               # revocar
GET    /api/admin/connectors/keys/<id>/access-log    # rastro de lecturas (?limit=100, máx 500)
```

### 2.3 Rastro de cada lectura

Cada petición con una llave **reconocida** (también las rechazadas: revocada, vencida, dataset o edificio fuera de alcance, parámetros inválidos) deja una fila en `connector_access_log`:

- **quién:** `key_id`, `consumer`, `consumer_ref`, `ip`, `user_agent`
- **cuándo:** `created_at`
- **qué:** `dataset`, `endpoint`, `query` (parámetros tal cual), `outcome`, `http_status`, `row_count`

Es *append-only* (trigger bloquea `UPDATE`) y **fail closed**: si la fila no se pudo escribir, la respuesta es `503 audit_unavailable` y no se entregan datos. Una llave no reconocida no deja rastro (no hay org a quién atribuirla).

## 3 · Uso

```
GET /api/connectors/v1/<dataset>?from=2026-10-01&to=2026-11-01
Authorization: Bearer ck_live_<48 hex>
```

### 3.1 Sobre de respuesta

```jsonc
{
  "data": …,
  "period": { "from": "2026-10-01", "to": "2026-11-01" },  // si el dataset lleva periodo
  "pagination": { "next_cursor": "…", "limit": 100 },      // si el dataset es lista
  "as_of": "2026-10-21T15:04:05.123Z",                      // momento de la lectura (UTC)
  "source": {
    "system": "baw-os", "api": "connectors/v1", "dataset": "occupancy",
    "rules": "connectors-v1.2026-10-21",
    "rules_doc": "https://github.com/zxy-vc/baw-os/blob/main/docs/connectors-v1.md"
  },
  "scope": { "org_id": "…", "building_ids": "all" }        // o la lista de edificios de la llave
}
```

Errores: `{ "error": { "code", "message" }, "as_of", "source" }`. Todas las respuestas llevan `Cache-Control: no-store`.

| HTTP | `code` | Cuándo |
|---|---|---|
| 401 | `missing_credentials` / `invalid_key` | Sin `Bearer`, formato distinto a `ck_live_…`, o llave inexistente |
| 401 | `key_revoked` / `key_expired` | Llave revocada o vencida |
| 403 | `dataset_not_allowed` | La llave no incluye ese dataset |
| 403 | `out_of_scope` | `building_id` / `unit_id` fuera del alcance (no distingue "no existe" de "no es tuyo") |
| 400 | `invalid_period`, `period_too_long`, `invalid_limit`, `invalid_cursor`, `invalid_building_id`, `invalid_unit_id` | Parámetros |
| 503 | `audit_unavailable` | No se pudo escribir la bitácora |

### 3.2 Parámetros comunes

- `from` (incluido) y `to` (**excluido**), `yyyy-mm-dd`, máximo 366 noches. Obligatorios salvo en `units`. Octubre completo = `from=2026-10-01&to=2026-11-01`.
- `building_id`, `unit_id` (uuid, opcionales): filtran dentro del alcance de la llave.
- Listas (`units`, `reservations`, `guests`): `limit` (100 por defecto, máx 500) y `cursor` (el `next_cursor` de la página anterior). Orden estable por `id`.
- Las fechas de los datos (`check_in`, `check_out`, meses) son **fechas locales del inmueble**; `as_of` es UTC.
- Leer es idempotente: la misma consulta devuelve los mismos datos mientras BaW OS no cambie (solo cambia `as_of`).

### 3.3 Datasets

| Endpoint | Devuelve |
|---|---|
| `GET /units` | `id, building_id, building_name, number, type, bedrooms, bathrooms, max_guests, archived_at`. **Sin** `units.status` (es manual, no es ocupación → usar `/occupancy`) ni tarifa de lista (§4.2). |
| `GET /reservations` | Reservas con ≥1 noche en el periodo, estatus `confirmed`, `checked_in`, `checked_out`, `cancelled` (las cotizaciones `tentative` nunca salen). Campos: `id, unit_id, building_id, check_in, check_out, nights, status, counts_for_revenue, channel, channel_raw, external_ref, guests_count, currency, total_mxn, nightly_rate_mxn, paid_mxn, payment_status, in_period{nights, revenue_mxn, collected_mxn}, created_at, updated_at`. Sin nombre ni contacto del huésped. |
| `GET /occupancy` | `data.totals` y `data.by_unit[]` con `nights_in_period, blocked_nights, available_nights, occupied_nights, occupied_nights_by_instrument{reservation, contract}, occupancy_rate` (§4.1). |
| `GET /revenue` | `data.totals`, `data.by_channel[]`, `data.by_month[]`, `data.by_unit[]` con `reservations, nights, revenue_mxn, collected_mxn, outstanding_mxn, adr_mxn` (§4.3). El detalle por reserva es `in_period` de `/reservations`. |
| `GET /guests` | Huéspedes de paso de reservas firmes: **solo** `reservation_id, unit_id, guest_name, check_in, check_out`. Nada de teléfono, correo, documentos, identificaciones ni acompañantes. |

`channel` (fuente de la reserva): `airbnb` · `booking` · `lodgify` · `direct` · `other` · `unknown`. Se toma de `reservations.channel` (lo escriben Channex y la cotización telefónica) y, si está vacío, de `reservations.platform` (lo captura la pantalla /reservations). Sin ninguno → `unknown`: **no** asumimos "directa". `channel_raw` trae el valor original.

---

## 4 · Las tres cifras: una sola regla cada una

Las reglas viven en código en un único archivo, `src/lib/connectors/rules.ts`, y todos los endpoints las usan. Esto es lo que Engrane debe poner en su estampa.

### 4.1 Ocupación

**Regla.** Por unidad y por noche del periodo `[from, to)`:

1. **Ocupada** si la cubre una estancia firme:
   - reserva `confirmed`, `checked_in` o `checked_out`: noches `[check_in, check_out)`;
   - contrato `active`, `renewed`, `en_renovacion` o `expired`: noches `[start_date, end_date]` (`end_date` es inclusivo en BaW OS; sin `end_date` = abierto).
   Una noche cubierta por reserva y contrato a la vez cuenta **una** vez (se atribuye a la reserva).
2. **Bloqueada** si la cubre un bloqueo operativo (`unit_blocks`, fechas inclusivas) y no está ocupada.
3. `available_nights = nights_in_period − blocked_nights`.
4. `occupancy_rate = occupied_nights ÷ available_nights` (4 decimales; `null` si no hubo noches disponibles). El total es Σ ocupadas ÷ Σ disponibles — **no** el promedio de los porcentajes por unidad.

No cuentan para nada: cotizaciones `tentative`, holds del checkout público, reservas `cancelled`, contratos `pending` (aún no arrancan con certeza) y `terminated` (BaW OS no guarda la fecha real de terminación). Las áreas comunes (`type='COMMON'`) no entran al denominador. Una unidad archivada deja de contar desde la fecha de `archived_at`.

**Por qué.**
- Ocupación es un **hecho** (alguien estuvo o estará con certeza), no disponibilidad. Tentativas y holds son intención; si contaran, la cifra subiría y bajaría sola cuando los apartados vencen.
- Un bloqueo de mantenimiento no es una noche que se pudo vender: sacarlo del denominador evita castigar la ocupación por una unidad en obra (criterio estándar de "noches disponibles" en hotelería).
- Se incluyen contratos porque una unidad rentada a largo plazo **está** ocupada; `occupied_nights_by_instrument` deja ver cuánto es reserva y cuánto contrato.

**Estampa sugerida:** «Ocupación BaW OS: noches ocupadas ÷ noches disponibles (sin bloqueos) · al {as_of}».

### 4.2 Tarifa

**Regla.** La tarifa que reporta el conector es la **realizada**:

- por reserva: `nightly_rate_mxn = total_price ÷ noches` (redondeo a centavos);
- por periodo: `adr_mxn = ingreso devengado del periodo ÷ noches vendidas del periodo` (§4.3).

El conector **no** calcula tarifa de lista (base × temporada, ni precio fijo por rango), ni la expone en `/units`.

**Por qué.** Hoy BaW OS tiene dos cotizadores que no coinciden: el calendario y /quotes aplican `units.base_rate_mxn × multiplicador de temporada` (y el precio fijo por rango gana), mientras que el checkout público cobra `base_rate_mxn × noches + limpieza + IVA` sin temporadas. Cualquiera de las dos sería una cifra "de BaW OS" distinta según la pantalla. La tarifa realizada sale del dato que sí es único — lo que quedó pactado en la reserva — y es lo que importa para el negocio.

**Ojo con `total_price`:** es el total que registró la fuente. En reservas de Channex es el monto que envía la OTA; en el checkout público incluye limpieza e IVA; en captura manual es lo que se pactó. El conector no lo descompone.

**Estampa sugerida:** «Tarifa realizada (total pactado ÷ noches) · BaW OS · al {as_of}».

### 4.3 Pago / ingreso

**Regla.** Solo **reservas firmes** (`confirmed`, `checked_in`, `checked_out`):

- **Devengado** (`revenue_mxn`): `total_price` de la reserva repartido por noche en centavos (misma cuota por noche; los centavos sobrantes a las primeras noches). Al periodo le toca la suma de sus noches; una reserva que cruza meses se parte. La suma de periodos contiguos es exactamente la suma de los totales, sin doble conteo.
- **Cobrado** (`collected_mxn`): `amount_paid` de la reserva, repartido por noche igual que el devengado.
- **Pendiente** (`outstanding_mxn`) = devengado − cobrado.
- **Noches** = noches vendidas del periodo (coinciden con `occupied_nights_by_instrument.reservation` de `/occupancy` salvo noches cubiertas también por un contrato).

**Nunca se leen** `payments`, `payment_receipts` ni `payment_ledger`.

**Por qué.**
- En BaW OS hay tres "pagos" que no se suman entre sí: `payments` es el **cargo** mensual de un contrato (con su `amount_paid`), `payment_receipts` son los **abonos** de ese cargo (ya incluidos en `payments.amount_paid`: sumarlos otra vez duplica) y `reservations.total_price/amount_paid` es el dinero de una **reserva**. Para el conector, el pago de una estancia vive en un solo lugar: la reserva.
- Se reparte por noche (devengo) para que ingreso, noches y ocupación usen el mismo calendario y el ADR salga consistente.
- BaW OS no guarda **cuándo** se cobró una reserva, así que "cobrado" es lo registrado como pagado asignado a las noches, **no** flujo de caja.
- BaW OS no guarda comisión ni payout de Airbnb/Booking: el ingreso es el **bruto registrado**, no lo que depositó la plataforma.
- Rentas de contratos (LTR/MTR) **no** están en el ingreso v1 (sí en ocupación). Si Engrane las necesita, la regla será `payments.amount` (cargo) y `payments.amount_paid` (cobrado) por `due_date`, nunca abonos sueltos.

**Estampa sugerida:** «Ingreso devengado por noche, bruto registrado (no incluye comisiones de plataforma ni rentas de contratos) · BaW OS · al {as_of}».

---

## 5 · Diferencias con las pantallas de BaW OS (no se tocan en este cambio)

| Cifra | Pantalla | Cómo cuenta la pantalla | Conector |
|---|---|---|---|
| Ocupación | Calendario (`computeKpis`, `src/lib/calendar-occupancy.ts`) | Denominador = unidades × días **sin** restar bloqueos; solo reservas con `organization_id` de la org | Resta bloqueos; reservas por unidad (incluye las del checkout público sin `organization_id`) |
| Ocupación | Disponibilidad pública (`/api/public/v1/units/[slug]/availability`) | "No disponible" = reservas firmes + tentativas vigentes + holds + bloqueos; ignora contratos | Es otra pregunta (¿se puede vender?) — el conector no la usa |
| Ocupación | Mission Control (`units.status`) | Campo manual | No se usa |
| Tarifa | Calendario / /quotes | base × temporada (precio fijo gana) | Realizada |
| Tarifa | Checkout público (`computeQuote`) | base × noches + limpieza + IVA, sin temporadas | Realizada |
| Pago | /cobros, cuenta del inquilino | Cargos y abonos de contratos | No se leen (solo reservas) |

## 6 · Ejemplo verificable (fixture de pruebas)

`tests/connectors/fixture.ts`, octubre 2026 (`from=2026-10-01&to=2026-11-01`):

| Unidad | Qué hay | Ocupadas | Bloqueadas | Disponibles | Tasa |
|---|---|---|---|---|---|
| 101 (STR) | Airbnb 28-sep→03-oct · Booking 10→14-oct · cotización 20→25 · cancelada 15→17 · directa 30-oct→02-nov · bloqueo 5-6 oct | 2 + 4 + 2 = 8 | 2 | 29 | 0.2759 |
| 102 (LTR) | contrato al 15-oct · contrato `pending` desde 20-oct · bloqueo 10-12 sobre el contrato | 15 | 0 | 31 | 0.4839 |
| 201 (STR) | Lodgify 05→08-oct · sin fuente 01→02-oct | 4 | 0 | 31 | 0.1290 |
| 105 (STR) | archivada el 21-oct | 0 | 0 | 20 | 0 |
| **Total** | | **27** | **2** | **111** | **0.2432** |

Ingreso de octubre: 5 reservas, 12 noches, devengado **$11,400.00** (2,000 + 3,999.99 + 2,000 + 2,400 + 1,000.01), cobrado **$5,400.00**, pendiente $6,000.00, ADR **$950.00**.

## 7 · Activación

1. Aplicar `supabase/migrations/20261021010000_connector_keys.sql` en Supabase (crea `connector_keys` y `connector_access_log`; no toca tablas existentes) y agregar su sha256 a `supabase/ci/applied-migrations.sha256`.
2. Deploy.
3. Crear la llave del espacio de Engrane (§2.2) y entregarla por un canal seguro.

## 8 · Pendientes conocidos (fuera de v1)

- Sin rate limit propio (el rastro permite detectar abuso; se puede agregar por llave).
- Sin UI para gestionar llaves (solo API de admin).
- El checkout público (`/api/public/v1/webhooks/stripe`) inserta reservas sin `organization_id` ni `channel`: el conector las encuentra por su unidad pero su fuente sale `unknown`.
- Rentas de contratos en `/revenue` (regla propuesta en §4.3).
