-- BaW OS — Sprint 3 / S9 Hotfix RLS post-merge
-- Bug raíz: tabla `organizations` con RLS habilitado y 0 policies (SELECT bloqueado al user logueado)
-- + tablas operativas (units, contracts, payments, incidents, occupants) con policies legacy
-- `allow_all_*` (qual=true) que filtran nada, exponiendo data cross-tenant.
--
-- Fix:
--   1. Crear policies tenant-aware en `organizations` (SELECT/UPDATE para members).
--   2. Reemplazar `allow_all_*` por policies con filtro `org_id IN org_members(auth.uid())`.
--   3. Mantener compatibilidad con service-role (que bypassa RLS por design).

BEGIN;

-- =====================================================================
-- 1) organizations — agregar policies tenant-aware
-- =====================================================================
DROP POLICY IF EXISTS organizations_select ON public.organizations;
DROP POLICY IF EXISTS organizations_update ON public.organizations;

CREATE POLICY organizations_select ON public.organizations
  FOR SELECT
  USING (
    id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY organizations_update ON public.organizations
  FOR UPDATE
  USING (
    id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role)
    )
  );

-- INSERT/DELETE de organizations queda para service-role únicamente
-- (onboarding usa createServiceClient → bypass RLS).

-- =====================================================================
-- 2) units — drop allow_all + policies tenant-aware
-- =====================================================================
DROP POLICY IF EXISTS allow_all_units ON public.units;

CREATE POLICY units_select ON public.units
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY units_insert ON public.units
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role, 'pm_operator'::member_role)
    )
  );

CREATE POLICY units_update ON public.units
  FOR UPDATE
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role, 'pm_operator'::member_role)
    )
  );

CREATE POLICY units_delete ON public.units
  FOR DELETE
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role)
    )
  );

-- =====================================================================
-- 3) contracts — drop allow_all + policies tenant-aware
-- =====================================================================
DROP POLICY IF EXISTS allow_all_contracts ON public.contracts;

CREATE POLICY contracts_select ON public.contracts
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY contracts_insert ON public.contracts
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role, 'pm_operator'::member_role)
    )
  );

CREATE POLICY contracts_update ON public.contracts
  FOR UPDATE
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role, 'pm_operator'::member_role)
    )
  );

CREATE POLICY contracts_delete ON public.contracts
  FOR DELETE
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role)
    )
  );

-- =====================================================================
-- 4) payments — drop allow_all + policies tenant-aware
-- =====================================================================
DROP POLICY IF EXISTS allow_all_payments ON public.payments;

CREATE POLICY payments_select ON public.payments
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY payments_insert ON public.payments
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role, 'pm_operator'::member_role)
    )
  );

CREATE POLICY payments_update ON public.payments
  FOR UPDATE
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role, 'pm_operator'::member_role)
    )
  );

CREATE POLICY payments_delete ON public.payments
  FOR DELETE
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role)
    )
  );

-- =====================================================================
-- 5) incidents — drop allow_all + policies tenant-aware
-- =====================================================================
DROP POLICY IF EXISTS allow_all_incidents ON public.incidents;

CREATE POLICY incidents_select ON public.incidents
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY incidents_insert ON public.incidents
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role, 'pm_operator'::member_role)
    )
  );

CREATE POLICY incidents_update ON public.incidents
  FOR UPDATE
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role, 'pm_operator'::member_role)
    )
  );

CREATE POLICY incidents_delete ON public.incidents
  FOR DELETE
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role)
    )
  );

-- =====================================================================
-- 6) occupants — drop allow_all + policies tenant-aware
-- =====================================================================
DROP POLICY IF EXISTS allow_all_occupants ON public.occupants;

CREATE POLICY occupants_select ON public.occupants
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY occupants_insert ON public.occupants
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role, 'pm_operator'::member_role)
    )
  );

CREATE POLICY occupants_update ON public.occupants
  FOR UPDATE
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role, 'pm_operator'::member_role)
    )
  );

CREATE POLICY occupants_delete ON public.occupants
  FOR DELETE
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner'::member_role, 'pm_admin'::member_role)
    )
  );

COMMIT;
