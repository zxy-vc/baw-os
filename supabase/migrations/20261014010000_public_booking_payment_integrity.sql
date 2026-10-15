-- ============================================================
-- BaW OS · BAW-15 · Public booking: paid checkout → reservation integrity
--
-- Bug: Stripe could charge and the webhook could then fail to create the
-- reservation (invalid mode 'direct', no organization_id / price_per_night),
-- after having already marked the event as processed. The guest paid and no
-- night was set aside.
--
-- Fix:
--   · A Checkout session is only exposed after every value the reservation
--     needs is persisted in reservation_holds (snapshot before charging).
--   · fn_promote_paid_reservation inserts the paid reservation and deletes its
--     hold in ONE transaction, idempotent by stripe_checkout_session_id.
--   · A hold that had expired when the guest paid is never promoted; the
--     webhook records it in public_booking_payment_failures for a manual
--     refund (refunds are irreversible and require a human, AGENTS.md §9).
--   · Holds and promotions of the same unit serialize on an advisory lock so a
--     new hold can never be placed on nights that are being promoted.
--
-- Prerequisites: public.reservation_holds, public.stripe_processed_events and
-- public.reservations must exist (both public-booking tables exist in prod;
-- see 20260523_public_booking.sql + 20260703_02_reservation_holds_now_fix.sql).
-- The DO block aborts the whole transaction before any change if one is missing.
--
-- Idempotent: every statement is IF NOT EXISTS / CREATE OR REPLACE / DROP IF
-- EXISTS + ADD. Safe to re-run.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_guard_hold_availability ON public.reservation_holds;
--   DROP FUNCTION IF EXISTS public.fn_guard_hold_availability();
--   DROP FUNCTION IF EXISTS public.fn_promote_paid_reservation(text, numeric, timestamptz);
--   DROP TABLE IF EXISTS public.public_booking_payment_failures;
--   DROP INDEX IF EXISTS public.reservations_stripe_checkout_session_id_key;
--   ALTER TABLE public.reservation_holds
--     DROP CONSTRAINT IF EXISTS reservation_holds_checkout_snapshot_check,
--     DROP CONSTRAINT IF EXISTS reservation_holds_booking_mode_check;
--   (added columns are nullable/defaulted and can stay)
-- ============================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.reservation_holds') IS NULL THEN
    RAISE EXCEPTION
      'Missing public.reservation_holds. Repair the public-booking baseline (20260523 + 20260703_02) before applying 20261014010000_public_booking_payment_integrity.sql';
  END IF;
  IF to_regclass('public.stripe_processed_events') IS NULL THEN
    RAISE EXCEPTION
      'Missing public.stripe_processed_events. Repair the public-booking baseline (20260523) before applying 20261014010000_public_booking_payment_integrity.sql';
  END IF;
  IF to_regclass('public.reservations') IS NULL THEN
    RAISE EXCEPTION
      'Missing public.reservations. Apply 20260329_reservations.sql before 20261014010000_public_booking_payment_integrity.sql';
  END IF;
END;
$$;

-- ── 1. Pre-payment snapshot in the hold ─────────────────────
-- Nullable additions preserve any short-lived legacy holds; the NOT VALID check
-- rejects linking a *new* Checkout session to a hold without the full snapshot.
ALTER TABLE public.reservation_holds
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS guest_phone text,
  ADD COLUMN IF NOT EXISTS price_per_night numeric,
  ADD COLUMN IF NOT EXISTS total_price numeric,
  ADD COLUMN IF NOT EXISTS booking_mode text NOT NULL DEFAULT 'full';

ALTER TABLE public.reservation_holds
  DROP CONSTRAINT IF EXISTS reservation_holds_booking_mode_check;
ALTER TABLE public.reservation_holds
  ADD CONSTRAINT reservation_holds_booking_mode_check
    CHECK (booking_mode IN ('full', 'room', 'bed'));

ALTER TABLE public.reservation_holds
  DROP CONSTRAINT IF EXISTS reservation_holds_checkout_snapshot_check;
ALTER TABLE public.reservation_holds
  ADD CONSTRAINT reservation_holds_checkout_snapshot_check
    CHECK (
      stripe_session_id IS NULL OR (
        organization_id IS NOT NULL
        AND guest_name IS NOT NULL
        AND price_per_night IS NOT NULL
        AND price_per_night >= 0
        AND total_price IS NOT NULL
        AND total_price >= 0
        AND booking_mode IN ('full', 'room', 'bed')
      )
    ) NOT VALID;

-- Holds now carry guest PII (name, phone, email). Every reader/writer uses the
-- service-role client (checkout, webhook, availability), which bypasses RLS;
-- with no policies, anon/authenticated get nothing.
ALTER TABLE public.reservation_holds ENABLE ROW LEVEL SECURITY;

-- ── 2. Idempotency key on the reservation ───────────────────
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS platform text;

CREATE UNIQUE INDEX IF NOT EXISTS reservations_stripe_checkout_session_id_key
  ON public.reservations (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- ── 3. Reconciliation queue ─────────────────────────────────
-- Paid Checkout sessions whose promotion failed. The webhook still answers 500
-- so Stripe retries; the row stays actionable (manual refund / manual booking)
-- after Stripe's retry window. A later successful promotion sets resolved_at.
CREATE TABLE IF NOT EXISTS public.public_booking_payment_failures (
  stripe_session_id text PRIMARY KEY,
  stripe_event_id text NOT NULL,
  last_error text NOT NULL,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.public_booking_payment_failures ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS public_booking_payment_failures_open_idx
  ON public.public_booking_payment_failures (last_failed_at DESC)
  WHERE resolved_at IS NULL;

-- ── 4. Hold guard: no hold on nights that are no longer free ─
-- fn_unit_is_available runs in the checkout route BEFORE the insert, so a
-- promotion committing in between would go unseen. This trigger re-checks
-- under the same per-unit advisory lock fn_promote_paid_reservation takes,
-- after the BEFORE-statement purge of expired holds (trg_purge_expired_holds).
-- 23P01 keeps the route's existing "dates just taken" 409 mapping.
CREATE OR REPLACE FUNCTION public.fn_guard_hold_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('public_booking_unit:' || NEW.unit_id::text, 0));

  IF NOT public.fn_unit_is_available(NEW.unit_id, NEW.from_date, NEW.to_date) THEN
    RAISE EXCEPTION 'Unit % is not available from % to %', NEW.unit_id, NEW.from_date, NEW.to_date
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_guard_hold_availability() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_hold_availability ON public.reservation_holds;
CREATE TRIGGER trg_guard_hold_availability
  BEFORE INSERT ON public.reservation_holds
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_hold_availability();

-- ── 5. Atomic promotion: paid hold → confirmed reservation ──
-- Signature of the July draft, never applied anywhere; dropped for re-runs.
DROP FUNCTION IF EXISTS public.fn_promote_paid_reservation(text, numeric);

CREATE OR REPLACE FUNCTION public.fn_promote_paid_reservation(
  p_stripe_session_id text,
  p_amount_paid numeric,
  p_paid_at timestamptz
)
RETURNS TABLE (reservation_id uuid, already_promoted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold public.reservation_holds%ROWTYPE;
  v_reservation_id uuid;
BEGIN
  IF p_stripe_session_id IS NULL OR btrim(p_stripe_session_id) = '' THEN
    RAISE EXCEPTION 'Stripe Checkout session id is required';
  END IF;
  IF p_amount_paid IS NULL OR p_amount_paid < 0 THEN
    RAISE EXCEPTION 'Stripe amount_paid must be a non-negative amount';
  END IF;
  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'Stripe payment timestamp is required';
  END IF;

  -- Re-delivery after a successful promotion is harmless.
  SELECT id INTO v_reservation_id
  FROM public.reservations
  WHERE stripe_checkout_session_id = p_stripe_session_id;
  IF FOUND THEN
    RETURN QUERY SELECT v_reservation_id, true;
    RETURN;
  END IF;

  -- The session id comes from the Stripe-signed event, never from browser
  -- metadata. Lock order (hold row, then unit advisory lock) matches the hold
  -- insert path (purge row locks, then guard advisory lock): no deadlock.
  SELECT * INTO v_hold
  FROM public.reservation_holds
  WHERE stripe_session_id = p_stripe_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- A concurrent delivery may have promoted and deleted the hold while this
    -- invocation was waiting for its lock.
    SELECT id INTO v_reservation_id
    FROM public.reservations
    WHERE stripe_checkout_session_id = p_stripe_session_id;
    IF FOUND THEN
      RETURN QUERY SELECT v_reservation_id, true;
      RETURN;
    END IF;
    RAISE EXCEPTION 'No hold found for Stripe Checkout session % (expired and released, or never linked)', p_stripe_session_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('public_booking_unit:' || v_hold.unit_id::text, 0));

  -- The guest must have paid while the nights were still set aside. A row
  -- that still exists after its expiry has not been taken by anyone else (any
  -- new hold insert purges it first, and that purge waits for this row lock).
  IF p_paid_at >= v_hold.expires_at THEN
    RAISE EXCEPTION 'Hold % expired at % before payment at %', v_hold.id, v_hold.expires_at, p_paid_at;
  END IF;

  IF v_hold.organization_id IS NULL
    OR v_hold.guest_name IS NULL
    OR v_hold.price_per_night IS NULL
    OR v_hold.total_price IS NULL THEN
    RAISE EXCEPTION 'Hold % has no complete pre-payment reservation snapshot', v_hold.id;
  END IF;

  IF v_hold.total_price <> p_amount_paid THEN
    RAISE EXCEPTION
      'Stripe amount % does not match hold % total %',
      p_amount_paid, v_hold.id, v_hold.total_price;
  END IF;

  -- Explicit overlap check: prod drifted from the repo and no_overlap_per_unit
  -- may be missing there. Reservations inserted outside this lock (Channex,
  -- manual) still rely on that EXCLUDE when it exists.
  IF EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.unit_id = v_hold.unit_id
      AND r.status IN ('confirmed', 'checked_in')
      AND daterange(r.check_in, r.check_out, '[)') && daterange(v_hold.from_date, v_hold.to_date, '[)')
  ) THEN
    RAISE EXCEPTION 'Unit % already has a confirmed reservation overlapping hold %', v_hold.unit_id, v_hold.id
      USING ERRCODE = 'exclusion_violation';
  END IF;

  INSERT INTO public.reservations (
    unit_id,
    organization_id,
    guest_name,
    guest_email,
    guest_phone,
    check_in,
    check_out,
    mode,
    guests_count,
    price_per_night,
    total_price,
    status,
    payment_status,
    amount_paid,
    platform,
    stripe_checkout_session_id,
    notes
  ) VALUES (
    v_hold.unit_id,
    v_hold.organization_id,
    v_hold.guest_name,
    v_hold.guest_email,
    v_hold.guest_phone,
    v_hold.from_date,
    v_hold.to_date,
    v_hold.booking_mode,
    v_hold.guests_count,
    v_hold.price_per_night,
    v_hold.total_price,
    'confirmed',
    'paid',
    p_amount_paid,
    'direct',
    p_stripe_session_id,
    format('Stripe Checkout session: %s | Hold: %s', p_stripe_session_id, v_hold.id)
  )
  ON CONFLICT (stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_reservation_id;

  IF v_reservation_id IS NULL THEN
    SELECT id INTO v_reservation_id
    FROM public.reservations
    WHERE stripe_checkout_session_id = p_stripe_session_id;
    RETURN QUERY SELECT v_reservation_id, true;
    RETURN;
  END IF;

  DELETE FROM public.reservation_holds WHERE id = v_hold.id;

  -- A Stripe retry that finally succeeded closes its reconciliation item.
  UPDATE public.public_booking_payment_failures
  SET resolved_at = now()
  WHERE stripe_session_id = p_stripe_session_id
    AND resolved_at IS NULL;

  RETURN QUERY SELECT v_reservation_id, false;
END;
$$;

-- Supabase grants EXECUTE on new public functions to anon/authenticated by
-- default. This SECURITY DEFINER function confirms a paid reservation, and the
-- session id is returned to the browser by the checkout endpoint: it must be
-- callable by the webhook's service role only.
REVOKE ALL ON FUNCTION public.fn_promote_paid_reservation(text, numeric, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_promote_paid_reservation(text, numeric, timestamptz)
  TO service_role;

COMMIT;
