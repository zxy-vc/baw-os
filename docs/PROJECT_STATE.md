# PROJECT_STATE.md — Estado vivo de BaW OS

> **Este archivo cambia seguido.** Cualquier agente que vaya a tocar el repo debe leerlo después de `AGENTS.md` y antes de empezar.
> **Última actualización:** 2026-07-03 (Fase 1 Public Listing: rutas públicas genéricas `/edificios/[buildingSlug]`, galería pública, leads MTR/LTR, UI de publicación).

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
