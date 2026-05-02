# COLAB_ANDRES.md — Protocolo para colaborar con Andrés (Agente CTO de OpenClaw via Discord)

> Andrés es uno de los agentes ZXY shared definidos en `AGENTS.md` §2.7 ("Andres-Tech"). Históricamente la colaboración con él en BaW OS no ha salido bien. Este documento codifica un protocolo que aumenta las probabilidades de éxito.

---

## 1 · Por qué la colaboración previa falló (hipótesis)

Sin un post-mortem formal, las causas más probables fueron:

1. **Andrés no tenía acceso al estado real del repo.** Operaba con el handoff de Notion (que se desactualiza) en vez de con `git log origin/main` y `gh pr list`.
2. **No había un canal estructurado para validación.** Discord es bueno para conversación pero malo para flujo de PRs — las decisiones se diluyen en chat.
3. **Falta de criterio compartido sobre qué PR mergear y cuándo.** Sin reglas explícitas, las versiones colisionaban.
4. **Cero trazabilidad de qué decidió Andrés vs. qué decidiste tú.** Sin commits firmados o PRs separados, era imposible auditar.

Si la próxima ronda con Andrés repite cualquiera de estos cuatro errores, va a fallar igual. Este protocolo los ataca uno por uno.

---

## 2 · Pre-condiciones antes de invitar a Andrés

### 2.1 — Acceso a herramientas

Confirma que Andrés tiene:

- [ ] Acceso de **collaborator** (no solo read) al repo `zxy-vc/baw-os`. Configúralo en Settings → Collaborators.
- [ ] `gh` CLI autenticado en su entorno con su propia cuenta GitHub (no la tuya).
- [ ] Acceso al canal Discord donde se coordina (idealmente uno dedicado a BaW OS, no el general de OpenClaw).
- [ ] **Lectura** de las páginas Notion linkeadas en `AGENTS.md` §5. No edición — Notion no es source of truth.
- [ ] Si va a tocar Supabase: acceso al project `zlcgxmllaeweypyodvzk` con rol limitado a `developer` (no `owner`).

### 2.2 — Mensaje de onboarding (mándaselo en Discord antes de la primera tarea)

```
Andrés, te toca BaW OS. Antes de tocar nada lee, en este orden:

1. https://github.com/zxy-vc/baw-os/blob/main/AGENTS.md
2. https://github.com/zxy-vc/baw-os/blob/main/CLAUDE.md
3. https://github.com/zxy-vc/baw-os/blob/main/docs/PROJECT_STATE.md
4. https://github.com/zxy-vc/baw-os/blob/main/docs/COLAB_ANDRES.md (este doc)

Después corre:

  git fetch origin && gh pr list --state all --limit 15

y dime qué entendiste del estado actual antes de proponer cualquier trabajo. Si tu plan choca con algo de AGENTS.md, dímelo en lugar de improvisar.
```

---

## 3 · Reglas operacionales para Andrés

Estas son **adicionales** a las de `AGENTS.md`. Aplican solo a Andrés porque son una capa extra de control hasta que la colaboración sea estable.

### 3.1 — Una tarea, un PR, un commit-author identificable

- Cada tarea Andrés la ejecuta en su propia rama: `andres/<scope>` (ej: `andres/cobranza-mateos`).
- Sus commits deben tener `git config user.name="Andres CTO"` y `user.email=<email-suyo>`.
- Un PR = una tarea. No bundles.

### 3.2 — Discord = conversación, GitHub = decisiones

- **Toda decisión técnica vinculante** se documenta como comentario en el PR de GitHub, no en Discord.
- Discord puede usarse para preguntas rápidas o para "voy a empezar X". Pero el plan, el diff y el merge viven en GitHub.
- Si Discord muere o se pierde el thread, el PR debe ser auto-explicativo.

### 3.3 — Plan en el PR antes de código en el PR

- Andrés abre el PR con título + body explicando el plan, **sin código todavía** (commit vacío o solo `docs/` con la propuesta).
- Tú das OK explícito en el PR.
- Recién entonces empuja los commits con código.
- Esto fuerza alineación temprana y evita PRs gigantes que hay que rechazar.

### 3.4 — Tu único merge

- **Solo Fran mergea a main.** Andrés nunca corre `gh pr merge` en este repo, sin importar la urgencia.
- Si Andrés está bloqueado esperando merge, el cuello de botella es real y útil — fuerza priorización.

### 3.5 — Conflictos con sprint en curso

Si la rama de Andrés se quedó atrás de main mientras esperaba review:

- Andrés rebasea sobre `origin/main` actualizado (ver `AGENTS.md` §4)
- Resuelve conflictos él, no tú
- Hace `--force-with-lease` (no `--force` a ciegas)
- Vuelve a pedir review

### 3.6 — Scope discipline (refuerzo)

`AGENTS.md` §1.4 ya lo dice, pero con Andrés se enfatiza: **si encuentra algo que mejorar fuera del scope del PR, abre issue en GitHub, no commit**. Históricamente este fue uno de los puntos de fricción.

---

## 4 · Tareas iniciales recomendadas para reabrir colaboración

Estas son tareas con scope cerrado, riesgo bajo y entregables claros. Buenas para reconstruir confianza:

### 4.1 — Tier "warm-up" (riesgo bajo)

- **Cerrar issue [#22](https://github.com/zxy-vc/baw-os/issues/22)** (`getOrgIdAsync()` shim en webhooks) — migración mecánica con tests claros.
- **Limpieza de HEX residuales en componentes legacy** (issue [#24](https://github.com/zxy-vc/baw-os/issues/24)) — visual diff fácil de revisar.

### 4.2 — Tier "test de criterio" (riesgo medio)

- **Eliminación de `member_role` enum legacy** (issue [#23](https://github.com/zxy-vc/baw-os/issues/23)) — toca DB + código + RLS, requiere plan cuidadoso.
- **Hardening de deploy Vercel con submodule baw-design** — debugging real, requiere razonar sobre CI.

### 4.3 — Tier "ownership" (después de 2-3 PRs limpios)

- Liderar Sprint 7 con un módulo entero (ej: Gestión de edificios y propietarios), con tu rol como reviewer humano.

**No saltes tiers.** Si Andrés rompe algo en warm-up, no le des tier 2.

---

## 5 · Señales de que la colaboración está funcionando

Después de cada PR de Andrés evalúa:

- [ ] ¿El plan inicial coincidió con el código final? (sin "creep")
- [ ] ¿TS verde al primer push? (sin tener que pedirlo)
- [ ] ¿Respetó invariantes de `AGENTS.md`? (sin tokens paralelos, sin tocar navegación canónica, etc.)
- [ ] ¿El commit message es descriptivo en una línea?
- [ ] ¿Documentó el cambio en Notion (`AGENTS.md` §6)?

Si los 5 son ✅ tres PRs seguidos, sube de tier. Si falla el mismo punto 2 veces, **detén la colaboración** y revisa el protocolo con Andrés antes de continuar.

---

## 6 · Señales de que algo va mal

Detén el PR si ves cualquiera de estas:

- Andrés mergea solo a main (regla §3.4 violada)
- PR mezcla scopes (cobranza + estilos + DB en uno)
- Cambios en `design/baw-design/tokens/` sin PR dedicado y sin design rationale
- Cambios en `src/lib/navigation.ts`, `src/lib/platform-admin.ts`, o `src/lib/org-context.ts` sin issue previo
- Commits con `--force` (no `--force-with-lease`) sobre ramas compartidas
- "Lo arreglé en producción" — no se hot-fixea producción sin PR

---

## 7 · Plantilla de feedback para Andrés post-PR

Usa este template como comentario al PR cuando lo apruebes o rechaces:

```
**Review BaW OS · PR #<N>**

✅ / ❌ Plan vs. código
✅ / ❌ TS verde
✅ / ❌ AGENTS.md respetado
✅ / ❌ Scope disciplinado
✅ / ❌ Commit message
✅ / ❌ Log Notion

Comentarios:
- ...

Próximo:
- [ ] Si verde 5/5: subir a tier siguiente
- [ ] Si rojo en 1+: arreglar antes de mergear
```

Esto le da a Andrés señal explícita y a ti trazabilidad de su evolución.

---

**Mantenido por:** Fran Durán
**Última revisión:** 2026-05-02
**Siguiente revisión:** después de los próximos 3 PRs de Andrés, ajustar protocolo.
