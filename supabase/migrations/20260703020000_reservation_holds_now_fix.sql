-- ============================================================
-- BaW OS · Fix: constraint anti double-booking de reservation_holds
--
-- BUG: 20260523231651_public_booking.sql define el EXCLUDE de holds con
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

-- Garantiza que las tablas de 20260523231651_public_booking.sql existan aunque esa
-- migración nunca se haya aplicado completa (mismas definiciones; no-op si ya
-- existen).
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.reservation_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  from_date date NOT NULL,
  to_date date NOT NULL,
  guests_count integer NOT NULL DEFAULT 1,
  guest_email text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  stripe_session_id text UNIQUE,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date > from_date)
);

CREATE TABLE IF NOT EXISTS public.stripe_processed_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);

CREATE TABLE IF NOT EXISTS public.checkout_idempotency (
  key text PRIMARY KEY,
  response jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

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
