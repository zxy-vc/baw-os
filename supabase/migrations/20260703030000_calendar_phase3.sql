-- BaW OS — Calendario fase 3: precio fijo por unidad+rango y bloqueos con fechas.
--
-- 1. unit_rate_overrides — el "precio por día por unidad" tipo Airbnb: dentro
--    del rango, la noche vale nightly_rate_mxn y GANA sobre la fórmula global
--    (units.base_rate_mxn × str_seasons.price_multiplier). Fechas INCLUSIVAS,
--    misma semántica que str_seasons.
-- 2. unit_blocks — bloqueos operativos (mantenimiento, uso personal) con rango
--    de fechas. Hasta hoy units.status='maintenance' no tenía fechas; esto los
--    hace visibles en el calendario sin tocar el status de la unidad. Fechas
--    INCLUSIVAS (el día end_date la unidad sigue bloqueada).
--
-- Idempotente, no destructiva. Solapamientos prohibidos por EXCLUDE (gist);
-- btree_gist ya se usa en reservations/reservation_holds pero se asegura aquí.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── 1. Overrides de precio por unidad ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.unit_rate_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  nightly_rate_mxn numeric NOT NULL CHECK (nightly_rate_mxn >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_rate_overrides_range CHECK (end_date >= start_date),
  -- Un solo precio fijo vigente por unidad y día.
  CONSTRAINT unit_rate_overrides_no_overlap EXCLUDE USING gist (
    unit_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS idx_unit_rate_overrides_unit
  ON public.unit_rate_overrides (unit_id, start_date);

ALTER TABLE public.unit_rate_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unit_rate_overrides_member ON public.unit_rate_overrides;
CREATE POLICY unit_rate_overrides_member ON public.unit_rate_overrides FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = unit_rate_overrides.org_id AND om.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = unit_rate_overrides.org_id AND om.user_id = auth.uid()
  ));

-- ── 2. Bloqueos operativos con fechas ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.unit_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL DEFAULT 'maintenance'
    CHECK (reason IN ('maintenance', 'personal', 'other')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_blocks_range CHECK (end_date >= start_date),
  -- Bloqueos de la misma unidad no se encimen entre sí. (Sí pueden coexistir
  -- con reservaciones/contratos: el calendario los pinta en carriles.)
  CONSTRAINT unit_blocks_no_overlap EXCLUDE USING gist (
    unit_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS idx_unit_blocks_unit
  ON public.unit_blocks (unit_id, start_date);

ALTER TABLE public.unit_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unit_blocks_member ON public.unit_blocks;
CREATE POLICY unit_blocks_member ON public.unit_blocks FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = unit_blocks.org_id AND om.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = unit_blocks.org_id AND om.user_id = auth.uid()
  ));
