# ADR-018: Stripe Checkout Pattern para reservas públicas

**Status:** Accepted
**Date:** 2026-05-14
**Deciders:** Fran, Computer
**Sprint:** 5B
**Related:** ADR-017 (Public booking surface), ADR-009 (Stripe payouts interno)

---

## Contexto

Sprint 5B introduce el primer flujo de pago **iniciado por el huésped final** (no por el operador interno). Hasta ahora Stripe en BaW OS se usaba solo para payouts y reconciliación interna (ADR-009). Ahora necesitamos cobrar a un desconocido por una reserva concreta de una unidad concreta en un rango de fechas concreto, y materializar esa reserva en nuestra DB solo si el pago se confirma.

Las preocupaciones críticas son: **double-booking**, **pagos sin reserva**, **reservas sin pago**, **webhook perdido**, **cobro duplicado** y **fraude/chargebacks**.

## Decisión

### 1. Modo: Stripe Checkout (hosted) — no Payment Intents custom

- Usamos **Stripe Checkout Sessions** alojadas en Stripe (`mode: 'payment'`), no construimos UI de tarjeta con Elements en v1.
- Razones: PCI scope mínimo, soporte automático de 3DS/SCA, Apple Pay/Google Pay/OXXO out-of-the-box, mejor para conversión móvil, menos código que mantener.
- En v2 (post-validación) podemos migrar a Elements embebido si conversión lo justifica.

### 2. Flujo end-to-end

```
1. Huésped en /reservar/[unitId] elige fechas, completa datos
2. Frontend → POST /api/public/v1/bookings/checkout con Idempotency-Key
3. Server:
   a. Valida disponibilidad real (FOR UPDATE de unit + check de holds y reservations)
   b. Crea hold en reservation_holds (expira en 15 min)
   c. Crea Stripe Checkout Session con metadata { hold_id, unit_id, from, to }
   d. Devuelve url de Stripe
4. Huésped redirigido a Stripe; completa pago
5. Stripe → POST /api/public/v1/webhooks/stripe (firma Ed25519 verificada)
6. Server:
   a. Lee evento checkout.session.completed
   b. Verifica idempotencia (tabla stripe_events procesados)
   c. Promueve hold a reservation confirmada en transacción
   d. Envía email confirmación
7. Huésped redirigido a /confirmacion/[bookingId] (success_url)
8. Si Stripe expira sin pago: hold expira en 15 min, cron limpia
```

### 3. Idempotencia (en 3 capas)

**Capa 1 — cliente → server:**
- Frontend genera `Idempotency-Key` UUID al iniciar checkout, lo guarda en `sessionStorage`.
- Server: tabla `checkout_idempotency` con `key, response, expires_at`. Si llega misma key, devuelve respuesta cacheada.

**Capa 2 — server → Stripe:**
- Pasamos el mismo idempotency key a Stripe API. Si reintentamos, Stripe no crea sesión duplicada.

**Capa 3 — Stripe → server (webhook):**
- Tabla `stripe_processed_events` con `event_id PRIMARY KEY`. Antes de procesar, INSERT con `ON CONFLICT DO NOTHING`. Si conflicto, ack y skip.

### 4. Prevención de double-booking

**Constraint DB:**
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations
ADD CONSTRAINT no_overlap_per_unit
EXCLUDE USING gist (
  unit_id WITH =,
  daterange(from_date, to_date, '[)') WITH &&
) WHERE (status IN ('confirmed', 'checked_in'));
```

**Hold equivalente:**
```sql
CREATE TABLE reservation_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id),
  from_date date NOT NULL,
  to_date date NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  stripe_session_id text UNIQUE,
  created_at timestamptz DEFAULT now(),
  EXCLUDE USING gist (
    unit_id WITH =,
    daterange(from_date, to_date, '[)') WITH &&
  ) WHERE (expires_at > now())
);
```

Esto garantiza que dos huéspedes simultáneos NO pueden mantener hold sobre las mismas fechas, incluso si llegan en la misma milisegundo.

### 5. Webhook de seguridad

- **Verificar firma Stripe siempre** con `STRIPE_WEBHOOK_SECRET`.
- **Endpoint exento** del middleware Next.js (no parseo de body, leer `raw`).
- **Eventos relevantes**:
  - `checkout.session.completed` → promover hold a reservation
  - `checkout.session.expired` → eliminar hold
  - `charge.refunded` → marcar reservation como `refunded`
  - `charge.dispute.created` → alertar a Hugo (cuando esté Alicia conectada) + flag interno

### 6. Reconciliación (red de seguridad)

- **Cron job cada 15 min** (Vercel Cron) que:
  - Lista Stripe sessions `completed` en últimas 24h
  - Verifica que cada una tenga reservation correspondiente
  - Si falta, intenta promoverla (idempotente)
  - Si imposible (ej. hold ya expiró y otra reserva tomó las fechas), alerta a operaciones para refund manual

### 7. Refunds y cancelaciones

- v1: no exponemos cancelación al huésped. Si quiere cancelar, contacto humano/agente. Fran/Alicia ejecuta refund desde dashboard interno.
- v2: política de cancelación configurable por unidad, refund automático parcial.

### 8. Configuración Stripe

- **Cuenta Stripe**: usar la **misma cuenta** ya conectada a baw-os (Sprint 4) para v1. Si en el futuro hay edificios de propietarios distintos, usaremos **Stripe Connect** con accounts separados.
- **Productos**: NO creamos productos pre-cargados. Cada Checkout Session usa `line_items` ad-hoc con `price_data` calculado:
  ```ts
  line_items: [{
    price_data: {
      currency: 'mxn',
      unit_amount: totalCents,
      product_data: {
        name: `Reserva ${unitName} · ${nights} noches`,
        description: `${from} → ${to} · ${guests} huéspedes`,
      }
    },
    quantity: 1
  }]
  ```
- **Tax**: usar **Stripe Tax** si está disponible para MX, sino calcular IVA manual (16%) en `quote`.
- **Currency**: MXN por defecto. USD como opción futura.

### 9. Variables de entorno nuevas

```
STRIPE_SECRET_KEY=sk_test_... / sk_live_...
STRIPE_WEBHOOK_SECRET_PUBLIC=whsec_...   # separado del interno
STRIPE_PUBLISHABLE_KEY=pk_...            # solo si migramos a Elements
PUBLIC_BOOKING_SUCCESS_URL=https://...
PUBLIC_BOOKING_CANCEL_URL=https://...
```

(Mantenemos `STRIPE_WEBHOOK_SECRET` interno separado para no romper Sprint 4.)

## Consecuencias

### Positivas

- PCI scope reducido (huésped nunca toca tarjeta en nuestro dominio).
- Stripe maneja 3DS, Apple/Google Pay, OXXO sin código extra.
- Idempotencia en 3 capas evita 99% de casos de doble cobro.
- Constraint GIST en DB evita 100% de double-booking incluso si hay bug en hold logic.
- Reconciliación cron es una red de seguridad final.

### Negativas

- Branding limitado en página de pago (Stripe Checkout). Aceptable en v1.
- Si Stripe cae, no podemos cobrar. No hay alternativa de pago en v1.

### Riesgos

- **Hold expira mientras huésped paga lento.** Mitigación: 15 min es generoso. Si expira y otro reserva, Stripe webhook llega → reconciliación detecta → refund automático con mensaje claro.
- **Tasa de cambio MXN/USD si pagan con tarjeta extranjera.** Stripe lo maneja, pero el huésped puede ver cargos distintos. Mitigación: documentar en FAQ.

## Notas de implementación

1. **Probar primero con `4242 4242 4242 4242` en test mode** durante toda la implementación.
2. **No habilitar live mode** hasta tener: webhook funcional, reconciliación cron, E2E test pasando, email funcional, política de cancelación documentada.
3. **Logs**: cada Checkout Session debe loggear `session_id`, `idempotency_key`, `hold_id`, `unit_id`. Sentry o equivalente cuando esté disponible.
