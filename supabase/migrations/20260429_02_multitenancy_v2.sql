-- =============================================================================
-- Sprint 3 · S1 — Parte 2/2 — Multitenancy v2 + wipe operativo
-- =============================================================================
-- Objetivo:
--   1. Wipe de tablas operativas (preserva auth.users; vacía organizations y
--      org_members para que el onboarding de BaW Operations arranque de cero).
--   2. Capa Buildings entre Organizations y Units.
--   3. Capa Property Owners + ownership_stakes (validación sum<=100 por building).
--   4. RLS endurecido por org_id en todas las tablas nuevas usando los roles
--      pm_* (declarados en la migración 20260429_01).
--
-- Pre-requisito: la migración 20260429_01_member_role_pm_values.sql debe haberse
-- aplicado antes (los valores pm_* del enum no pueden usarse en la misma tx
-- donde se agregaron).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) WIPE de tablas operativas
-- -----------------------------------------------------------------------------

TRUNCATE TABLE
  public.payment_ledger,
  public.payments,
  public.contracts,
  public.reservations,
  public.tenant_applications,
  public.occupants,
  public.unit_prices,
  public.pricing_config,
  public.str_seasons,
  public.expenses,
  public.incidents,
  public.tasks,
  public.escalation_rules,
  public.audit_log,
  public.webhook_events,
  public.whatsapp_notifications,
  public.units
RESTART IDENTITY CASCADE;

DELETE FROM public.org_members;
DELETE FROM public.organizations;

-- -----------------------------------------------------------------------------
-- 2) Tabla buildings
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.buildings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  address     text,
  city        text,
  state       text,
  country     text NOT NULL DEFAULT 'MX',
  postal_code text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buildings_name_per_org_unique UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS buildings_org_id_idx ON public.buildings(org_id);

ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS buildings_select ON public.buildings;
DROP POLICY IF EXISTS buildings_insert ON public.buildings;
DROP POLICY IF EXISTS buildings_update ON public.buildings;
DROP POLICY IF EXISTS buildings_delete ON public.buildings;

CREATE POLICY buildings_select ON public.buildings
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY buildings_insert ON public.buildings
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner','pm_admin','pm_operator')
    )
  );

CREATE POLICY buildings_update ON public.buildings
  FOR UPDATE USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner','pm_admin','pm_operator')
    )
  );

CREATE POLICY buildings_delete ON public.buildings
  FOR DELETE USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner','pm_admin')
    )
  );

-- -----------------------------------------------------------------------------
-- 3) Units — agregar building_id NOT NULL (tabla está vacía post-wipe)
-- -----------------------------------------------------------------------------

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES public.buildings(id) ON DELETE CASCADE;

ALTER TABLE public.units
  ALTER COLUMN building_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS units_building_id_idx ON public.units(building_id);

ALTER TABLE public.units
  DROP CONSTRAINT IF EXISTS units_org_id_number_key;

ALTER TABLE public.units
  DROP CONSTRAINT IF EXISTS units_building_id_number_key;

ALTER TABLE public.units
  ADD CONSTRAINT units_building_id_number_key UNIQUE (building_id, number);

-- -----------------------------------------------------------------------------
-- 4) Tabla property_owners
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.property_owners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name     text NOT NULL,
  email         text,
  phone         text,
  rfc           text,
  bank_info     jsonb,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_owners_org_id_idx  ON public.property_owners(org_id);
CREATE INDEX IF NOT EXISTS property_owners_user_id_idx ON public.property_owners(user_id);

ALTER TABLE public.property_owners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_owners_select ON public.property_owners;
DROP POLICY IF EXISTS property_owners_insert ON public.property_owners;
DROP POLICY IF EXISTS property_owners_update ON public.property_owners;
DROP POLICY IF EXISTS property_owners_delete ON public.property_owners;

CREATE POLICY property_owners_select ON public.property_owners
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY property_owners_insert ON public.property_owners
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner','pm_admin','pm_operator')
    )
  );

CREATE POLICY property_owners_update ON public.property_owners
  FOR UPDATE USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner','pm_admin','pm_operator')
    )
    OR user_id = auth.uid()
  );

CREATE POLICY property_owners_delete ON public.property_owners
  FOR DELETE USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner','pm_admin')
    )
  );

-- -----------------------------------------------------------------------------
-- 5) Tabla ownership_stakes (M:N building↔property_owner)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ownership_stakes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  building_id         uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  property_owner_id   uuid NOT NULL REFERENCES public.property_owners(id) ON DELETE CASCADE,
  percentage          numeric(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  starts_on           date,
  ends_on             date,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ownership_stakes_unique UNIQUE (building_id, property_owner_id)
);

CREATE INDEX IF NOT EXISTS ownership_stakes_org_id_idx      ON public.ownership_stakes(org_id);
CREATE INDEX IF NOT EXISTS ownership_stakes_building_id_idx ON public.ownership_stakes(building_id);
CREATE INDEX IF NOT EXISTS ownership_stakes_owner_id_idx    ON public.ownership_stakes(property_owner_id);

CREATE OR REPLACE FUNCTION public.check_ownership_stakes_sum()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  total numeric;
BEGIN
  SELECT COALESCE(SUM(percentage), 0) INTO total
  FROM public.ownership_stakes
  WHERE building_id = NEW.building_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  IF total + NEW.percentage > 100 THEN
    RAISE EXCEPTION 'Suma de ownership stakes para building % excede 100%% (intentado: %)',
      NEW.building_id, total + NEW.percentage;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ownership_stakes_sum_check ON public.ownership_stakes;
CREATE TRIGGER ownership_stakes_sum_check
  BEFORE INSERT OR UPDATE ON public.ownership_stakes
  FOR EACH ROW EXECUTE FUNCTION public.check_ownership_stakes_sum();

ALTER TABLE public.ownership_stakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ownership_stakes_select ON public.ownership_stakes;
DROP POLICY IF EXISTS ownership_stakes_insert ON public.ownership_stakes;
DROP POLICY IF EXISTS ownership_stakes_update ON public.ownership_stakes;
DROP POLICY IF EXISTS ownership_stakes_delete ON public.ownership_stakes;

CREATE POLICY ownership_stakes_select ON public.ownership_stakes
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid())
    OR property_owner_id IN (SELECT po.id FROM public.property_owners po WHERE po.user_id = auth.uid())
  );

CREATE POLICY ownership_stakes_insert ON public.ownership_stakes
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner','pm_admin','pm_operator')
    )
  );

CREATE POLICY ownership_stakes_update ON public.ownership_stakes
  FOR UPDATE USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner','pm_admin','pm_operator')
    )
  );

CREATE POLICY ownership_stakes_delete ON public.ownership_stakes
  FOR DELETE USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('pm_owner','pm_admin')
    )
  );

-- -----------------------------------------------------------------------------
-- 6) Comentarios documentales
-- -----------------------------------------------------------------------------

COMMENT ON TABLE public.buildings        IS 'Sprint 3 v2: capa edificio entre organizations y units. Una org puede gestionar múltiples buildings.';
COMMENT ON TABLE public.property_owners  IS 'Sprint 3 v2: dueños del inmueble (no tenants). Pueden ligarse a auth.users vía portal Property Owner.';
COMMENT ON TABLE public.ownership_stakes IS 'Sprint 3 v2: relación M:N building↔property_owner con porcentaje de propiedad. Trigger valida sum<=100 por building.';
COMMENT ON COLUMN public.units.building_id IS 'Sprint 3 v2: FK a buildings. NOT NULL — toda unit pertenece a un building.';

-- =============================================================================
-- FIN — multitenancy v2
-- =============================================================================
