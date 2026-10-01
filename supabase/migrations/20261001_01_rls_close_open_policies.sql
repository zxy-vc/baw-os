-- BAW-1 · RLS (a) — Cierre de políticas abiertas que NO requiere deploy de código
-- ============================================================================
-- Escrita contra el inventario REAL de pg_policies de prod (CSV del 2026-10-01),
-- no contra el repo. Reemplaza a 20260720_01/02/03 (eliminadas: hacían DROP de
-- nombres que no existen en prod y dejaban `allow_all_reservations` vivo).
--
-- Cada DROP usa el nombre REAL de prod y, además, el nombre del repo con
-- IF EXISTS, para que la migración sirva en cualquier entorno.
--
-- Cubre 12 de las 14 tablas con qual/with_check = true. Las otras 2 (tasks,
-- tenant_applications) van en 20261001_02 porque requieren deploy de código.
--
--   tabla                 policy abierta en prod (roles)              acción
--   reservations          allow_all_reservations (public)             DROP → 4 policies por organization_id
--                         "Guest portal read by token" (public)       DROP (portal usa service-role)
--   audit_log             allow_all (public)                          DROP → select/insert por org_id
--   webhook_events        allow_all_webhook_events (public)           DROP → select/update por org_id
--   str_seasons           allow_all_str_seasons (public)              DROP → 4 policies por org_id
--   media_assets          allow_all_media_assets (public)             DROP → 4 policies por org de la unidad
--   unit_spaces           allow_all_unit_spaces (public)              DROP → 4 policies por org de la unidad
--   expenses              allow_all_expenses (public)                 DROP (ya existen *_member en prod)
--   whatsapp_notifications allow_all (public)                         DROP (sin acceso de navegador)
--   escalation_rules      allow_all (public)                          DROP (sin acceso en código)
--   unit_prices           "Allow all for authenticated" (auth.)       DROP (tabla deprecada, sin lectores)
--   pricing_config        admin_read_pricing SELECT true (public)     DROP (sin lectores)
--   agent_interactions    agent_interactions_insert CHECK true        DROP (solo service-role inserta)
--
-- ADICIONAL (fuera de las 14, CRÍTICO): org_members_self
--   Prod: ALL, USING (user_id = auth.uid()), WITH CHECK null. Sin WITH CHECK,
--   Postgres usa el USING como check en INSERT/UPDATE → cualquier usuario
--   autenticado puede insertarse en CUALQUIER org con rol pm_owner, o
--   promover su propia fila. Eso anula TODAS las policies tenant-aware (las
--   de esta migración incluidas). Origen: docs/schema.sql:275-276.
--   Lectura propia ya cubierta por org_members_select (user_id = auth.uid()).
--   Escrituras legítimas: settings/page.tsx:136,155 (pasan por
--   org_members_update/insert con user_is_org_admin) y onboarding
--   (api/onboarding/route.ts:65,120 usa service-role). → DROP sin reemplazo.
--
-- Helper: public.user_org_ids(uuid) — SECURITY DEFINER, filtra is_active.
--   Confirmado en prod (lo usan expenses_*_member, invoices_select_member,
--   org_members_select). El pre-flight aborta si no existe.
--
-- service_role tiene BYPASSRLS: rutas de servidor con createServiceClient()
-- no se ven afectadas por nada de este archivo.
--
-- ⚠️ NO EJECUTADA. Correr en Supabase SQL editor (rol postgres).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Pre-flight: aborta TODA la transacción si el esquema no es el esperado
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
  req record;
BEGIN
  IF to_regprocedure('public.user_org_ids(uuid)') IS NULL THEN
    missing := missing || 'function public.user_org_ids(uuid)'::text;
  END IF;

  FOR req IN
    SELECT * FROM (VALUES
      ('reservations',   'organization_id'),
      ('audit_log',      'org_id'),
      ('webhook_events', 'org_id'),
      ('str_seasons',    'org_id'),
      ('units',          'org_id'),
      ('media_assets',   'unit_id'),
      ('unit_spaces',    'unit_id')
    ) AS v(tbl, col)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = req.tbl AND column_name = req.col
    ) THEN
      missing := missing || format('%s.%s', req.tbl, req.col);
    END IF;
  END LOOP;

  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'BAW-1 pre-flight: falta %', array_to_string(missing, ', ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) org_members — cerrar auto-alta / auto-promoción (ver cabecera)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS org_members_self       ON public.org_members;  -- prod
DROP POLICY IF EXISTS "org_members_self"     ON public.org_members;  -- docs/schema.sql
DROP POLICY IF EXISTS org_members_allow_all  ON public.org_members;  -- repo 20260416 (por si acaso)

-- ---------------------------------------------------------------------------
-- 2) reservations — fuga cross-tenant (0 filas en prod)
--    Navegador autenticado: reservations/page.tsx:142,243(+organization_id),305-321;
--    calendario/page.tsx:229,484; calendario/[unitId]/page.tsx:116;
--    contacts/page.tsx:96,218; estancias/page.tsx:89; clientes/page.tsx:394;
--    lib/quote-flow.ts:176(+organization_id),230,291,300.
--    Anon: ninguno. Portal huésped = service-role (api/portal/guest/[token]/route.ts:5,19-25).
-- ---------------------------------------------------------------------------
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_reservations                  ON public.reservations;  -- prod
DROP POLICY IF EXISTS "Guest portal read by token"            ON public.reservations;  -- prod + repo 20260404_guest_portal
DROP POLICY IF EXISTS "org members can manage reservations"   ON public.reservations;  -- repo 20260329
DROP POLICY IF EXISTS reservations_select ON public.reservations;
DROP POLICY IF EXISTS reservations_insert ON public.reservations;
DROP POLICY IF EXISTS reservations_update ON public.reservations;
DROP POLICY IF EXISTS reservations_delete ON public.reservations;

CREATE POLICY reservations_select ON public.reservations
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.user_org_ids(auth.uid())));

CREATE POLICY reservations_insert ON public.reservations
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.user_org_ids(auth.uid())));

CREATE POLICY reservations_update ON public.reservations
  FOR UPDATE TO authenticated
  USING      (organization_id IN (SELECT public.user_org_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT public.user_org_ids(auth.uid())));

CREATE POLICY reservations_delete ON public.reservations
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.user_org_ids(auth.uid())));

-- ---------------------------------------------------------------------------
-- 3) audit_log — append-only para usuarios
--    Navegador: ledger/page.tsx:209 (insert con org_id), audit/page.tsx:51,
--    whatsapp/page.tsx:71,84 (select). Resto de escritores: service-role.
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all        ON public.audit_log;  -- prod + repo 20260403
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;

CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())));

CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.user_org_ids(auth.uid())));

-- ---------------------------------------------------------------------------
-- 4) webhook_events — bandeja de notificaciones
--    Navegador: notifications/page.tsx:67 (select), :83,:91 (update read).
--    Insert solo service-role (lib/webhooks.ts:21).
-- ---------------------------------------------------------------------------
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_webhook_events ON public.webhook_events;  -- prod
DROP POLICY IF EXISTS webhook_events_select    ON public.webhook_events;
DROP POLICY IF EXISTS webhook_events_update    ON public.webhook_events;

CREATE POLICY webhook_events_select ON public.webhook_events
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())));

CREATE POLICY webhook_events_update ON public.webhook_events
  FOR UPDATE TO authenticated
  USING      (org_id IN (SELECT public.user_org_ids(auth.uid())))
  WITH CHECK (org_id IN (SELECT public.user_org_ids(auth.uid())));

-- ---------------------------------------------------------------------------
-- 5) str_seasons — temporadas STR
--    Navegador: pricing/page.tsx:87(select .eq org),166-176(insert/update con
--    org_id),186(delete); calendario/[unitId]/page.tsx:125,685(insert con
--    org_id),702,710; calendario/page.tsx:232 y quotes/page.tsx:111 (select
--    SIN filtro de org → hoy mezclan temporadas de otras orgs; RLS lo corrige).
--    Sitio público: no lee str_seasons.
-- ---------------------------------------------------------------------------
ALTER TABLE public.str_seasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_str_seasons ON public.str_seasons;  -- prod
DROP POLICY IF EXISTS str_seasons_select    ON public.str_seasons;
DROP POLICY IF EXISTS str_seasons_insert    ON public.str_seasons;
DROP POLICY IF EXISTS str_seasons_update    ON public.str_seasons;
DROP POLICY IF EXISTS str_seasons_delete    ON public.str_seasons;

CREATE POLICY str_seasons_select ON public.str_seasons
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())));

CREATE POLICY str_seasons_insert ON public.str_seasons
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.user_org_ids(auth.uid())));

CREATE POLICY str_seasons_update ON public.str_seasons
  FOR UPDATE TO authenticated
  USING      (org_id IN (SELECT public.user_org_ids(auth.uid())))
  WITH CHECK (org_id IN (SELECT public.user_org_ids(auth.uid())));

CREATE POLICY str_seasons_delete ON public.str_seasons
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())));

-- ---------------------------------------------------------------------------
-- 6) unit_spaces / media_assets — scope por la org de la UNIDAD padre
--    (robusto aunque filas viejas tengan org_id NULL).
--    Navegador: units/[id]/media/page.tsx:43-154; units/[id]/publicacion/page.tsx:55.
--    Sitio público: v_public_unit_media / v_public_units (20260703_public_listing_phase1.sql:30-73)
--    son vistas sin security_invoker → corren como su owner y no dependen de
--    estas policies (prueba en prod: anon ya lee v_public_units aunque `units`
--    solo tiene policies de org_members).
-- ---------------------------------------------------------------------------
ALTER TABLE public.unit_spaces  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_unit_spaces  ON public.unit_spaces;   -- prod + repo 20260415
DROP POLICY IF EXISTS unit_spaces_select     ON public.unit_spaces;
DROP POLICY IF EXISTS unit_spaces_insert     ON public.unit_spaces;
DROP POLICY IF EXISTS unit_spaces_update     ON public.unit_spaces;
DROP POLICY IF EXISTS unit_spaces_delete     ON public.unit_spaces;

CREATE POLICY unit_spaces_select ON public.unit_spaces
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = unit_spaces.unit_id
      AND u.org_id IN (SELECT public.user_org_ids(auth.uid()))
  ));

CREATE POLICY unit_spaces_insert ON public.unit_spaces
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = unit_spaces.unit_id
      AND u.org_id IN (SELECT public.user_org_ids(auth.uid()))
  ));

CREATE POLICY unit_spaces_update ON public.unit_spaces
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = unit_spaces.unit_id
      AND u.org_id IN (SELECT public.user_org_ids(auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = unit_spaces.unit_id
      AND u.org_id IN (SELECT public.user_org_ids(auth.uid()))
  ));

CREATE POLICY unit_spaces_delete ON public.unit_spaces
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = unit_spaces.unit_id
      AND u.org_id IN (SELECT public.user_org_ids(auth.uid()))
  ));

DROP POLICY IF EXISTS allow_all_media_assets ON public.media_assets;  -- prod + repo 20260415
DROP POLICY IF EXISTS media_assets_select    ON public.media_assets;
DROP POLICY IF EXISTS media_assets_insert    ON public.media_assets;
DROP POLICY IF EXISTS media_assets_update    ON public.media_assets;
DROP POLICY IF EXISTS media_assets_delete    ON public.media_assets;

CREATE POLICY media_assets_select ON public.media_assets
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = media_assets.unit_id
      AND u.org_id IN (SELECT public.user_org_ids(auth.uid()))
  ));

CREATE POLICY media_assets_insert ON public.media_assets
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = media_assets.unit_id
      AND u.org_id IN (SELECT public.user_org_ids(auth.uid()))
  ));

CREATE POLICY media_assets_update ON public.media_assets
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = media_assets.unit_id
      AND u.org_id IN (SELECT public.user_org_ids(auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = media_assets.unit_id
      AND u.org_id IN (SELECT public.user_org_ids(auth.uid()))
  ));

CREATE POLICY media_assets_delete ON public.media_assets
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = media_assets.unit_id
      AND u.org_id IN (SELECT public.user_org_ids(auth.uid()))
  ));

-- ---------------------------------------------------------------------------
-- 7) expenses — solo quitar el allow_all. Ya existen en prod
--    expenses_{select,insert,update}_member (20260704_02_finance_rls_hygiene.sql:102-117).
--    Navegador: gastos/page.tsx:115 (select .eq org), :212-230 (insert/update con org_id).
--    Sin DELETE desde navegador (no hay policy de delete: correcto).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS allow_all_expenses ON public.expenses;  -- prod

-- ---------------------------------------------------------------------------
-- 8) Tablas sin acceso legítimo de anon/authenticated → solo service-role
-- ---------------------------------------------------------------------------
-- whatsapp_notifications: solo api/notifications/whatsapp/route.ts:14 y
--   lib/lifecycle.ts:210,238 (llamado desde api/lifecycle con service-role).
DROP POLICY IF EXISTS allow_all ON public.whatsapp_notifications;  -- prod

-- escalation_rules: cero referencias en src/ (no hay CREATE TABLE en el repo).
DROP POLICY IF EXISTS allow_all ON public.escalation_rules;  -- prod

-- unit_prices: deprecada, sin lectores (quotes/page.tsx:5-16, pricing/page.tsx:5).
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.unit_prices;  -- prod

-- pricing_config: cero referencias en src/. Se conserva admin_write_pricing
--   (qual = auth.role()='service_role', no expone nada).
DROP POLICY IF EXISTS admin_read_pricing ON public.pricing_config;  -- prod + repo 20260327

-- agent_interactions: inserts solo desde service-role
--   (api/agents/discord-interactions/route.ts:135-136,
--    api/chat/conversations/[id]/messages/route.ts:33,44).
--   Se conserva agent_interactions_select (ya es tenant-aware).
DROP POLICY IF EXISTS agent_interactions_insert ON public.agent_interactions;  -- prod + repo 20260523

-- ---------------------------------------------------------------------------
-- 9) Defensa en profundidad: anon sin privilegios en tablas que nunca toca
--    desde el navegador (hoy anon tiene SELECT/INSERT/UPDATE/DELETE/TRUNCATE…
--    sobre reservations). Guardado con to_regclass por drift entre entornos.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'reservations', 'audit_log', 'webhook_events', 'str_seasons',
    'unit_spaces', 'media_assets', 'expenses', 'whatsapp_notifications',
    'escalation_rules', 'unit_prices', 'pricing_config', 'agent_interactions',
    'v_pricing_config'  -- vista sin security_invoker sobre pricing_config: sin lectores en src/
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;

  IF to_regclass('public.v_pricing_config') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.v_pricing_config FROM authenticated';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 10) Hardening global: RLS no aplica a TRUNCATE; TRIGGER/REFERENCES no los
--     necesita ningún cliente. PostgREST (supabase-js) no puede emitir
--     ninguno de los tres y no hay cliente SQL directo en package.json.
-- ---------------------------------------------------------------------------
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Para tablas futuras creadas por el rol que corre esta migración (postgres).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN (correr después; solo lectura salvo los smoke tests con ROLLBACK)
-- ============================================================================
-- V1. Policies abiertas restantes para roles distintos de service_role.
--     Esperado tras (a): SOLO tasks.allow_all y tenant_applications.anon_*
--     (se cierran en 20261001_02).
--
--   SELECT tablename, policyname, roles, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND (qual = 'true' OR with_check = 'true')
--     AND NOT (roles <@ ARRAY['service_role']::name[])
--   ORDER BY 1, 2;
--
-- V2. org_members_self ya no existe (esperado: 0 filas).
--
--   SELECT policyname FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'org_members' AND policyname = 'org_members_self';
--
-- V3. Policies de reservations (esperado: exactamente las 4 reservations_*).
--
--   SELECT policyname, roles, cmd, qual, with_check
--   FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reservations';
--
-- V4. TRUNCATE/TRIGGER/REFERENCES a anon/authenticated (esperado: 0 filas).
--
--   SELECT grantee, table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public'
--     AND grantee IN ('anon', 'authenticated')
--     AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES');
--
-- V5. Smoke test anon (esperado: ERROR permission denied for table reservations).
--
--   BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM public.reservations; ROLLBACK;
--
-- V6. Smoke test miembro: sustituye <USER_UUID> por un usuario real de BaW.
--     Esperado: str_seasons solo de sus orgs; insert en org ajena → ERROR RLS.
--
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<USER_UUID>","role":"authenticated"}', true);
--   SELECT DISTINCT org_id FROM public.str_seasons;
--   SELECT count(*) FROM public.audit_log WHERE org_id NOT IN (SELECT public.user_org_ids(auth.uid()));  -- 0
--   ROLLBACK;
-- ============================================================================
