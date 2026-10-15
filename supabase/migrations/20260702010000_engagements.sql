-- BaW OS — Fase engagements: cuenta combinada (spec people-crm-stays-model §6).
--
-- Un engagement agrupa N contratos bajo un mismo pagador (persona o empresa,
-- p.ej. Natturaly Complements con D102+D202+D201) para verlos como UNA cuenta:
-- saldo pooled y estado de cuenta consolidado. Decisiones de Fran 2026-07-02:
-- se registra el mes único de D201, el historial se reconstruye desde febrero
-- (el saldo se DERIVA de los movimientos, sin ajuste inicial), y la facturación
-- del pool es consolidada. Idempotente, no destructiva.

CREATE TABLE IF NOT EXISTS public.engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Quién paga el pool (occupants con kind='empresa' o 'persona').
  payer_occupant_id uuid REFERENCES public.occupants(id),
  -- Consolidado = un estado de cuenta del pool; per_unit = por unidad con
  -- saldo compartido. Default según decisión de Fran.
  billing_mode text NOT NULL DEFAULT 'consolidated'
    CHECK (billing_mode IN ('consolidated', 'per_unit')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engagements_org ON public.engagements (org_id, status);

-- Membresía: el contrato apunta a su engagement. FK directa a engagements (no
-- introduce una segunda FK contracts→occupants, así que no rompe los embeds
-- PostgREST occupant:occupants(...) — ver nota en 20260627_party_kind_payer).
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS engagement_id uuid REFERENCES public.engagements(id);

CREATE INDEX IF NOT EXISTS idx_contracts_engagement
  ON public.contracts (engagement_id) WHERE engagement_id IS NOT NULL;

ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagements_member ON public.engagements;
CREATE POLICY engagements_member ON public.engagements FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = engagements.org_id AND om.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = engagements.org_id AND om.user_id = auth.uid()
  ));
