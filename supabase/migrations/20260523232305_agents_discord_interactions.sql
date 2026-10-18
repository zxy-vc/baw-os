-- BaW OS — Sprint 5A WS-1: Discord Interactions + Agent Attribution
-- Nuevas tablas: agent_interactions (log de interacciones Discord/Slack)
-- Nueva columna: reservations.created_by_agent_id (atribución en reservas)

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. agent_interactions — log de cada interacción Discord / canal externo
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('discord', 'slack', 'whatsapp', 'telegram', 'signal', 'imessage', 'api')),
  channel_id TEXT,                         -- Discord channel_id, Slack channel name, etc.
  interaction_type TEXT NOT NULL,          -- 'APPLICATION_COMMAND', 'MESSAGE_COMPONENT', 'PING', etc.
  interaction_id TEXT,                     -- ID original del evento Discord (idempotencia)
  discord_guild_id TEXT,
  discord_user_id TEXT,                    -- ID Discord del humano que disparó (siempre Fran)
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'deferred', 'completed', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_interactions_agent_created
  ON public.agent_interactions (agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_interactions_org_created
  ON public.agent_interactions (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_interactions_interaction_id
  ON public.agent_interactions (interaction_id)
  WHERE interaction_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Atribución en reservas: campo created_by_agent_id
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS created_by_agent_id TEXT REFERENCES public.agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_agent
  ON public.reservations (created_by_agent_id)
  WHERE created_by_agent_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 3. Atribución en incidencias
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS created_by_agent_id TEXT REFERENCES public.agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_agent
  ON public.incidents (created_by_agent_id)
  WHERE created_by_agent_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 4. Atribución en tareas
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by_agent_id TEXT REFERENCES public.agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_agent
  ON public.tasks (created_by_agent_id)
  WHERE created_by_agent_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 5. Campo discord_message_url en agent_runs (ya existe, pero puede faltar)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS discord_message_url TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS credential_id UUID REFERENCES public.agent_credentials(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_runs_idempotency
  ON public.agent_runs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 6. RLS para agent_interactions
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.agent_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_interactions_select ON public.agent_interactions;
CREATE POLICY agent_interactions_select ON public.agent_interactions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = agent_interactions.org_id
      AND om.user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);

-- Service role puede insertar (usado desde el endpoint Discord)
DROP POLICY IF EXISTS agent_interactions_insert ON public.agent_interactions;
CREATE POLICY agent_interactions_insert ON public.agent_interactions FOR INSERT
  WITH CHECK (true); -- Controlado a nivel de service_role key en el endpoint

COMMIT;

-- Rollback:
-- BEGIN;
--   DROP TABLE IF EXISTS public.agent_interactions;
--   ALTER TABLE public.reservations DROP COLUMN IF EXISTS created_by_agent_id;
--   ALTER TABLE public.incidents DROP COLUMN IF EXISTS created_by_agent_id;
--   ALTER TABLE public.tasks DROP COLUMN IF EXISTS created_by_agent_id;
--   ALTER TABLE public.agent_runs DROP COLUMN IF EXISTS discord_message_url;
--   ALTER TABLE public.agent_runs DROP COLUMN IF EXISTS idempotency_key;
--   ALTER TABLE public.agent_runs DROP COLUMN IF EXISTS credential_id;
-- COMMIT;
