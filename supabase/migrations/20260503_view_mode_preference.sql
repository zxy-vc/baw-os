-- BaW OS — Preferencia Human/Agent view mode (Fase 3 light)
-- Persiste el modo de visualización elegido por el miembro en cada org.

BEGIN;

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS preferred_view_mode TEXT NOT NULL DEFAULT 'human'
    CHECK (preferred_view_mode IN ('human','agent'));

COMMENT ON COLUMN public.org_members.preferred_view_mode IS
  'UI view mode preference per (user, org). human = layouts generosos descubrimiento; agent = densidad Bloomberg/Linear, exception-first.';

COMMIT;

-- Rollback:
-- BEGIN;
--   ALTER TABLE public.org_members DROP COLUMN IF EXISTS preferred_view_mode;
-- COMMIT;
