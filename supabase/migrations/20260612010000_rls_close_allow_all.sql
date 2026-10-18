-- BaW OS — Security audit 2026-06-12: cerrar RLS allow_all en org_members y
-- user_profiles (introducidas en 20260416_settings_mvp.sql).
--
-- BUG CRÍTICO que esto corrige: con `org_members_allow_all` (USING true,
-- WITH CHECK true), cualquier usuario autenticado podía leer/editar/borrar
-- membresías de CUALQUIER org — incluyendo auto-promoverse a pm_owner de una
-- org ajena. Lo mismo para perfiles en user_profiles.
--
-- Diseño: las políticas de org_members no pueden referenciarse a sí mismas
-- (recursión infinita en PG), así que usamos funciones SECURITY DEFINER.
-- Los roles admin aceptan pm_* (canónicos) y owner/admin (legacy, issue #23).
-- service_role bypassa RLS por diseño (las APIs server-side no cambian).

BEGIN;

-- =====================================================================
-- 1) Helpers SECURITY DEFINER (evitan recursión y centralizan la lógica)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.user_org_ids(uid uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.org_members
  WHERE user_id = uid AND is_active = true
$$;

CREATE OR REPLACE FUNCTION public.user_is_org_admin(uid uuid, org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = uid
      AND org_id = org
      AND is_active = true
      AND role IN (
        'pm_owner'::member_role, 'pm_admin'::member_role,
        'owner'::member_role, 'admin'::member_role  -- legacy, issue #23
      )
  )
$$;

REVOKE ALL ON FUNCTION public.user_org_ids(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_is_org_admin(uuid, uuid) FROM anon;

-- =====================================================================
-- 2) org_members — reemplazar allow_all por políticas reales
-- =====================================================================
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_members_allow_all ON public.org_members;

-- Ver: tu propia membresía + el roster de tus orgs
DROP POLICY IF EXISTS org_members_select ON public.org_members;
CREATE POLICY org_members_select ON public.org_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR org_id IN (SELECT public.user_org_ids(auth.uid()))
  );

-- Crear/editar/borrar membresías: solo admins de ESA org
DROP POLICY IF EXISTS org_members_insert ON public.org_members;
CREATE POLICY org_members_insert ON public.org_members
  FOR INSERT
  WITH CHECK (public.user_is_org_admin(auth.uid(), org_id));

DROP POLICY IF EXISTS org_members_update ON public.org_members;
CREATE POLICY org_members_update ON public.org_members
  FOR UPDATE
  USING (public.user_is_org_admin(auth.uid(), org_id))
  WITH CHECK (public.user_is_org_admin(auth.uid(), org_id));

DROP POLICY IF EXISTS org_members_delete ON public.org_members;
CREATE POLICY org_members_delete ON public.org_members
  FOR DELETE
  USING (public.user_is_org_admin(auth.uid(), org_id));

-- =====================================================================
-- 3) user_profiles — reemplazar allow_all
-- =====================================================================
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_profiles_allow_all ON public.user_profiles;

-- Ver: tu propio perfil + perfiles de compañeros de org (para el roster)
DROP POLICY IF EXISTS user_profiles_select ON public.user_profiles;
CREATE POLICY user_profiles_select ON public.user_profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.user_id = user_profiles.id
        AND om.org_id IN (SELECT public.user_org_ids(auth.uid()))
    )
  );

-- Escribir: solo tu propio perfil
DROP POLICY IF EXISTS user_profiles_insert ON public.user_profiles;
CREATE POLICY user_profiles_insert ON public.user_profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS user_profiles_update ON public.user_profiles;
CREATE POLICY user_profiles_update ON public.user_profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

COMMIT;

-- Rollback (NO usar salvo emergencia — reabre el hueco de seguridad):
--   CREATE POLICY org_members_allow_all ON org_members FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY user_profiles_allow_all ON user_profiles FOR ALL USING (true) WITH CHECK (true);
