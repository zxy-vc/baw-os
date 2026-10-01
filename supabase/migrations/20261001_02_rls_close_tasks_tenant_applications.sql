-- BAW-1 · RLS (b) — Cierre que REQUIERE deploy de código primero
-- ============================================================================
-- Las 2 tablas restantes de las 14 con qual/with_check = true en prod.
-- Correr DESPUÉS de 20261001_01 y SOLO cuando el código de este mismo PR esté
-- desplegado en producción.
--
--   tabla                policy abierta en prod (roles)            acción
--   tenant_applications  anon_read_by_token   SELECT true (anon)   DROP
--                        anon_insert_intake   INSERT true (anon)   DROP
--                        anon_update_by_token UPDATE true (anon)   DROP
--                        service_role_intake  ALL true (service_role) CONSERVAR (no expone nada)
--   tasks                allow_all ALL true/true (public)          DROP → 4 policies por org_id
--
-- tenant_applications — por qué requiere código:
--   Hoy cualquiera con la anon key (pública, va en el bundle JS) puede leer
--   TODAS las solicitudes (titulares, avales, ingresos, URLs de INE), editarlas
--   (p. ej. status='approved') o crear basura. El token de la URL nunca llega a
--   Postgres, así que "por token" no filtra nada: las 3 policies son USING(true).
--   Único lector anon real: src/app/(public)/apply/[token]/page.tsx:27-35, que
--   usaba createSupabaseServer() (anon key). Este PR lo cambia a service-role +
--   .eq('token', token), igual que api/intake/route.ts:10-15. Si esta migración
--   corre ANTES del deploy, /apply/<token> devuelve 404 a todos los aplicantes.
--   Escrituras: ya son service-role (api/intake/route.ts:31-69,
--   api/intake/upload/route.ts:20-59, api/applications/route.ts:39-50,
--   api/public/v1/leads/route.ts:162-171). Ningún acceso de navegador
--   autenticado → no se crea policy para authenticated (deny).
--
-- tasks — por qué requiere código:
--   tasks/page.tsx:80 y housekeeping/page.tsx:105 insertaban SIN org_id; con
--   el WITH CHECK nuevo fallarían. Este PR agrega org_id: orgId (useOrgContext).
--   Escritores de servidor (service-role, ya setean org_id): api/tasks/route.ts:44,
--   api/v1/tasks/route.ts:78, lib/agents/v1/dispatcher.ts:73.
--   Kiosco conserje (api/conserje/*, [orgSlug]/conserje): NO toca tasks.
--
-- ORDEN OBLIGATORIO:
--   1. Deploy del código de este PR (apply/[token]/page.tsx, tasks/page.tsx,
--      housekeeping/page.tsx).
--   2. Backfill de tasks con org_id NULL (bloque BACKFILL abajo, a mano).
--   3. Esta migración. El pre-flight ABORTA si quedan tasks con org_id NULL.
--
-- ⚠️ NO EJECUTADA.
-- ============================================================================

-- ============================================================================
-- BACKFILL (PASO 2 — correr a mano ANTES de esta migración, revisar cada paso)
-- ============================================================================
-- B0. Diagnóstico
--   SELECT entity_type, count(*) FROM public.tasks WHERE org_id IS NULL GROUP BY 1 ORDER BY 2 DESC;
--   SELECT id, name, created_at FROM public.organizations ORDER BY created_at;
--
-- B1. Inferir org por la entidad ligada (determinista; 0 filas si no aplica)
--   UPDATE public.tasks t SET org_id = u.org_id FROM public.units u
--    WHERE t.org_id IS NULL AND t.entity_type IN ('unit', 'units') AND t.entity_id = u.id;
--   UPDATE public.tasks t SET org_id = c.org_id FROM public.contracts c
--    WHERE t.org_id IS NULL AND t.entity_type IN ('contract', 'contracts') AND t.entity_id = c.id;
--   UPDATE public.tasks t SET org_id = i.org_id FROM public.incidents i
--    WHERE t.org_id IS NULL AND t.entity_type IN ('incident', 'incidents') AND t.entity_id = i.id;
--   UPDATE public.tasks t SET org_id = o.org_id FROM public.occupants o
--    WHERE t.org_id IS NULL AND t.entity_type IN ('occupant', 'occupants') AND t.entity_id = o.id;
--   UPDATE public.tasks t SET org_id = r.organization_id FROM public.reservations r
--    WHERE t.org_id IS NULL AND t.entity_type IN ('reservation', 'reservations') AND t.entity_id = r.id;
--
-- B2. Resto (housekeeping/tareas manuales sin entidad). Si hay UNA sola org,
--     se asigna sola; si hay más, el bloque solo avisa y hay que decidir a mano.
--   DO $$
--   DECLARE n int; only_org uuid;
--   BEGIN
--     SELECT count(*), min(id::text)::uuid INTO n, only_org FROM public.organizations;
--     IF n = 1 THEN
--       UPDATE public.tasks SET org_id = only_org WHERE org_id IS NULL;
--     ELSE
--       RAISE NOTICE 'Hay % orgs: asigna las tareas huérfanas a mano (B3)', n;
--     END IF;
--   END $$;
--
-- B3. (solo si B2 avisó) asignación manual, o borrar si son basura:
--   UPDATE public.tasks SET org_id = '<ORG_ID>' WHERE org_id IS NULL AND id IN (...);
--
-- B4. Debe dar 0 antes de seguir:
--   SELECT count(*) FROM public.tasks WHERE org_id IS NULL;
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Pre-flight
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  orphan_tasks bigint;
BEGIN
  IF to_regprocedure('public.user_org_ids(uuid)') IS NULL THEN
    RAISE EXCEPTION 'BAW-1 pre-flight: falta public.user_org_ids(uuid)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'org_id'
  ) THEN
    RAISE EXCEPTION 'BAW-1 pre-flight: falta tasks.org_id';
  END IF;

  IF to_regclass('public.tenant_applications') IS NULL THEN
    RAISE EXCEPTION 'BAW-1 pre-flight: falta la tabla tenant_applications';
  END IF;

  SELECT count(*) INTO orphan_tasks FROM public.tasks WHERE org_id IS NULL;
  IF orphan_tasks > 0 THEN
    RAISE EXCEPTION 'BAW-1 pre-flight: % tasks con org_id NULL — corre el BACKFILL primero', orphan_tasks;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) tenant_applications — sin acceso directo para anon/authenticated
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenant_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_read_by_token   ON public.tenant_applications;  -- prod + repo 20260404_tenant_intake:52
DROP POLICY IF EXISTS anon_insert_intake   ON public.tenant_applications;  -- prod + repo 20260404_tenant_intake:56
DROP POLICY IF EXISTS anon_update_by_token ON public.tenant_applications;  -- prod + repo 20260404_tenant_intake:60
-- service_role_intake (TO service_role) se conserva: service_role ya bypassa RLS.

REVOKE ALL ON public.tenant_applications FROM anon;

-- ---------------------------------------------------------------------------
-- 2) tasks — tenant-aware por org_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all    ON public.tasks;  -- prod + repo 20260403_tasks:16
DROP POLICY IF EXISTS tasks_select ON public.tasks;
DROP POLICY IF EXISTS tasks_insert ON public.tasks;
DROP POLICY IF EXISTS tasks_update ON public.tasks;
DROP POLICY IF EXISTS tasks_delete ON public.tasks;

CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())));

CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.user_org_ids(auth.uid())));

CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE TO authenticated
  USING      (org_id IN (SELECT public.user_org_ids(auth.uid())))
  WITH CHECK (org_id IN (SELECT public.user_org_ids(auth.uid())));

CREATE POLICY tasks_delete ON public.tasks
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())));

REVOKE ALL ON public.tasks FROM anon;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- V1. Ninguna policy abierta fuera de service_role (esperado: 0 filas).
--
--   SELECT tablename, policyname, roles, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND (qual = 'true' OR with_check = 'true')
--     AND NOT (roles <@ ARRAY['service_role']::name[])
--   ORDER BY 1, 2;
--
-- V2. Policies finales (esperado: tenant_applications solo service_role_intake;
--     tasks solo tasks_{select,insert,update,delete}).
--
--   SELECT tablename, policyname, roles, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN ('tasks', 'tenant_applications')
--   ORDER BY 1, 2;
--
-- V3. Smoke test anon (esperado: ERROR permission denied en ambas).
--
--   BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM public.tenant_applications; ROLLBACK;
--   BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM public.tasks; ROLLBACK;
--
-- V4. Manual en prod: abrir /apply/<token real> (debe cargar) y crear una tarea
--     en /tasks y /housekeeping (debe guardarse y aparecer).
-- ============================================================================
