-- BaW OS — Fase 1 ADR-022: Flujo B (Operadora → Propietario) + Proveedores v1
--
-- Cuatro tablas nuevas + liga de proveedor en gastos/incidencias:
--   management_agreements  ACUERDO   comisión de administración (base 10%,
--                                    personalizable por edificio/propietario —
--                                    decisión de Fran 2026-07-04; reemplaza el
--                                    10% hardcodeado del endpoint owner legacy)
--   owner_statements       CARGO/EDO estado de cuenta mensual del propietario,
--                                    persistido e inmutable al emitir (snapshot)
--   owner_payouts          ABONO     pago efectivo al propietario (dinero que
--                                    SALE de la operadora)
--   service_providers      actor A3  proveedores con entidad propia (antes
--                                    texto libre en expenses.provider, D10)
--
-- RLS: org_members leen; escrituras de acuerdos/statements/payouts solo vía
-- server (service_role) — el enforcement de rol vive en los endpoints
-- (requireAdminCaller + src/lib/finance-permissions.ts, matriz ADR-022 §4.2).
-- El propietario logueado (portal v2) puede LEER sus statements emitidos y sus
-- payouts (nunca drafts) — regla ADR-022 §4.3: los externos leen snapshots.

BEGIN;

-- =====================================================================
-- 1) management_agreements — comisión de administración con vigencia
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.management_agreements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  building_id   uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  -- NULL = aplica a todos los propietarios del edificio
  owner_id      uuid REFERENCES public.property_owners(id) ON DELETE CASCADE,
  fee_type      text NOT NULL DEFAULT 'percent_collected'
    CHECK (fee_type IN ('percent_collected','percent_billed','flat_monthly')),
  fee_value     numeric(9,2) NOT NULL DEFAULT 10.00 CHECK (fee_value >= 0),
  effective_from date NOT NULL,
  effective_to  date,
  notes         text,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mgmt_agreements_org_building
  ON public.management_agreements(org_id, building_id, effective_from DESC);

ALTER TABLE public.management_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mgmt_agreements_select_member ON public.management_agreements;
CREATE POLICY mgmt_agreements_select_member ON public.management_agreements
  FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())));
-- Escrituras solo server-side (service_role bypassa RLS).

-- =====================================================================
-- 2) owner_statements — estado de cuenta mensual persistido
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.owner_statements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES public.property_owners(id) ON DELETE CASCADE,
  building_id     uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  period          text NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  -- Totales del edificio en el mes (antes de aplicar el % de propiedad):
  gross_expected  numeric(12,2) NOT NULL DEFAULT 0,  -- renta facturable (contratos)
  gross_collected numeric(12,2) NOT NULL DEFAULT 0,  -- cobrado real del mes
  admin_fee       numeric(12,2) NOT NULL DEFAULT 0,  -- según management_agreements
  expenses        numeric(12,2) NOT NULL DEFAULT 0,  -- gastos del edificio + prorrateo general
  maintenance     numeric(12,2) NOT NULL DEFAULT 0,  -- costo de incidencias del mes
  adjustments     numeric(12,2) NOT NULL DEFAULT 0,  -- ajustes manuales (nota en detail)
  -- Lo que corresponde a ESTE propietario:
  ownership_pct   numeric(5,2)  NOT NULL DEFAULT 100,
  net_payout      numeric(12,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft','issued','paid','void')),
  -- Snapshot inmutable del desglose (por unidad/concepto/proveedor + acuerdo aplicado)
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_at       timestamptz,
  issued_by       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_statements_unique UNIQUE (org_id, owner_id, building_id, period)
);

CREATE INDEX IF NOT EXISTS idx_owner_statements_org_period
  ON public.owner_statements(org_id, period);
CREATE INDEX IF NOT EXISTS idx_owner_statements_owner
  ON public.owner_statements(owner_id, period);

ALTER TABLE public.owner_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_statements_select_member ON public.owner_statements;
CREATE POLICY owner_statements_select_member ON public.owner_statements
  FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())));

-- El propietario ve SOLO sus statements ya emitidos (nunca drafts) — §4.3.
DROP POLICY IF EXISTS owner_statements_select_owner ON public.owner_statements;
CREATE POLICY owner_statements_select_owner ON public.owner_statements
  FOR SELECT
  USING (
    status <> 'draft'
    AND owner_id IN (
      SELECT po.id FROM public.property_owners po WHERE po.user_id = auth.uid()
    )
  );

-- =====================================================================
-- 3) owner_payouts — pagos efectivos al propietario
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.owner_payouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  statement_id  uuid NOT NULL REFERENCES public.owner_statements(id) ON DELETE CASCADE,
  amount        numeric(12,2) NOT NULL CHECK (amount >= 0),
  method        text NOT NULL DEFAULT 'transfer'
    CHECK (method IN ('transfer','spei','cash','other')),
  reference     text,
  paid_date     date NOT NULL,
  confirmed_by  text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_payouts_statement
  ON public.owner_payouts(statement_id);

ALTER TABLE public.owner_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_payouts_select_member ON public.owner_payouts;
CREATE POLICY owner_payouts_select_member ON public.owner_payouts
  FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())));

DROP POLICY IF EXISTS owner_payouts_select_owner ON public.owner_payouts;
CREATE POLICY owner_payouts_select_owner ON public.owner_payouts
  FOR SELECT
  USING (
    statement_id IN (
      SELECT s.id FROM public.owner_statements s
      JOIN public.property_owners po ON po.id = s.owner_id
      WHERE po.user_id = auth.uid() AND s.status <> 'draft'
    )
  );

-- =====================================================================
-- 4) service_providers — actor A3 con entidad propia (D10)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.service_providers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('maintenance','cleaning','utilities','legal','accounting','security','other')),
  rfc         text,
  contact     jsonb NOT NULL DEFAULT '{}'::jsonb,
  bank_info   jsonb NOT NULL DEFAULT '{}'::jsonb,
  active      boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_providers_org
  ON public.service_providers(org_id, active);

ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;

-- Captura de gastos es nivel operator (§4.2) → miembros leen y crean/editan.
DROP POLICY IF EXISTS service_providers_select_member ON public.service_providers;
CREATE POLICY service_providers_select_member ON public.service_providers
  FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())));

DROP POLICY IF EXISTS service_providers_insert_member ON public.service_providers;
CREATE POLICY service_providers_insert_member ON public.service_providers
  FOR INSERT
  WITH CHECK (org_id IN (SELECT public.user_org_ids(auth.uid())));

DROP POLICY IF EXISTS service_providers_update_member ON public.service_providers;
CREATE POLICY service_providers_update_member ON public.service_providers
  FOR UPDATE
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())))
  WITH CHECK (org_id IN (SELECT public.user_org_ids(auth.uid())));

-- Liga de proveedor en gastos e incidencias (expenses.provider TEXT queda
-- como display legacy; la captura nueva llena ambos).
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.service_providers(id) ON DELETE SET NULL;
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.service_providers(id) ON DELETE SET NULL;

COMMIT;
