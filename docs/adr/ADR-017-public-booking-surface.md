# ADR-017: Public Booking Surface (Landing + Motor de Reservas para edificios)

**Status:** Accepted
**Date:** 2026-05-14
**Deciders:** Fran (humano), Computer (agente)
**Sprint:** 5B
**Related:** ADR-016 (Third-party agent integration), ADR-008 (Multi-tenancy v2), ADR-013 (Brand foundations)

---

## Contexto

BaW OS es la plataforma SaaS B2B multi-tenant para PM Company Owners. Hasta Sprint 5A, todo el producto era interno (dashboards, agentes, operaciones). Ahora necesitamos una **superficie pública orientada al huésped final** para el primer edificio operado por BaW (Mateos 809P en León, Guanajuato): landing del edificio + motor de reservas con pago real.

Decisión de producto clave que ya tomó Fran:

1. **La marca del edificio NO es la marca de la plataforma.** BaW OS es invisible al huésped. Cada edificio tiene identidad propia. El primer edificio se llamará tentativamente "Mateos 809P" o "Edificio 809P".
2. **La superficie pública vive como rutas dentro del repo `baw-os`**, no como repo separado. Justificación: velocidad de lanzamiento, comparte API interna, build único en Vercel, evita complejidad de monorepo en esta etapa.
3. **Motor de reservas completo con Stripe checkout en v1.** No es showcase. El huésped completa el pago y se crea una reservation real en la DB.

## Decisión

### 1. Topología de rutas

```
app/
├── (dashboard)/        ← interno, auth requerida (lo actual)
├── (public-booking)/   ← NUEVO grupo de rutas público sin auth
│   ├── layout.tsx      ← layout limpio con tema 809P, sin sidebar
│   ├── mateos-809p/
│   │   ├── page.tsx                    ← landing
│   │   ├── unidades/page.tsx           ← grid con filtros
│   │   ├── unidades/[slug]/page.tsx    ← detalle unidad
│   │   ├── reservar/[unitId]/page.tsx  ← wizard reserva
│   │   └── confirmacion/[bookingId]/page.tsx
│   └── ...futuros edificios
```

- Grupo de rutas Next.js `(public-booking)` aísla layout, middleware y theming del dashboard.
- Middleware existente exime el grupo de auth y de la lógica multi-tenant por subdominio.
- El theming se activa por contexto (`BuildingThemeProvider`) que lee el slug del path y aplica tokens OKLCH del edificio correspondiente.

### 2. Separación de marcas

- **Tokens visuales independientes por edificio**, vivos en `baw-design/themes/<building-slug>/tokens.json` (OKLCH).
- **Sin "Powered by BaW" visible**. Solo aparece BaW en avisos legales (operador responsable), como exige la ley.
- `baw-design` extiende su sistema con un concepto nuevo: `BuildingTheme` (subtipo de `Theme`) que tiene paleta + tipografía + tono de voz propios.
- Logos de edificio van en `baw-design/themes/<slug>/logo/`.

### 3. API pública

Endpoints nuevos bajo `/api/public/v1/*`. Reglas:

- **Sin autenticación de usuario**, pero con **rate limit** (Upstash o middleware con KV) y **CORS** estricto a los dominios públicos.
- **Lectura sobre vistas RLS** (`v_public_units`, `v_public_buildings`) que exponen solo campos seguros. Nunca tocan tablas internas directo.
- Idempotencia obligatoria en POSTs (`Idempotency-Key` header).

Endpoints:

| Método | Path | Propósito |
|---|---|---|
| GET | `/api/public/v1/buildings/:slug` | Info edificio (nombre, descripción, hero, amenidades comunes, ubicación, FAQ) |
| GET | `/api/public/v1/buildings/:slug/units` | Lista unidades con filtros `?guests&from&to` |
| GET | `/api/public/v1/units/:slug` | Detalle unidad (galería, amenidades, tarifa base, política) |
| GET | `/api/public/v1/units/:slug/availability?from&to` | Calendario disponibilidad real |
| POST | `/api/public/v1/quotes` | Calcula precio: noches × tarifa + cleaning + taxes |
| POST | `/api/public/v1/bookings/checkout` | Crea Stripe Checkout Session + hold temporal de fechas |
| POST | `/api/public/v1/webhooks/stripe` | Endpoint Stripe (verificado por firma); promueve hold → reservation confirmada |

### 4. RLS y seguridad de datos

- Crear **vistas públicas** (`v_public_buildings`, `v_public_units`, `v_public_availability`) con SELECT abierto al rol `anon` de Supabase.
- Las vistas filtran: solo edificios con `is_public_listed = true`, solo unidades con `is_publicly_bookable = true`, ningún PII de huéspedes anteriores, ningún financial breakdown interno.
- Mutaciones (`POST /quotes`, `POST /bookings/checkout`) pasan por **service role key** server-side, nunca exponen JWT al cliente.
- Tablas internas (`agents`, `agent_runs`, `tenants`, `users`, `payments` raw) siguen RLS estricta — bloqueadas a `anon`.

### 5. Hold temporal de fechas

Para evitar double-booking durante el flow de Stripe (huésped en checkout 5-10 min):

- Tabla `reservation_holds` con `unit_id, from_date, to_date, expires_at` (10 min default).
- `POST /bookings/checkout` crea hold + Stripe Session.
- `availability` filtra holds vigentes.
- Webhook Stripe `checkout.session.completed` → promueve hold a `reservations` confirmadas.
- Hold expirado → cron de limpieza cada minuto (Vercel cron) o lazy en lectura.

### 6. Feature flag y lanzamiento gradual

- `NEXT_PUBLIC_PUBLIC_BOOKING_ENABLED=false` por defecto en producción.
- Cuando esté lista la prueba con tarjeta real, se activa.
- Permite tener todo el código en `main` sin exponerlo aún.

### 7. SEO y metadata

- Metadata por edificio: title, description, OG image (renderizada server-side).
- JSON-LD `LodgingBusiness` por edificio + `Apartment` por unidad.
- Sitemap dinámico que incluye solo edificios y unidades públicas.
- `robots.txt` permite indexación de rutas públicas, bloquea `/api/*` internas.

### 8. Dominio

- **v1 (lanzamiento)**: `baw-os.vercel.app/mateos-809p` (rápido, sin DNS extra).
- **v2 (post-validación)**: dominio propio `mateos809p.com` con rewrite en Vercel a la ruta interna. El huésped nunca ve "baw-os" en la URL.
- ADR no se cierra en esto; se reabre cuando Fran defina el dominio final.

## Consecuencias

### Positivas

- Lanzamiento rápido sin esperar repo separado ni monorepo.
- Comparte modelos, tipos, cliente Supabase y deploy con el dashboard.
- Tokens OKLCH ya existentes (de `baw-design`) se extienden con tema 809P sin reescribir nada.
- La separación por grupo de rutas Next.js mantiene el código aislado y migrable a repo propio en el futuro.

### Negativas / trade-offs

- Cada deploy a Vercel afecta a ambos (dashboard + landing). Mitigación: previews por PR + feature flag.
- Si llegan 5+ edificios, este patrón empieza a doler — habrá que migrar a monorepo (Sprint 7+ o cuando se justifique).
- Rate limit y bot protection son nuevos para baw-os; hay que añadir Upstash Ratelimit o equivalente.

### Riesgos

- Double-booking si el hold falla. Mitigación: transacciones Postgres + unique constraint compuesto (`unit_id, daterange`) con GIST.
- Webhook Stripe pierde eventos. Mitigación: idempotency key + reintentos + endpoint de reconciliación que consulta Stripe API.
- Exposición accidental de datos internos. Mitigación: tests automatizados que validen que `anon` no puede leer tablas internas.

## Alternativas consideradas

- **Repo separado `mateos-809p-web`**: descartado por velocidad. Se reconsiderará en Sprint 7+.
- **Monorepo Turborepo**: descartado por complejidad temprana. Apropiado cuando haya 2-3+ edificios.
- **Subdominio `reservar.baw-os.app`**: descartado porque mezcla marca BaW con la del edificio.

## Notas de implementación

1. **Migrar primero las vistas RLS y la tabla `reservation_holds`** antes de tocar el frontend.
2. **Probar Stripe en modo test con tarjeta `4242 4242 4242 4242`** antes de habilitar live mode.
3. **El idempotency key del cliente** debe sobrevivir reintentos de red (guardarlo en sessionStorage al iniciar checkout).
