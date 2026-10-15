-- Allow 'system' as a valid actor_type in audit_log.
--
-- The activity Timeline (src/app/audit/page.tsx) exposes a "Sistema" filter and
-- already renders actor_type = 'system', but the original CHECK constraint only
-- permitted 'human' | 'agent', so system events could never be stored and the
-- filter was always empty. Widen the constraint to include 'system'.
--
-- The constraint was created inline in 20260403_audit_log.sql, so Postgres named
-- it audit_log_actor_type_check. Drop defensively (covers any rename) before
-- re-adding the widened version.

DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE rel.relname = 'audit_log'
      AND ns.nspname = 'public'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%actor_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.audit_log DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_actor_type_check
  CHECK (actor_type IN ('human', 'agent', 'system'));
