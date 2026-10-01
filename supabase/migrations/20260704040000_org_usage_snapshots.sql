-- BaW OS — Fase 2 ADR-022: medición mensual de uso por organización
--
-- Base de datos para decidir los revenue streams de la plataforma (decisión
-- de Fran 2026-07-04: serán múltiples streams; qué activar y a qué precio se
-- decide con datos reales, no en abstracto). Un cron mensual llena una fila
-- por (org × mes) con TODAS las bases de cobro candidatas del ADR-022 §3.4:
-- unidades activas (S1), usuarios (S2), GMV cobrado (S3), runs de agentes
-- (S5) y CFDIs emitidos (S6).
--
-- Es SOLO medición: no factura, no cobra, no toca el dinero de rentas.

BEGIN;

CREATE TABLE IF NOT EXISTS public.org_usage_snapshots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period             text NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  active_units       integer NOT NULL DEFAULT 0,
  active_users       integer NOT NULL DEFAULT 0,
  active_contracts   integer NOT NULL DEFAULT 0,
  gmv_collected_mxn  numeric(14,2) NOT NULL DEFAULT 0,
  agent_runs         integer NOT NULL DEFAULT 0,
  cfdi_count         integer NOT NULL DEFAULT 0,
  computed_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_usage_snapshots_unique UNIQUE (org_id, period)
);

CREATE INDEX IF NOT EXISTS idx_org_usage_snapshots_period
  ON public.org_usage_snapshots(period);

ALTER TABLE public.org_usage_snapshots ENABLE ROW LEVEL SECURITY;

-- Cada org ve solo su propio uso; el panel L0 lee server-side (service_role).
DROP POLICY IF EXISTS org_usage_snapshots_select_member ON public.org_usage_snapshots;
CREATE POLICY org_usage_snapshots_select_member ON public.org_usage_snapshots
  FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())));

-- Escrituras solo del cron (service_role bypassa RLS).

COMMIT;
