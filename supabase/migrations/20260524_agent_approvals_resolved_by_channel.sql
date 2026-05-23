-- BaW OS — Sprint 5A fix: channel-agnostic resolved_by_channel on agent_approvals
-- Opción C: solución escalable a múltiples canales (Discord, Slack, etc.)
-- Ref: PR #65 introdujo resolved_by_discord_user que no existe en producción.
--      Esta migración agrega la columna JSONB correcta.

ALTER TABLE public.agent_approvals
  ADD COLUMN IF NOT EXISTS resolved_by_channel jsonb NULL;

CREATE INDEX IF NOT EXISTS idx_agent_approvals_resolved_by_channel
  ON public.agent_approvals USING gin (resolved_by_channel)
  WHERE resolved_by_channel IS NOT NULL;

COMMENT ON COLUMN public.agent_approvals.resolved_by_channel IS
  'Channel-agnostic identity of the human approver when resolved from an external surface (Discord, Slack, etc). Shape: {"channel":"discord|slack|web","external_id":"...","username":"..."}. NULL if resolved from web dashboard (use resolved_by uuid instead).';
