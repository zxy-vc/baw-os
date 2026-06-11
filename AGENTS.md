# AGENTS.md — Protocolo para agentes que trabajan en BaW OS

> Este archivo es la **fuente de verdad operacional** para cualquier agente (humano, Claude Code, Codex, Computer, ZXY Agent OS, etc.) que vaya a tocar este repo. Es complementario al [Handoff Canónico Sprint 4 en Notion](https://www.notion.so/zxyventures/Sprint-4-Acuerdos-Can-nicos-2026-04-29-351169373e72811ab9c7e781d57cb598).
>
> **Si lees esto antes de tocar código, leelo COMPLETO. No es opcional.**

---

## 0 · Contexto del proyecto en una página

- **Producto:** BaW OS — plataforma multi-tenant para Property Managers, Next.js 14 + Supabase
- **Repo:** [github.com/zxy-vc/baw-os](https://github.com/zxy-vc/baw-os)
- **Producción:** [baw-os.vercel.app](https://baw-os.vercel.app)
- **Supabase:** project `zlcgxmllaeweypyodvzk`
- **Org producción:** `BaW Operations`, slug `baw-operations`, id `81a011c4-4ea6-4b79-924d-73dbe6d35e14`
- **Owner humano del proyecto:** Fran Durán (`fran@zxy.vc` para producción · `franduranv@gmail.com` personal)

---

## 1 · Protocolo de pre-flight (OBLIGATORIO antes de tocar código)

**Esta sección no es negociable. Saltársela genera regresiones que rompen producción.**

### 1.1 — Verifica el estado real de main, no del doc

El doc canónico es una **foto del momento en que se escribió**. Main avanza más rápido que el doc.

```bash
git fetch origin
git log origin/main --oneline -10
gh pr list --state all --limit 10
```

Si tu plan menciona "hacer S4-X" pero `git log` muestra que S4-X ya está mergeado, **detente** y reformula el plan. Tu fuente de verdad es git, no Notion.

### 1.2 — Antes de modificar un archivo, revisa su historia

```bash
git log --oneline -5 -- <ruta/del/archivo>
```

Si fue tocado en los últimos 7 días por otro PR mergeado, **asume que esa decisión es deliberada y vigente**. No la reviertas sin issue previo que justifique el cambio.

### 1.3 — Antes de crear archivos nuevos en `src/`, busca duplicados

```bash
find . -name "<patrón>" -not -path "*/node_modules/*"
grep -rn "<concepto clave>" --include="*.ts" --include="*.tsx" --include="*.css" -l
```

Ejemplo: el sistema de design tokens BaW vive en `design/baw-design/tokens/`. **Nunca dupliques infraestructura.** Si necesitas un token nuevo, agrégalo al set existente.

### 1.4 — Scope discipline

Un PR = un objetivo. Si tu PR se llama "Buildings/owners CRUD", **solo toca buildings/owners**. Si encuentras algo que mejorar fuera de ese scope:

- Abre un issue en GitHub (`gh issue create`)
- Apúntalo en el PR description como follow-up
- **No lo metas en este PR**

### 1.5 — Build verde local antes de pushear

```bash
npx tsc --noEmit
npm run build
```

Si falla TS o build, no abras el PR. Arregla primero.

---

## 2 · Invariantes: cosas que NUNCA se tocan sin PR dedicado + acuerdo previo

### 2.1 — Tipografía
Inter via `next/font/google`, declarada en `src/app/layout.tsx`:

```tsx
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
<html lang="es" className={inter.variable}>
```

**No eliminar** el import ni la asignación de `--font-inter`. Si quieres cambiar tipografía, abre un PR dedicado con design rationale + actualizar `BRAND_FOUNDATIONS.md`.

### 2.2 — Tokens de diseño
Sistema canónico vive en `design/baw-design/tokens/index.css`, importado desde `src/app/globals.css`:

```css
@import "../../design/baw-design/tokens/index.css";
```

**Naming convention:** todos los CSS variables empiezan con `--baw-*` (ejemplo: `--baw-bg`, `--baw-surface`, `--baw-text`, `--baw-muted`, `--baw-border`, `--baw-accent`, `--baw-danger`).

**Prohibido:**
- Crear sets paralelos (`--d-*`, `--brand-*`, `--l-*`, etc.)
- Usar HEX o rgba directos en componentes nuevos (issue [#24](https://github.com/zxy-vc/baw-os/issues/24) trackea la migración del legacy)
- Importar tokens desde `src/app/`

Si necesitas un token nuevo, agrégalo a `design/baw-design/tokens/index.css`.

### 2.3 — Sidebar y navegación canónica
Definido en `src/lib/navigation.ts` desde S4-0 (PR #14, mergeado). **6 secciones top + 2 footer.**

Top: `inbox`, `portfolio`, `tenants`, `finance`, `operations`, `agents`
Footer: `settings`, `profile` (vía ProfileMenu)

**No agregues, quites, ni renombres secciones sin acuerdo previo en Notion.**

Las sub-navs de cada sección están definidas y ya pasaron por revisión humana. Si crees que falta una ruta, abre issue primero.

### 2.4 — Arquitectura de 3 capas admin
- **L0 Platform** (`/admin`) — solo `fran@zxy.vc`, badge rojo. Tabla `platform_admins`.
- **L1 Tenant** (`/settings/account`) — `pm_owner` / `pm_admin`, badge azul.
- **L2 User** (`/me`) — cualquier usuario logueado, badge gris.

`isPlatformAdmin()` y `requirePlatformAdmin()` viven en `src/lib/platform-admin.ts`. **No bypass-ear esta lógica.**

### 2.5 — Roles canónicos (5 capas dominio)
PM Company → PM Users → Buildings → Units → Property Owners

Roles permitidos: `pm_owner`, `pm_admin`, `pm_operator`, `pm_viewer`, `agent`, `client`.

Enum legacy `member_role` está en proceso de eliminación (issue [#23](https://github.com/zxy-vc/baw-os/issues/23)). No agregues referencias nuevas.

### 2.6 — Multi-tenant: `getOrgId()` es fuente única de verdad
`resolveOrgId()` en `src/lib/org-context.ts` (S4-1, PR #15). Reemplaza al shim `getOrgIdAsync()` legacy que retorna "primera org por created_at" — usado solo en webhooks pendientes de migrar (issue [#22](https://github.com/zxy-vc/baw-os/issues/22)).

**Reglas:**
- En rutas autenticadas: usa `resolveOrgId()` con `OrgContextError` para 401
- En webhooks externos: deriva `org_id` del payload, no del shim
- Cualquier query a Supabase debe filtrar por `org_id`

### 2.7 — Catálogo de agentes: 10+1, no 12
- **BaW** (coordinador, sin prefijo "Agente")
- **PM-Ops:** Cobranza, Reservas, Mantenimiento, Huésped
- **ZXY shared (sin L0):** Hugo-COS, Alicia-Ops, Conta-Beto, Maribel-Law, Luis-Growth, Andres-Tech

**Beto NO es persona física — es el agente ZXY Conta-Beto.**

Definido en tabla `agents` (S4-3, PR #18). Framework: capability `L0-L4` (autonomy) + feedback `F0-F5` (maturity).

### 2.8 — Features mergeadas y funcionales
**No eliminar** features que ya están en main funcionando, sin issue previo que justifique la eliminación. Ejemplos vigentes:

- Badge de notificaciones en sidebar Inbox (polling 30s a `/api/notifications/unread-count`)
- Sub-navs de Inbox: Tareas / Mensajes / Notificaciones / Timeline
- Página `/onboarding` como router L1
- ProfileMenu con badges L0/L1/L2

---

## 3 · Lenguaje y convenciones

- **Idioma de UI:** Español (es-MX). Strings en código pueden ser inglés cuando son técnicos (ej: variable names).
- **Commits:** single-line, imperativo, prefijo con sprint si aplica. Ejemplo: `S4-3: Agente Cobranza v1 + infra común agentes`
- **Branches:** `<sprint>/<scope>` (ej: `sprint4/s3-agent-cobranza`) o `<tipo>/<scope>` (ej: `hardening/agent-protocol`, `fix/admin-redirect`)
- **PRs:** título corto descriptivo, body con Summary + Verification + acuerdos canónicos afectados (template en `.github/PULL_REQUEST_TEMPLATE.md`)
- **Evita en texto y código:** las palabras "scrape" / "scraping" / "crawl" → usar "extraer", "recopilar", "leer", "browse"
- **MCP-first:** cuando una integración tenga conector nativo (Notion, GitHub, Supabase, Vercel), usa el conector, no `browser_task`

---

## 4 · Reglas de merge

- **NO mergear a main automáticamente sin aprobación humana.** Siempre dejar PR abierto con build verde + descripción completa.
- Cuando trabajas en stack de PRs (rama derivada de otra rama no mergeada), después de que se mergea la base, **rebasea tu rama sobre `origin/main` actualizado** y resuelve conflictos manualmente.
- Para rebasear sin abrir editor: `GIT_EDITOR=true git rebase --continue`
- Si `--force-with-lease` falla por "stale info", usa `--force` con cuidado tras verificar que nadie más committeó.

---

## 5 · Source-of-truth de Notion (SOT)

Si hay discrepancia entre código y Notion, **el código mergeado en `origin/main` gana**. Pero estas páginas Notion son referencia obligatoria:

- [ZXY Business Plan v4](https://www.notion.so/zxyventures/Doc-2-Business-Plan-v4-ZXY-Ventures-34a169373e72810e8a9cfc99492a7033) — visión, modelo de negocio, contexto estratégico
- [Perplexity PC Log de avances](https://www.notion.so/zxyventures/Perplexity-Personal-Computer-Log-de-avances-351169373e72813c9f8cd10f3e35d232) — bitácora de sesiones de trabajo (parent page de logs por sprint)
- [Sprint 4 — Acuerdos Canónicos](https://www.notion.so/zxyventures/Sprint-4-Acuerdos-Can-nicos-2026-04-29-351169373e72811ab9c7e781d57cb598) — acuerdos arquitectónicos vigentes
- [Sprint 4 — Handoff Canónico](https://www.notion.so/zxyventures/Sprint-4-Handoff-Can-nico-BaW-OS-352169373e728157b7f2ccfca01cfd56) — estado al cierre del sprint
- [Feature Board](https://app.notion.com/p/330169373e7281e5b93beda50203b65f) — roadmap de features con MoSCoW + Tier + Sprint

---

## 6 · Cómo registrar tu trabajo

Después de cerrar tu PR (build verde + push), crea un log en Notion:

1. **Parent:** `351169373e72813c9f8cd10f3e35d232` (Perplexity PC Log de avances)
2. **Título:** `S<N>-<X> · <descripción corta>` o `<Tipo> · <descripción>` para hardening/fixes
3. **Contenido:** Resumen + Migraciones SQL aplicadas + Código nuevo + Acuerdos canónicos respetados + Link al PR + Próximo

Si tu trabajo afecta el Feature Board, **actualiza el item correspondiente** (Status, Sprint, Notas).

---

## 7 · Anti-patrones que disparan rechazo automático del PR

| Anti-patrón | Por qué |
|---|---|
| Eliminar Inter de `layout.tsx` | Rompe la tipografía canónica |
| Crear `src/app/baw-tokens.css` o cualquier set de tokens fuera de `design/baw-design/tokens/` | Duplica el design system |
| Usar HEX/rgba en componentes nuevos | Aumenta deuda de issue #24 |
| Eliminar `unreadCount` o cualquier feature mergeada de Sidebar/AppShell | Regresión funcional |
| Cambiar `href` o `subNav` de `SIDEBAR_SECTIONS` sin acuerdo | Rompe navegación canónica |
| Crear placeholders re-export (`tenants → contacts`) que confunden la estructura | Genera deuda visual |
| Mezclar mejoras de scope distinto en un mismo PR | Bloquea revisión |
| Branch desde main desactualizado | Genera conflictos y reescribe trabajo mergeado |
| Mergear automáticamente sin aprobación humana | Política no negociable |

---

## 8 · Cuando algo no está claro

**No asumas, pregunta.** Comenta en el PR con `@franduranv` antes de tomar decisiones que afecten:

- Schema de DB (migraciones)
- Tokens de diseño
- Navegación canónica
- Roles, permisos, RLS
- Catálogo de agentes
- Endpoints públicos

Mejor un PR pausado 1 hora que un PR mergeado con regresión.

---

## 9 · Third-party agents — Discord Interactions (Sprint 5A WS-1)

> Agente conectado actualmente: **Alicia** (`id = alicia-ops`, `family = third-party`).
> Único humano en el sistema: Fran. Los agentes NUNCA son referenciados como personas.

### Arquitectura del flujo Discord → BaW OS

```
Fran (Discord) → Discord API → POST /api/agents/discord-interactions
                                    │
                              Ed25519 verify (Web Crypto)
                                    │
                         DEFERRED_CHANNEL_MESSAGE (<3s)
                                    │
                         log → agent_interactions table
                                    │
                         dispatch async → /api/agents/discord-interactions/process
                                    │
                         Alicia ejecuta → /api/v1/* endpoints
                                    │
                         Discord followup webhook → respuesta con badge
```

### Bearer tokens de agentes

Los agentes usan su **propio plano de autenticación** (`agent_credentials`), completamente separado de la autenticación de usuarios humanos (`auth.users`). Nunca mezclar.

```ts
// Forma correcta en endpoints que Alicia llama:
import { requireAgentAuth } from '@/lib/agents/auth'
export const POST = requireAgentAuth(['incidents:write'])(async (req, identity) => {
  // identity.agent_id === 'alicia-ops'
  // identity.scopes contiene los scopes concedidos
})

// Verificar un token directamente:
import { verifyAgentBearer } from '@/lib/agents/auth'
const identity = await verifyAgentBearer(token) // null si inválido
```

### Atribución de agentes

Todo registro creado por un agente debe incluir:
1. `created_by_agent_id` en la fila de DB (reservations, incidents, tasks).
2. `agent_attribution` en el JSONB de metadata (si existe).
3. Footer “via Alicia · BaW OS Agent · Discord” en respuestas Discord.

```ts
import { withAgentAttribution, withAgentDiscordEmbed } from '@/lib/agents/attribution'

// En texto:
const response = withAgentAttribution('Incidencia creada ✔', {
  agentId: 'alicia-ops',
  agentDisplayName: 'Alicia',
  channel: 'discord',
  discordMessageUrl: interaction.message?.jump_url,
})

// En embed Discord:
const embed = withAgentDiscordEmbed({ title: 'Nueva incidencia', ... }, attr)
```

### Env vars requeridas para Discord Interactions

| Variable | Descripción |
|---|---|
| `DISCORD_PUBLIC_KEY` | Clave pública Ed25519 del bot Discord (hex). Del portal de Discord. |
| `INTERNAL_WEBHOOK_SECRET` | Bearer secret para dispatch async entre funciones Vercel. |
| `NEXT_PUBLIC_BASE_URL` | URL base de Vercel (ej. `https://baw-os.vercel.app`). |
| `ALICIA_WEBHOOK_URL` | URL push al runtime de Alicia (tunnel Cloudflare, ej. `https://alicia.zxy.vc/incoming/baw-os`). Si falta o el push falla, la interacción queda `deferred` y la recoge el long-poll del skill. |
| `DISCORD_DEFAULT_ORG_ID` | Org UUID al que se atribuyen interacciones Discord (MVP: org `BaW Operations`). Mapeo guild→org multi-tenant es follow-up. |

### Tests de agentes

```bash
bash tests/agents/run-all.sh   # 3 suites, 39 tests
```

O individualmente:
```bash
node tests/agents/discord-verify.test.mjs  # 8 tests (firma Ed25519)
node tests/agents/auth.test.mjs            # 13 tests (bearer tokens + scopes)
node tests/agents/attribution.test.mjs     # 18 tests (badges de atribución)
```

### Archivos clave de la integración Discord

| Archivo | Propósito |
|---|---|
| `src/app/api/agents/discord-interactions/route.ts` | Endpoint principal Discord |
| `src/lib/agents/discord-verify.ts` | Verificación firma Ed25519 |
| `src/lib/agents/auth.ts` | verifyAgentBearer + requireAgentAuth HOF |
| `src/lib/agents/attribution.ts` | Badge "via Alicia" en mensajes y DB |
| `supabase/migrations/20260523_agents_discord_interactions.sql` | agent_interactions + attribution columns |
| `docs/adr/ADR-021-third-party-agents-discord.md` | Decisiones arquitecturales |

---

**Última actualización:** 2026-05-23 · Sprint 5A WS-1 — Discord Interactions + Alicia bearer auth
