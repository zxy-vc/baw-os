# CLAUDE.md — Briefing para Claude Code en BaW OS

> Este archivo lo lee automáticamente **Claude Code** (CLI, VS Code y Desktop) al abrir este repo. Si llegas aquí como Claude, **lee primero `AGENTS.md`** — es la fuente de verdad operacional compartida con todos los demás agentes (Codex, Cursor, Computer, etc.). Aquí solo va lo específico de Claude.

---

## 0 · Primer paso obligatorio

```
Lee AGENTS.md completo antes de tocar código.
```

`AGENTS.md` cubre:
- Contexto del proyecto en 1 página (sección 0)
- Pre-flight obligatorio: `git fetch`, `gh pr list`, build verde local (sección 1)
- Invariantes que no se tocan sin PR dedicado (sección 2)
- Lenguaje, convenciones, reglas de merge (secciones 3-4)
- Source of truth en Notion (sección 5)
- Anti-patrones que disparan rechazo (sección 7)

**No dupliques esa información aquí. Si necesitas extender algo, edítalo en AGENTS.md y agrega el delta a este archivo.**

---

## 1 · Lo específico de Claude Code

### 1.1 — Cómo arrancar una sesión nueva

**Prompt inicial recomendado** (cópialo tal cual la primera vez en cada sesión):

```
Lee CLAUDE.md y AGENTS.md completos. Después lee docs/PROJECT_STATE.md para saber en qué sprint estamos y cuáles son las prioridades vivas. Confirma que entendiste el estado actual antes de proponer trabajo.
```

Claude Code respeta los archivos `CLAUDE.md` automáticamente, pero el prompt explícito asegura que también lea `PROJECT_STATE.md` que cambia más seguido.

### 1.2 — Tools obligatorios

Claude Code en este repo debe usar:

- **`gh` CLI** para todo lo de GitHub (issues, PRs, releases). Está autenticado en la máquina del usuario.
- **Supabase MCP** si está disponible en la sesión, para queries de DB. Si no, `psql` con la cadena de `.env.local`.
- **Notion MCP** para logs de avance (ver `AGENTS.md` §6). No uses `browser_task` para Notion.
- **Vercel CLI** (`npx vercel`) para deploys y logs runtime cuando los necesites.

### 1.3 — Política de commits y PRs (recordatorio)

- Single-line commit messages, imperativo, en inglés cuando son técnicos puros.
- **Nunca mergees a `main` solo.** Crea el PR, pega el link en el chat, y espera aprobación humana de Fran.
- TS check (`npx tsc --noEmit`) antes de push, sin excepción.
- Branch naming: `fix/<descriptor>`, `feat/<descriptor>`, `docs/<descriptor>`, `sprint<N>/<scope>`.

### 1.4 — Cuándo pedir confirmación al usuario

Antes de:
- Mergear cualquier PR
- Tocar migraciones de Supabase (carpeta `supabase/migrations/`)
- Cambiar tokens de diseño en `design/baw-design/tokens/`
- Modificar `src/lib/navigation.ts` o `src/lib/platform-admin.ts`
- Crear un feature nuevo que no esté en `docs/PROJECT_STATE.md` ni en el Feature Board

### 1.5 — Modo "plan" antes de modo "execute"

Para tareas multi-archivo o multi-step, **propón un plan primero** (lista de archivos a tocar + qué cambia + qué validas). Espera el OK de Fran antes de ejecutar. Esto evita PRs gigantes que se vuelven irrevisables.

### 1.6 — Cuando heredas trabajo de Computer (Perplexity) o de otra herramienta

Si el chat anterior fue en Perplexity Computer / Codex / Cursor / Andrés Discord:

1. Lee `docs/PROJECT_STATE.md` para saber qué se cerró ya.
2. Corre `gh pr list --state all --limit 15` para ver qué PRs están abiertos o se mergearon recientemente.
3. Si hay un PR abierto que parezca tuyo (rama `fix/...` o `feat/...`), `gh pr view <N>` antes de crear nada nuevo. Quizá solo falte rebase + merge.

---

## 2 · Diferencias entre Claude Code CLI / VS Code / Desktop

| Versión | Cuándo usarla |
|---|---|
| **Claude Code CLI** (terminal) | Cambios rápidos, scripts, CI tasks, cuando ya tienes claro el plan |
| **Claude Code en VS Code** (panel lateral) | Edición visible, ver diffs en tiempo real, sesiones largas |
| **Claude Code Desktop** (app standalone) | Sesiones de planificación o discusión sin editar código directamente; MCPs centralizados |

Las tres comparten el mismo `CLAUDE.md` y `AGENTS.md` porque están en el repo.

---

## 3 · MCPs configurados (esperados)

Claude Code lee `~/.claude/mcp.json` o `.claude/mcp.json` del repo. Los MCPs que este proyecto asume disponibles:

- `notion` (para logs y SOT)
- `supabase` (para queries directas a la DB)
- `github` (alternativa a `gh` CLI)
- `vercel` (para deploys y logs)

Si un MCP falta, **no detengas el trabajo** — usa el equivalente CLI (`gh`, `npx vercel`, `psql`). Pero avisa a Fran que falta para que lo agregue.

---

## 4 · Cuando NO sabes qué hacer

Sigue el orden:

1. Buscar en `AGENTS.md` (invariantes, anti-patrones)
2. Buscar en `docs/PROJECT_STATE.md` (estado vivo)
3. Buscar en `docs/EXECUTION-TIER1.md`, `docs/PRD.md`, `docs/ROADMAP-v2.md`
4. Buscar en código: `git log` del archivo, comentarios inline
5. Buscar en Notion (links en `AGENTS.md` §5)
6. **Preguntar a Fran** en el chat o como comentario en el PR. Mejor un PR pausado que una regresión.

---

**Mantenido por:** Fran Durán (`@franduranv`)
**Última revisión:** ver `docs/PROJECT_STATE.md` para fecha.
