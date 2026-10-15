-- BaW OS — API v1 infrastructure (Fase 2 del Agent Platform Roadmap)
-- Tablas de soporte: idempotency_keys, agent_approvals, agent_policies.
-- Dependencias: agent_credentials (20260503_agent_credentials.sql), agents, agent_runs.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. idempotency_keys
-- Cache de respuestas idempotentes por (org_id, agent_id, idempotency_key).
-- TTL 24h (limpieza vía cron en Fase 2.1).
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  credential_id UUID REFERENCES public.agent_credentials(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  endpoint TEXT NOT NULL,                       -- '/v1/incidents'
  method TEXT NOT NULL CHECK (method IN ('POST','PATCH','PUT','DELETE')),
  request_hash TEXT NOT NULL,                   -- SHA-256 del body para detectar conflict
  response_status INT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  UNIQUE (org_id, agent_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_lookup
  ON public.idempotency_keys (org_id, agent_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
  ON public.idempotency_keys (expires_at);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS idempotency_keys_select ON public.idempotency_keys;
CREATE POLICY idempotency_keys_select ON public.idempotency_keys FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.org_members om
    WHERE om.org_id = idempotency_keys.org_id AND om.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);
-- INSERT/UPDATE/DELETE solo via service_role.

-- ───────────────────────────────────────────────────────────────────────────
-- 2. agent_approvals
-- Cola de acciones pendientes de aprobación humana.
-- Estados: pending → granted | denied | expired | canceled
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  credential_id UUID REFERENCES public.agent_credentials(id) ON DELETE SET NULL,
  run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,                    -- 'incident.create', 'message.send_to_tenant'
  resource_type TEXT,                           -- 'incident', 'message'
  resource_id TEXT,                             -- id externo o futuro
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,                                  -- justificación que envía el agente
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','granted','denied','expired','canceled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  result JSONB                                  -- output de la acción cuando se ejecuta
);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_org_status
  ON public.agent_approvals (org_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_agent
  ON public.agent_approvals (agent_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_pending_expiry
  ON public.agent_approvals (expires_at)
  WHERE status = 'pending';

ALTER TABLE public.agent_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_approvals_select ON public.agent_approvals;
CREATE POLICY agent_approvals_select ON public.agent_approvals FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.org_members om
    WHERE om.org_id = agent_approvals.org_id AND om.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);

DROP POLICY IF EXISTS agent_approvals_update ON public.agent_approvals;
CREATE POLICY agent_approvals_update ON public.agent_approvals FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.org_members om
    WHERE om.org_id = agent_approvals.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin','manager'))
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);
-- INSERT solo via service_role.

-- ───────────────────────────────────────────────────────────────────────────
-- 3. agent_policies
-- Autonomy level + per-action overrides + rate caps.
-- Una política por (org_id, agent_id). Si no existe, se aplican defaults.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  autonomy_level INT NOT NULL DEFAULT 1
    CHECK (autonomy_level BETWEEN 0 AND 4),
  -- L0=disabled · L1=suggest only · L2=approve each · L3=approve batch · L4=full auto
  per_action JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- e.g. {"email.send_to_tenant":"REQUIRE_APPROVAL","incident.update_status":"AUTO"}
  rate_caps JSONB NOT NULL DEFAULT '{"actions_per_hour":100,"approvals_pending_max":50}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (org_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_policies_org
  ON public.agent_policies (org_id, agent_id);

ALTER TABLE public.agent_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_policies_select ON public.agent_policies;
CREATE POLICY agent_policies_select ON public.agent_policies FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.org_members om
    WHERE om.org_id = agent_policies.org_id AND om.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);

DROP POLICY IF EXISTS agent_policies_write ON public.agent_policies;
CREATE POLICY agent_policies_write ON public.agent_policies FOR ALL USING (
  EXISTS (SELECT 1 FROM public.org_members om
    WHERE om.org_id = agent_policies.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin'))
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.org_members om
    WHERE om.org_id = agent_policies.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin'))
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.touch_agent_policy()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_agent_policy ON public.agent_policies;
CREATE TRIGGER trg_touch_agent_policy
  BEFORE UPDATE ON public.agent_policies
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_policy();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Función helper: limpieza idempotency expirados (llamable por cron)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_expired_idempotency()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted INT;
BEGIN
  DELETE FROM public.idempotency_keys WHERE expires_at < now();
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Función helper: marcar approvals expirados (llamable por cron)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.expire_pending_approvals()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INT;
BEGIN
  UPDATE public.agent_approvals
    SET status = 'expired', resolved_at = now()
    WHERE status = 'pending' AND expires_at < now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

COMMIT;

-- Rollback:
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.expire_pending_approvals();
--   DROP FUNCTION IF EXISTS public.purge_expired_idempotency();
--   DROP TRIGGER IF EXISTS trg_touch_agent_policy ON public.agent_policies;
--   DROP FUNCTION IF EXISTS public.touch_agent_policy();
--   DROP TABLE IF EXISTS public.agent_policies;
--   DROP TABLE IF EXISTS public.agent_approvals;
--   DROP TABLE IF EXISTS public.idempotency_keys;
-- COMMIT;
