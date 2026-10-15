-- ============================================================
-- BaW OS · Fix: constraint anti double-booking de reservation_holds
--
-- BUG: 20260523_public_booking.sql define el EXCLUDE de holds con
--   WHERE (expires_at > now())
-- y Postgres NO permite funciones no-inmutables (now() es STABLE) en
-- predicados de índice → ERROR 42P17. La migración de mayo nunca pudo
-- aplicarse completa en ningún entorno (descubierto al nivelar prod,
-- 2026-07-03).
--
-- FIX: constraint sin predicado + trigger BEFORE INSERT que purga los
-- holds expirados. Comportamiento equivalente: un hold vencido jamás
-- bloquea un intento nuevo, y dos holds vigentes no pueden traslaparse.
--
-- Idempotente. Rollback:
--   DROP TRIGGER IF EXISTS trg_purge_expired_holds ON public.reservation_holds;
--   DROP FUNCTION IF EXISTS public.fn_purge_expired_holds();
--   ALTER TABLE public.reservation_holds DROP CONSTRAINT IF EXISTS no_overlap_per_hold;
-- ============================================================
BEGIN;

DO $$
BEGIN
  ALTER TABLE public.reservation_holds
    ADD CONSTRAINT no_overlap_per_hold
    EXCLUDE USING gist (
      unit_id WITH =,
      daterange(from_date, to_date, '[)') WITH &&
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table  THEN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_purge_expired_holds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.reservation_holds WHERE expires_at <= now();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_expired_holds ON public.reservation_holds;
CREATE TRIGGER trg_purge_expired_holds
  BEFORE INSERT ON public.reservation_holds
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.fn_purge_expired_holds();

COMMIT;
