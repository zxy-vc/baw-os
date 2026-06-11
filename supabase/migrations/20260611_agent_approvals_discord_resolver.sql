-- BaW OS — Sprint 5A MVP: resolver de aprobaciones desde Discord
-- Cierra el pendiente de ADR-021 D8: persistir quién resolvió una aprobación
-- desde un botón Discord (los Discord user IDs no son auth.users UUIDs,
-- por eso es una columna TEXT separada de resolved_by).
--
-- Aditiva e idempotente. Rollback:
--   ALTER TABLE public.agent_approvals DROP COLUMN IF EXISTS resolved_by_discord_user;

ALTER TABLE public.agent_approvals
  ADD COLUMN IF NOT EXISTS resolved_by_discord_user TEXT;

COMMENT ON COLUMN public.agent_approvals.resolved_by_discord_user IS
  'Discord user ID (snowflake) de quien resolvió la aprobación vía botón Discord. NULL si se resolvió por UI/API.';
