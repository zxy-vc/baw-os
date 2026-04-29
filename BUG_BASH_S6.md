# Bug Bash · Sprint 3 / S6

**Fecha:** 2026-04-29 04:30–05:30 CST
**Operador:** Perplexity Personal Computer (autónomo)

## Journeys recorridos

1. ✅ Onboarding desde cero (`/onboarding`) — wizard de 4 pasos verificado por código contra el API v2 (S3). Contrato body↔handler alineado, RLS service-role bypass funcional, rollback en cascada presente.
2. ✅ Mission Control empty state (`/`) — empty state honesto cuando no hay unidades+contratos.
3. ⚠️ Alta de unidad (`/units` + UnitModal) — depende de `getOrgId()` legacy. **Ver Bug #1**.
4. ⚠️ Alta de contrato (`/contracts/new`) — depende de `getOrgId()` legacy. **Ver Bug #1**.
5. ⚠️ Registro de pago (`/payments` + `/cobros`) — depende de `getOrgId()` legacy. **Ver Bug #1**.
6. ⚠️ Owner portal (`/owner/[token]`, `/portal/[token]`, `/tenant/[token]`) — usa tokens, debería estar OK.
7. ⚠️ Settings (`/settings`) — depende de `getOrgId()` legacy. **Ver Bug #1**.

## Bugs encontrados

### Bug #1 (BLOCKER, parche temporal aplicado)

**Síntoma:** tras el wipe operativo de S1, todas las APIs legacy (~73 archivos: `/api/units`, `/api/contracts`, `/api/payments`, `/api/tasks`, `/api/notifications`, `/api/whatsapp/*`, etc.) seguían apuntando a `ORG_ID = 'ed4308c7-2bdb-46f2-be69-7c59674838e2'` (la UUID Mateos eliminada en S1). Resultado esperado: cualquier query legacy retorna 0 filas o error de FK contra una org inexistente.

**Causa raíz:** `src/lib/api-auth.ts` definía `ORG_ID` como constante hardcoded.

**Parche aplicado en S6 (PR #9):**
- `getOrgId()` ahora usa cache con TTL (60s) que se rellena dinámicamente con la primera organization disponible.
- Nuevo `getOrgIdAsync()` para usar en APIs nuevas — resuelve via service-role la primera org en `organizations` ordenada por `created_at`.
- Nuevo `setActiveOrgId(orgId)` que el onboarding llama tras crear la nueva PM Company para calentar el cache inmediatamente.
- Soporta env var `BAW_FALLBACK_ORG_ID` para casos edge.

**Limitaciones del parche:**
- Best-effort, no es seguro en multi-tenant real (la primera org gana).
- Cualquier nuevo PM Company creado en una segunda sesión **no** será visible para las APIs legacy hasta que el cache expire (60s) o reinicies el server.
- No respeta el principio "el org_id debe venir del JWT del usuario actual".

**Decisión humana pendiente (Fran):** refactor real para leer `org_id` del JWT del usuario en cada API legacy. Opciones:
1. Middleware Next.js que inyecta header `x-baw-org-id` en cada request server-side.
2. Cada API recibe `cookies()` y lee `org_id` del JWT directamente.
3. Migrar las 73 APIs a `getOrgIdAsync()` con `await` (atómico pero requiere tocar todos los handlers).

### Bug #2 (resuelto en S3, no en este sprint)

**Síntoma histórico:** el API onboarding pre-S3 insertaba `occupants.type = 'tenant'` que viola el CHECK constraint `IN ('ltr', 'str', 'both')`. Causaba 500 al onboarding inicial.

**Causa raíz:** mismatch entre el código TypeScript y el schema real de `occupants.type` (es TEXT con CHECK, no enum).

**Estado:** corregido en PR #6 (Sprint 3 / S3) cuando se reescribió el API completo. El nuevo wizard no crea occupants en el onboarding (los crea cuando se firma el primer contrato).

### Bug #3 (no crítico, deuda documentada)

**Síntoma:** 206 referencias HEX/`rgba()` directas en componentes individuales (`Sidebar.tsx`, `AppShell.tsx`, `ui/status.tsx`, etc.) siguen vivas tras la migración a tokens canónicos OKLCH del PR #8 (S5).

**Estado:** no bloquea el rendering — los aliases `--baw-*` migran automáticamente todos los consumidores via CSS. Migrar las 206 ocurrencias a `var(--brand-*)`/`var(--agent-*)`/`var(--green-*)`/etc. mejora consistencia visual en wide-gamut pero no afecta funcionalidad.

**Recomendación:** sprint posterior dedicado, idealmente con visual regression tests.

## Recomendación al despertar

1. Revisar PRs #5, #6, #7, #8, #9 en orden de dependencia.
2. Decidir camino del refactor `getOrgId` (Bug #1 sigue siendo deuda crítica).
3. Probar onboarding E2E en preview de Vercel del PR #9 antes de merge a main.
