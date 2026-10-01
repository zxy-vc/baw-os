-- BaW OS — Agent Credentials (Fase 1 del Agent Platform Roadmap)
-- Una identidad por agente, por org. Reemplaza BAWOS_API_KEY global.
-- Contrato: ver docs/AGENT_INTEGRATION.md

BEGIN;

-- 1. Tabla de credenciales
CREATE TABLE IF NOT EXISTS public.agent_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,                          -- 'prod', 'staging', 'dev-local'
  api_key_hash TEXT NOT NULL,                   -- bcrypt(sk_live_xxx)
  api_key_prefix TEXT NOT NULL,                 -- primeros 12 chars para UI ('sk_live_abc1')
  scopes TEXT[] NOT NULL DEFAULT '{}',          -- ['units:read','reservations:write',...]
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','revoked','expired')),
  rate_limit_tier TEXT NOT NULL DEFAULT 'standard'
    CHECK (rate_limit_tier IN ('standard','elevated','unlimited')),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (org_id, agent_id, label)
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_agent_credentials_prefix_active
  ON public.agent_credentials (api_key_prefix)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_agent_credentials_org_agent
  ON public.agent_credentials (org_id, agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_credentials_status
  ON public.agent_credentials (status, expires_at);

-- 3. RLS — solo admins del tenant ven credenciales del tenant; platform_admin ve todo.
ALTER TABLE public.agent_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_credentials_select ON public.agent_credentials;
CREATE POLICY agent_credentials_select ON public.agent_credentials FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = agent_credentials.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin')
  )
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);

DROP POLICY IF EXISTS agent_credentials_insert ON public.agent_credentials;
CREATE POLICY agent_credentials_insert ON public.agent_credentials FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = agent_credentials.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin')
  )
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);

DROP POLICY IF EXISTS agent_credentials_update ON public.agent_credentials;
CREATE POLICY agent_credentials_update ON public.agent_credentials FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = agent_credentials.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin')
  )
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);

-- No DELETE policy: las credenciales se revocan (status='revoked'), no se borran. Audit trail.

-- 4. Función helper: validar y resolver agente por hash
-- NOTA: bcrypt comparison lo hace el server-side con la lib. Esta función solo expone
--       lookup por prefix (rápido) + última actualización de last_used_at.
CREATE OR REPLACE FUNCTION public.touch_agent_credential(p_credential_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agent_credentials
  SET last_used_at = now()
  WHERE id = p_credential_id AND status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_agent_credential(UUID) TO authenticated;
-- service_role siempre tiene acceso

-- 5. View para auditoría (no expone hash)
CREATE OR REPLACE VIEW public.v_agent_credentials_audit AS
SELECT
  c.id,
  c.org_id,
  c.agent_id,
  a.full_name AS agent_name,
  c.label,
  c.api_key_prefix,
  c.scopes,
  c.status,
  c.rate_limit_tier,
  c.expires_at,
  c.last_used_at,
  c.created_at,
  c.created_by,
  c.revoked_at,
  c.revoked_by
FROM public.agent_credentials c
JOIN public.agents a ON a.id = c.agent_id;

COMMIT;

-- Rollback:
-- BEGIN;
--   DROP VIEW IF EXISTS public.v_agent_credentials_audit;
--   DROP FUNCTION IF EXISTS public.touch_agent_credential(UUID);
--   DROP TABLE IF EXISTS public.agent_credentials;
-- COMMIT;
