-- BaW OS — Chat in-app con agentes conectados.
--
-- Reusa los rieles de agent_interactions (mismo long-poll + PATCH que ya usa
-- Alicia para Discord): un mensaje del usuario = una interacción channel='app',
-- status='deferred', que el agente recoge por su long-poll y responde
-- (PATCH response + completed). Cambio mínimo del lado del agente: manejar el
-- canal 'app' igual que maneja 'discord'.

-- 1. Permitir el canal 'app' en agent_interactions.
ALTER TABLE public.agent_interactions DROP CONSTRAINT IF EXISTS agent_interactions_channel_check;
ALTER TABLE public.agent_interactions ADD CONSTRAINT agent_interactions_channel_check
  CHECK (channel IN ('discord','slack','whatsapp','telegram','signal','imessage','api','app'));

-- 2. Hilo + autor humano para el chat in-app.
ALTER TABLE public.agent_interactions
  ADD COLUMN IF NOT EXISTS conversation_id UUID,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_agent_interactions_conversation
  ON public.agent_interactions (conversation_id, created_at)
  WHERE conversation_id IS NOT NULL;

-- 3. Conversaciones (hilos de chat humano ↔ agente).
CREATE TABLE IF NOT EXISTS public.agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_org
  ON public.agent_conversations (org_id, last_message_at DESC);

ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_conversations_member ON public.agent_conversations;
CREATE POLICY agent_conversations_member ON public.agent_conversations FOR ALL
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = agent_conversations.org_id AND om.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = agent_conversations.org_id AND om.user_id = auth.uid()));
