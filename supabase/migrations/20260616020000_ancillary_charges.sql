-- BaW OS — Cargos accesorios (estacionamiento + espectaculares) — Fase 2 / PR B1.
--
-- Contexto (decisión de Fran):
--   Además de la renta de la unidad, un edificio genera ingresos accesorios:
--     • Estacionamiento: cada edificio tiene un POOL de cajones. Muchos vienen
--       incluidos con una unidad (sin cobro extra); los cajones libres se pueden
--       rentar como EXTRA a un inquilino, sumándose a su renta.
--     • Espectaculares (billboards): activos publicitarios sobre azotea. Dos casos
--       reales: estructura PROPIA cobrada mensual (ej. 2020: 5 espectaculares a
--       $5,000 c/u el día 15) y estructura de TERCEROS que paga renta ANUAL por el
--       espacio (ej. 809).
--
-- Invariante pedido por Fran: TODO cargo accesorio cuelga de un CONTRATO. El
-- contrato puede estar ligado a una unidad de renta, o ser INDEPENDIENTE (sin
-- unidad) — p.ej. el contrato con un anunciante. Por eso este PR vuelve
-- contracts.unit_id NULLABLE.
--
-- Este PR (B1) solo crea esquema + cimientos. La generación automática de cargos
-- en cobranza (mensual vs anual) va en un PR posterior dedicado (B3).
--
-- Aditiva + idempotente. Rollback al final del archivo.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Contratos independientes: unit_id deja de ser obligatorio.
--    Un contrato sin unidad (unit_id NULL) representa un contrato standalone
--    (ej. anunciante de espectacular). occupant_id sigue siendo obligatorio:
--    siempre hay un pagador.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.contracts ALTER COLUMN unit_id DROP NOT NULL;

COMMENT ON COLUMN public.contracts.unit_id IS
  'Unidad de renta asociada. NULL = contrato INDEPENDIENTE (standalone), p.ej. anunciante de espectacular sin unidad.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Pool de estacionamiento (informativo a nivel edificio/unidad).
--    El cobro de cajones EXTRA vive en ancillary_charges (kind='parking').
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS parking_total INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS parking_included INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.buildings.parking_total IS
  'Total de cajones de estacionamiento que existen en el edificio (pool).';
COMMENT ON COLUMN public.units.parking_included IS
  'Cajones incluidos con esta unidad sin cobro extra (baseline). Los extra se cobran vía ancillary_charges.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Enums
-- ───────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE ancillary_kind AS ENUM ('parking', 'billboard', 'storage', 'antenna', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ancillary_cadence AS ENUM ('monthly', 'annual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ancillary_ownership AS ENUM ('ours', 'third_party');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ancillary_status AS ENUM ('active', 'inactive', 'ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) ancillary_assets — activos accesorios discretos (espectaculares, bodegas…).
--    Opcional: un cargo puede referenciar un activo, pero no es obligatorio
--    (los cajones extra no tienen activo, salen del pool del edificio).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ancillary_assets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
  kind        ancillary_kind NOT NULL DEFAULT 'billboard',
  label       TEXT NOT NULL,                 -- ej. "Espectacular azotea norte"
  ownership   ancillary_ownership NOT NULL DEFAULT 'ours', -- 'ours' = estructura propia
  status      ancillary_status NOT NULL DEFAULT 'active',
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ancillary_assets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "ancillary_assets_org_isolation" ON public.ancillary_assets
    USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) ancillary_charges — línea de ingreso accesorio, SIEMPRE ligada a un contrato.
--    Integra a cobranza vía cadence (mensual/anual) + billing_day en un PR futuro.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ancillary_charges (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_id    UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,  -- invariante: todo cargo cuelga de un contrato
  asset_id       UUID REFERENCES ancillary_assets(id) ON DELETE SET NULL,   -- opcional (espectacular)
  building_id    UUID REFERENCES buildings(id) ON DELETE SET NULL,          -- denormalizado para reportes
  unit_id        UUID REFERENCES units(id) ON DELETE SET NULL,              -- denormalizado; NULL si contrato independiente
  kind           ancillary_kind NOT NULL,
  description    TEXT,                                  -- ej. "2 cajones extra", "Espectacular 809"
  amount         DECIMAL(10,2) NOT NULL,                -- monto por periodo (según cadence)
  cadence        ancillary_cadence NOT NULL DEFAULT 'monthly',
  billing_day    INTEGER NOT NULL DEFAULT 1,            -- día de cobro (1..28); para anual = día del mes de aniversario
  quantity       INTEGER NOT NULL DEFAULT 1,            -- nº de cajones / espectaculares
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to   DATE,                                  -- NULL = vigente/indefinido
  status         ancillary_status NOT NULL DEFAULT 'active',
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT ancillary_charges_billing_day_chk CHECK (billing_day BETWEEN 1 AND 28),
  CONSTRAINT ancillary_charges_amount_chk CHECK (amount >= 0),
  CONSTRAINT ancillary_charges_quantity_chk CHECK (quantity >= 1)
);

CREATE INDEX IF NOT EXISTS ancillary_charges_contract_idx ON public.ancillary_charges(contract_id);
CREATE INDEX IF NOT EXISTS ancillary_charges_org_status_idx ON public.ancillary_charges(org_id, status);

ALTER TABLE public.ancillary_charges ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "ancillary_charges_org_isolation" ON public.ancillary_charges
    USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.ancillary_charges IS
  'Ingresos accesorios (estacionamiento extra, espectaculares) ligados a un contrato. La cobranza genera pagos según cadence + billing_day (PR B3).';

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK
--   DROP TABLE IF EXISTS public.ancillary_charges;
--   DROP TABLE IF EXISTS public.ancillary_assets;
--   DROP TYPE  IF EXISTS ancillary_status;
--   DROP TYPE  IF EXISTS ancillary_ownership;
--   DROP TYPE  IF EXISTS ancillary_cadence;
--   DROP TYPE  IF EXISTS ancillary_kind;
--   ALTER TABLE public.units     DROP COLUMN IF EXISTS parking_included;
--   ALTER TABLE public.buildings DROP COLUMN IF EXISTS parking_total;
--   -- Nota: re-imponer NOT NULL en contracts.unit_id requiere que no existan
--   -- contratos independientes:  ALTER TABLE public.contracts ALTER COLUMN unit_id SET NOT NULL;
-- ───────────────────────────────────────────────────────────────────────────
