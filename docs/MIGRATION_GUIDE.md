# MIGRATION_GUIDE.md — Cómo trabajar BaW OS desde Claude Code, Codex, Cursor, o Perplexity Computer

> **Para Fran.** Este doc explica cómo arrancar una sesión de desarrollo en cada herramienta de forma que el agente entre con el contexto correcto desde el primer prompt. Funciona porque todas las herramientas leen automáticamente `AGENTS.md` (estándar abierto) o `CLAUDE.md` (Claude Code) cuando abren el repo.

---

## 0 · Pre-requisito común

Antes de migrarte a cualquier plataforma, asegura que:

1. Tienes el repo clonado: `git clone --recurse-submodules https://github.com/zxy-vc/baw-os.git`
2. `.env.local` está copiado (pídeselo a Fran o regenera desde `.env.example` + Supabase dashboard)
3. `npm install` corrió sin errores
4. `npm run dev` levanta `localhost:3000` y puedes loguearte con `fran@zxy.vc`

---

## 1 · Claude Code en VS Code (extensión, panel lateral)

### 1.1 — Setup inicial

- Instala la extensión "Claude Code" desde el marketplace de VS Code.
- Abre la carpeta del repo en VS Code.
- En el panel lateral de Claude Code, presiona **New session**.
- Claude detectará `CLAUDE.md` automáticamente.

### 1.2 — Primer prompt recomendado

```
Lee CLAUDE.md, AGENTS.md y docs/PROJECT_STATE.md completos. Confirma que entendiste el sprint actual y los patrones de bug ya documentados antes de proponer trabajo.

Mi tarea: [DESCRIBE LO QUE QUIERES HACER]

Antes de tocar código, propón un plan: archivos a tocar, qué cambia, qué validas. Espera mi OK antes de ejecutar.
```

### 1.3 — Flow típico

1. Pides plan → Claude responde plan
2. Apruebas / corriges
3. Claude edita archivos visibles en el editor
4. Pides `npx tsc --noEmit`
5. Pides commit + push + `gh pr create`
6. Claude te pasa el link del PR
7. **Tú mergeas manualmente** (regla canónica)

### 1.4 — Cuando Claude se atasca

Si propone algo que ya está mergeado o contradice un acuerdo: dile **"revisa AGENTS.md §X y `git log origin/main --oneline -10`"** — eso lo regresa al estado real.

---

## 2 · Claude Code Desktop (app standalone)

### 2.1 — Cuándo usarla en lugar de VS Code

- Sesiones de planificación largas sin editar código directamente
- Cuando quieres que el agente trabaje en background con MCPs centralizados
- Cuando vas a tener múltiples sesiones paralelas (sidebar de Sessions)

### 2.2 — Configuración de proyecto

- En Desktop, agrega el folder del repo como **Project / Workspace**
- En **Customize**, asegura que los MCPs estén conectados: GitHub, Notion, Supabase, Vercel
- Activa **worktree mode** si vas a tener varias sesiones modificando ramas distintas (lo veo activo en tu screenshot)

### 2.3 — Sobre la sesión "Design: BaW OS · Requiere información"

En tu image-4 veo una sesión esperando input tuyo. Para retomarla:

1. Abre la sesión
2. Pega este mensaje:

```
Reanudemos. Contexto: el Sprint 6 (visual rollout) cerró el 2026-05-02 con PRs #44 al #51. Lee CLAUDE.md, AGENTS.md y docs/PROJECT_STATE.md para ponerte al día. ¿Qué información necesitabas de mí para continuar?
```

3. Eso le da al agente el estado real (porque `1w` significa que la sesión es de antes del Sprint 6).

### 2.4 — Pull Request "Improve website best practices" (image-4)

Lo veo como **Listo para revisión** desde hace 1 semana. Antes de mergear:

```bash
gh pr view <numero> --json title,body,files,checks
git fetch origin && git log origin/main..pr/<numero> --oneline
```

Si toca cosas del Sprint 6 que ya cambiaron, pídele a Claude que rebasee y reabra.

---

## 3 · Codex (OpenAI, en VS Code o web)

### 3.1 — Particularidad: Codex respeta AGENTS.md automáticamente

Codex es el que **inventó el estándar `AGENTS.md`**. Lo leerá solo. No necesitas un `CODEX.md` aparte.

### 3.2 — Primer prompt recomendado

En la barra de input de Codex (image-3 lo muestra: "Pregúntale a Codex lo que sea"):

```
Lee AGENTS.md y docs/PROJECT_STATE.md completos. Confirma sprint actual y patrones de bug documentados antes de proponer.

Tarea: [DESCRIBE]

Reglas no negociables:
- Single-line commits
- TypeScript check antes de push (`npx tsc --noEmit`)
- NO mergear a main, solo abrir PR
- Branch name: fix/<scope> o feat/<scope>
- Plan primero, ejecución después de mi OK
```

### 3.3 — Modo "Trabajar localmente" vs "Trabajar en la nube"

Veo en tu image-3 que tienes "Trabajar localmente" activo + branch `feat/seed-mateos`. Eso significa que Codex va a editar tu copia local del repo. Bien para desarrollo rápido.

Para tareas largas en background (mientras tú haces otra cosa), cambia a **Trabajar en la nube** — Codex levanta su propio sandbox y te abre el PR cuando termina. Útil para refactors grandes o seed scripts.

### 3.4 — Tareas sugeridas que ya viste en Codex (image-3)

- "Cerrar el tablero de cobranza real de Mateos" → Sprint 7 candidato
- "Agregar gestión de edificios y propietarios" → Sprint 7 candidato
- "Blindar el deploy de Vercel con baw-design" → deuda técnica de submodule
- "Conecta tus aplicaciones favoritas a Codex" → MCPs

Antes de aceptar cualquiera, pídele plan + valida que no choque con `PROJECT_STATE.md`.

### 3.5 — Limitación conocida

Codex Web a veces no ve el último commit si lo acabas de pushear. Si Codex te dice que algo "no está en main" cuando sí está, pídele:

```
Refresca el repo. Corre `git fetch origin && git log origin/main --oneline -5`. Confirma el SHA actual.
```

---

## 4 · Cursor (IDE con agente integrado)

### 4.1 — Setup

- Cursor lee `AGENTS.md` y `CLAUDE.md` automáticamente.
- Para proyectos grandes, configura `.cursorrules` (opcional) — pero con `AGENTS.md` ya tienes lo esencial.
- Activa "Composer" para tareas multi-archivo, "Chat" para preguntas puntuales.

### 4.2 — Primer prompt

Mismo template del prompt de Claude Code §1.2, sirve igual.

### 4.3 — Modelo recomendado

Para BaW OS (TypeScript + Next.js + Supabase): Claude Sonnet 4.6 o GPT-5 Pro. Evita modelos "fast" baratos para refactors o migraciones de tokens — son propensos a romper invariantes de `AGENTS.md`.

---

## 5 · Perplexity Computer (lo que estás usando ahora)

### 5.1 — Cuándo seguir aquí

- Tareas que requieren navegar Vercel/Supabase/GitHub al mismo tiempo (los conectores ya están configurados)
- Sesiones largas de debugging con análisis de logs y screenshots
- Cuando necesitas que el agente lea PDFs, capturas o documentos del workspace

### 5.2 — Cómo reanudar después de migrar

Si trabajaste en otra plataforma y vuelves a Computer, usa este prompt:

```
Reanudemos en BaW OS. Lee desde GitHub:
- AGENTS.md
- CLAUDE.md
- docs/PROJECT_STATE.md

Después corre `gh pr list --state all --limit 10` para ver qué se mergeó mientras no estaba aquí. Después dime qué encontraste antes de proponer trabajo.
```

### 5.3 — Limitación

Perplexity Computer no edita archivos directamente en tu máquina — trabaja sobre `/tmp/baw-os-work` (clon temporal). Cuando hace push, el cambio aparece en GitHub remoto pero no en tu Mac local hasta que hagas `git pull`.

---

## 6 · Comparativa rápida — cuándo usar cuál

| Tarea | Mejor herramienta | Por qué |
|---|---|---|
| Bug fix de 1-3 archivos | **Claude Code VS Code** | Edición visible, diffs en tiempo real |
| Refactor multi-archivo | **Cursor Composer** o **Codex (nube)** | Multi-file editing nativo |
| Tarea autónoma background | **Codex en la nube** | Levanta sandbox, abre PR solo |
| Planning + arquitectura | **Claude Code Desktop** | Sesiones largas, MCPs centralizados |
| Debug con logs/screenshots/multi-app | **Perplexity Computer** | Conectores y navegación nativa |
| Pair programming en vivo | **Claude Code VS Code** | UI inmediata |
| Andrés (CTO OpenClaw via Discord) | Ver `docs/COLAB_ANDRES.md` | Protocolo aparte |

---

## 7 · Reglas que aplican en TODAS las plataformas

1. **`git fetch origin && gh pr list` antes de proponer trabajo.**
2. **Plan antes de ejecución.** Lista de archivos + qué cambia + qué validas.
3. **`npx tsc --noEmit` verde antes de push.**
4. **NO mergear a main solo.** Abrir PR, esperar tu OK.
5. **Single-line commit messages.** Imperativo.
6. **Si hay duda, preguntar a Fran.** Mejor PR pausado que regresión.

Si una herramienta empieza a romper estas reglas, recuérdaselas con: **"lee AGENTS.md §1, §3, §4"**.

---

**Mantenido por:** Fran Durán
**Última revisión:** 2026-05-02
