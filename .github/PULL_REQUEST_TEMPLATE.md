<!--
ANTES DE ABRIR ESTE PR: lee AGENTS.md en la raíz del repo si no lo has hecho.
Especialmente la sección 1 (Protocolo de pre-flight) y la sección 7 (Anti-patrones).
-->

## Summary

<!-- 1-3 líneas: qué entrega este PR y por qué. -->


## Pre-flight checklist

- [ ] `git fetch origin && git log origin/main --oneline -10` — revisé estado real de main
- [ ] `gh pr list --state all --limit 10` — verifiqué que mi trabajo no duplica un PR ya mergeado
- [ ] `git log --oneline -5 -- <archivos modificados>` — revisé historia reciente de archivos que toqué
- [ ] Esta rama está basada en `origin/main` actualizado (último commit visible: `<sha>`)
- [ ] Scope discipline: este PR tiene **un solo objetivo**, no mezcla mejoras de scope distinto
- [ ] `npx tsc --noEmit` pasa
- [ ] `npm run build` pasa

## Invariantes (sección 2 de AGENTS.md)

Marca solo si tu PR las **respeta** (no las viola):

- [ ] No toqué la tipografía Inter en `src/app/layout.tsx`
- [ ] No creé sets paralelos de tokens (`--d-*`, `--brand-*`, etc.) — uso `var(--baw-*)` desde `design/baw-design/tokens/`
- [ ] No agregué/quité/renombré secciones de `SIDEBAR_SECTIONS` en `src/lib/navigation.ts`
- [ ] No bypass-eé `isPlatformAdmin()` ni `resolveOrgId()`
- [ ] No agregué referencias al enum legacy `member_role`
- [ ] No introduje agentes fuera del catálogo 10+1 (BaW + 4 PM-Ops + 6 ZXY shared)
- [ ] No eliminé features mergeadas funcionales (badge notificaciones, sub-navs, etc.)

Si **alguna** invariante se viola intencionalmente, explica por qué aquí:

<!-- explicación, link a issue/acuerdo en Notion -->


## Acuerdos canónicos afectados

<!-- Marca solo los que aplican. Lista links si modifican un acuerdo. -->

- [ ] Ninguno — este PR es estrictamente implementación dentro de los acuerdos vigentes
- [ ] Schema DB / migración SQL aplicada (link al log Notion):
- [ ] Diseño / tokens / tipografía:
- [ ] Navegación canónica:
- [ ] Roles / permisos / RLS:
- [ ] Catálogo de agentes:
- [ ] API pública:

## Verification

<!-- Cómo verificaste que funciona. Comandos, screenshots de preview Vercel, etc. -->

- [ ] Build local verde
- [ ] Migraciones SQL aplicadas en producción ANTES de pushear código que las consume (si aplica)
- [ ] Preview Vercel inspeccionado visualmente (si afecta UI)

## Issues relacionados

<!-- Closes #N, References #N -->


## Follow-ups detectados (NO incluidos en este PR)

<!-- Cosas que viste que mejorar pero NO entran en este scope. Abre issues separados. -->

- [ ] Issue #N: ...

## Merge

- [ ] Confirmo que **NO** se mergeará automáticamente. Espero aprobación humana de @franduranv.
