# Sprint 5B — Public Booking Engine (Mateos 809P)

**Estado:** Planeación aprobada · Implementación pendiente
**Inicio estimado:** 2026-05-15
**Duración estimada:** 60–80 horas (2–3 semanas calendario con un agente)
**Objetivo de negocio:** Activar la primera fuente de ingreso directo de BaW operando un edificio bajo marca propia, con motor de reservas con pago real.

---

## Resumen ejecutivo

Construir el primer **frente público hacia el huésped final** dentro del repo `baw-os`: landing del edificio Mateos 809P + motor de reservas con Stripe Checkout. La marca del edificio es **totalmente independiente** de BaW OS — el huésped no debe percibir la plataforma operadora.

Sprint 5A (Alicia third-party) queda **pausado** hasta que 5B esté en producción. Razón: el motor de reservas genera revenue inmediato; los agentes operativos amplifican capacidad pero dependen de tener operaciones reales que orquestar.

---

## Alcance

### Incluido (v1)

- Landing del edificio Mateos 809P (hero, galería, amenidades, mapa, FAQ, footer)
- Lista de unidades con filtros (huéspedes, fechas)
- Detalle de unidad con calendario de disponibilidad real
- Wizard de reserva: fechas → huéspedes → datos → pago
- Stripe Checkout (hosted) con pago en MXN
- Hold temporal de fechas (15 min) durante checkout
- Confirmación automática post-pago + email
- API pública `/api/public/v1/*` sin auth, con rate limit
- Theming OKLCH independiente para Mateos 809P
- SEO básico (metadata, OG, JSON-LD, sitemap)
- Feature flag para lanzamiento gradual

### Fuera (deferred)

- Dominio propio (`mateos809p.com`) — v1 vive en `baw-os.vercel.app/mateos-809p`
- Stripe Elements custom — usamos Checkout hosted
- Cancelación self-service del huésped — manual via operador
- Política de cancelación configurable por unidad
- Multi-edificio en la UI (preparado pero solo 809P activo)
- i18n EN/ES — v1 solo ES
- Reseñas de huéspedes
- Programa de referidos

---

## Workstreams

### WS-1 — Backend público (~20h)

**Owner:** Computer
**Bloqueantes:** ninguno (puede arrancar ya)

1. Migración Supabase `2026_05_15_public_booking.sql`:
   - Tabla `buildings` (si no existe): `id, slug UNIQUE, name, description, hero_url, location, amenities jsonb, faq jsonb, is_public_listed bool`
   - Campos en `units`: `slug UNIQUE, public_name, public_description, hero_url, gallery jsonb, base_rate_mxn, cleaning_fee_mxn, max_guests, amenities jsonb, is_publicly_bookable bool`
   - Tabla `reservation_holds` con constraint GIST (ver ADR-018)
   - Constraint `no_overlap_per_unit` en `reservations`
   - Tabla `stripe_processed_events` (idempotencia webhook)
   - Tabla `checkout_idempotency` (idempotencia cliente)
   - Vistas: `v_public_buildings`, `v_public_units`, `v_public_availability`
   - Policies: SELECT a `anon` solo sobre vistas
2. Endpoints en `app/api/public/v1/`:
   - `GET buildings/[slug]/route.ts`
   - `GET buildings/[slug]/units/route.ts` (con query params)
   - `GET units/[slug]/route.ts`
   - `GET units/[slug]/availability/route.ts`
   - `POST quotes/route.ts`
   - `POST bookings/checkout/route.ts`
   - `POST webhooks/stripe/route.ts`
3. Rate limit middleware (Upstash o KV) — 60 req/min por IP en GETs, 10 req/min en POSTs.
4. CORS estricto a dominios de producción y previews.
5. Tests unitarios: cálculo de quote, validación de disponibilidad, idempotencia.

### WS-2 — Frontend landing (~25h)

**Owner:** Computer
**Bloqueante:** decisión de marca (WS-3 parcial)

1. Grupo de rutas `app/(public-booking)/` con layout limpio
2. Páginas:
   - `mateos-809p/page.tsx`
   - `mateos-809p/unidades/page.tsx`
   - `mateos-809p/unidades/[slug]/page.tsx`
   - `mateos-809p/reservar/[unitId]/page.tsx`
   - `mateos-809p/confirmacion/[bookingId]/page.tsx`
3. Componentes nuevos en `components/public-booking/`:
   - `BuildingHero`
   - `UnitCard`
   - `UnitGallery` (con lightbox)
   - `BookingCalendar` (react-day-picker o similar)
   - `GuestSelector`
   - `PriceBreakdown`
   - `AmenityGrid`
   - `LocationMap` (Mapbox o Leaflet)
   - `FAQAccordion`
   - `BookingWizard` (multi-step)
4. Mobile-first: 70%+ tráfico móvil esperado. Breakpoints sm/md/lg.
5. Loading/skeleton states; error boundaries por sección.
6. Cliente API tipado con zod schemas compartidos con backend.

### WS-3 — Identidad Mateos 809P (~8h)

**Owner:** Fran (decisión) + Computer (ejecución)
**Bloqueante:** ninguno — paralelo a WS-1

1. Computer propone 3–4 direcciones de marca (en archivo `BRANDING_DIRECTIONS_809P.md`):
   - Cada una con: nombre propuesto, tagline, paleta OKLCH (5 colores), tipo (display + body), tono de voz, referencias visuales
2. Fran elige una dirección (o pide variaciones)
3. Computer materializa:
   - `baw-design/themes/mateos-809p/tokens.json` con paleta final
   - `baw-design/themes/mateos-809p/typography.ts`
   - Logo / wordmark SVG (Computer puede generar versión inicial; Fran refina si quiere)
   - Tone of voice doc para copywriting

### WS-4 — Stripe + Email (~15h)

**Owner:** Computer
**Bloqueante:** WS-1 endpoints listos

1. Setup Stripe test mode (keys en Vercel env)
2. Implementar `POST /bookings/checkout` con creación de Session
3. Implementar webhook con verificación de firma
4. Implementar reconciliación cron (Vercel Cron cada 15 min)
5. Email confirmación con Resend:
   - Template ES con datos de reserva
   - Email a huésped + copia a operaciones
6. Email de cancelación / refund (template, no flow)

### WS-5 — QA + lanzamiento (~10h)

**Owner:** Computer + Fran
**Bloqueante:** todos los anteriores

1. Playwright E2E: flow completo búsqueda → pago test → confirmación
2. Test de double-booking simultáneo (2 sesiones paralelas a misma unidad/fechas)
3. Test de webhook con Stripe CLI replay
4. Smoke en preview con tarjeta test
5. Activar feature flag en producción
6. Smoke en producción con tarjeta real $1 MXN (Fran)
7. Refund inmediato del smoke

---

## Cronograma sugerido

| Semana | Foco |
|---|---|
| Semana 1 (15–21 May) | ADRs aprobados (✓), WS-1 backend completo, WS-3 marca decidida, esqueleto WS-2 |
| Semana 2 (22–28 May) | WS-2 frontend al 80%, WS-4 Stripe funcional en test, WS-5 E2E parcial |
| Semana 3 (29 May – 4 Jun) | Pulido visual, copy final, contenido cargado, smoke en producción, lanzamiento |

---

## Definición de Hecho (DoD)

Sprint 5B se cierra cuando:

1. Un huésped puede reservar una unidad real de Mateos 809P en producción, pagar con Stripe, y recibir email de confirmación.
2. La reserva aparece en el dashboard interno de BaW OS con todos sus datos.
3. Double-booking es imposible (test automatizado lo confirma).
4. Stripe webhook procesa correctamente eventos `completed` y `expired`.
5. Reconciliación cron está activa.
6. Smoke con tarjeta real $1 MXN funcionó + refund OK.
7. ADR-017 y ADR-018 mergeados a main.
8. Notion bitácora actualizada.

---

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Double-booking en producción | Baja | Alto | Constraint GIST + hold + tests |
| Webhook Stripe pierde evento | Media | Alto | Idempotencia + reconciliación cron |
| Confusión de marca BaW vs 809P | Media | Medio | Separación total visual + footer legal claro |
| Stripe rechaza pago de huésped real | Alta | Bajo | Soporte por WhatsApp en footer |
| Contenido fotográfico no llega a tiempo | Media | Medio | Placeholders y deploy con feature flag |

---

## Lo que Fran debe entregar

1. **Decisión de marca** (nombre + paleta o luz verde a propuesta)
2. **ZIP/Drive** con fotos finales (hero + galería por unidad)
3. **JSON o CSV** de unidades: `slug, public_name, description, max_guests, base_rate_mxn, cleaning_fee_mxn, amenities[]`
4. **Confirmación Stripe**: misma cuenta o nueva
5. **Cuando lance**: tarjeta real para smoke + revisión visual final

---

## Cómo este sprint encaja en el roadmap

- **Sprint 5A (Alicia third-party):** pausado. Se retoma post-5B.
- **Sprint 6 (Channex sync público):** depende de 5B. Sincronizará disponibilidad con Airbnb/Booking.
- **Sprint 7 (Multi-edificio + segundo cliente):** habilitado por la arquitectura de 5B (theming por slug).
- **Sprint 8+ (Agentes nativos clase A):** ya pueden empezar a procesar reservas reales que vienen de 5B.

5B es la pieza que **convierte BaW OS de plataforma interna en operación con revenue real**.
