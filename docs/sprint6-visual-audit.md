# Sprint 6 — Visual System Rollout · Auditoría final

**Fecha:** 2026-05-02
**Status:** ✅ Cerrado

## Resumen

Migración completa del sistema visual de BaW OS desde HEX/rgba hardcoded a tokens semánticos del design system, aplicación de las 3 tipografías canónicas (Inter / IBM Plex Mono / Instrument Serif) en todo el chrome y todas las páginas de alto tráfico, e introducción del Mark A canónico (placas con desfase pronunciado, Wordmark Explorations v2) como identidad oficial reutilizable.

## Métricas

### HEX/rgba en `src/`

| Punto de control | Antes | Después |
|---|---|---|
| Archivos `.tsx` y `.ts` con HEX/rgba | 12+ | **0** |
| `globals.css` (definición de tokens — esperado) | 44 | 44 |
| Total instancias hardcoded en código de aplicación | ~83 | **0** |

### Tokens introducidos / consolidados

- `--font-sans`, `--font-mono`, `--font-display` (aliases semánticos sobre next/font variables)
- `TIER_TOKENS` en `roadmap/snapshot.ts` (sustituye `TIER_COLORS`, eliminado)

### Componentes nuevos

- `BawMark` — SVG canónico Mark A reutilizable (`size`, `withWordmark`, `wordmarkSize`, `showOS`)
- `BawGrid` — retícula 32×32 en `currentColor` reutilizable (extiende la del `/login` al chrome interno)

### Tipografías aplicadas (`--font-display` / `--font-mono`)

- Sidebar: wordmark + tagline en mono
- AppShell header: badge Live en mono
- `/me`, `/agents`, `/admin/roadmap`, `/owner`, `/owner/buildings/[id]`, `/onboarding`: H1 en display + subtítulo en mono uppercase
- WizardFirstRun: H1 "Bienvenido a BaW OS" en display 32px
- Layout `/admin`: badge "L0 · Platform" + título en mono
- Badges de rol (`/me`, `/admin/users`): mono

## PRs entregados (Sprint 6)

| PR | Branch | Resumen |
|---|---|---|
| [#44](https://github.com/zxy-vc/baw-os/pull/44) | feat/visual-rollout-shell | BawMark + Sidebar + Mark A + grid + 3 fonts aliases |
| [#45](https://github.com/zxy-vc/baw-os/pull/45) | feat/visual-rollout-pages-b | /me, /agents, /admin/roadmap (33 instancias) |
| [#46](https://github.com/zxy-vc/baw-os/pull/46) | feat/visual-rollout-owner | Portal Propietario (12 instancias) |
| [#47](https://github.com/zxy-vc/baw-os/pull/47) | feat/visual-rollout-onboarding | Onboarding wizard (8 instancias) |
| #48 (este) | feat/visual-rollout-audit | Auditoría final · 18 instancias residuales · TIER_COLORS eliminado |

## Decisiones de diseño

1. **Mark A vs B:** se eligió A (placas con offset +6/-6) tras ver ambas en producción. El desfase se asume como decisión, no error — comunica capas operativas / floors de software / jerarquía.
2. **Retícula 32×32:** extendida del `/login` al chrome interno autenticado. Vive a `z-index: 0` con `opacity: 0.035`, no compite con contenido pero da continuidad de marca.
3. **Tres tipografías canónicas:**
   - **Inter** — body copy, default global
   - **IBM Plex Mono** — wordmark, KPIs, badges, labels técnicos, navegación
   - **Instrument Serif** — H1 de páginas hero (display, voz humana sobre el grid técnico)
4. **TIER_COLORS deprecated → eliminado:** los 6 tiers del roadmap ahora consumen tokens semánticos directamente (`success`, `info`, `agent`, `neutral`, `orange`, `danger`).

## Lo que NO está en alcance (deuda futura)

- `src/app/onboarding/page.tsx` líneas 128-139: clases Tailwind genéricas tipo `text-gray-*`, `text-indigo-500` en sección "Estado de la cuenta" — son refactor profundo de componente, no migración HEX→token.
- Páginas no auditadas en este sprint que pueden tener deuda pendiente (revisar en Sprint 7+ caso por caso): `/units`, `/contracts`, `/cobros`, `/maintenance`, `/housekeeping`, `/pricing`, `/quotes`, `/reservations`.

## Cierre deuda #24

Issue [#24 — S4-4: Migrar 206+ referencias HEX/rgba a tokens BaW design](https://github.com/zxy-vc/baw-os/issues/24) ya estaba CLOSED previo a esta sesión. Esta auditoría confirma que en el código activo (excluyendo `globals.css` que es la fuente de verdad) **no quedan referencias HEX/rgba hardcoded** en archivos `.tsx`/`.ts` de `src/`.
