-- ============================================================
-- BaW OS · Public booking: paid checkout → reservation integrity
--
-- A Checkout session is only exposed after all reservation data is persisted
-- in reservation_holds. fn_promote_paid_reservation then inserts the paid
-- reservation and deletes its hold in one PostgreSQL transaction.
--
-- Prerequisite: public.reservation_holds and public.stripe_processed_events
-- must exist. 20260523_public_booking.sql cannot be applied unchanged because
-- its expires_at > now() EXCLUDE predicate is invalid (42P17); verify the
-- recovered baseline before applying this migration.
-- ============================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.reservation_holds') IS NULL THEN
    RAISE EXCEPTION
      'Missing public.reservation_holds. Repair the 20260523 public-booking baseline before applying 20260720_public_booking_payment_integrity.sql';
  END IF;
  IF to_regclass('public.stripe_processed_events') IS NULL THEN
    RAISE EXCEPTION
      'Missing public.stripe_processed_events. Repair the 20260523 public-booking baseline before applying 20260720_public_booking_payment_integrity.sql';
  END IF;
END;
$$;

-- Snapshot every value needed to make a reservation before Stripe can charge.
-- Nullable additions preserve any short-lived legacy holds; the NOT VALID check
-- below rejects linking a *new* Checkout session without the complete snapshot.
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

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS platform text;

CREATE UNIQUE INDEX IF NOT EXISTS reservations_stripe_checkout_session_id_key
  ON public.reservations (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- Durable reconciliation queue for paid Checkout sessions whose promotion
-- fails. The webhook still responds 500 so Stripe retries; this record remains
-- actionable if the failure survives Stripe's retry window.
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

CREATE OR REPLACE FUNCTION public.fn_promote_paid_reservation(
  p_stripe_session_id text,
  p_amount_paid numeric
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

  -- Re-delivery after a successful promotion is harmless.
  SELECT id INTO v_reservation_id
  FROM public.reservations
  WHERE stripe_checkout_session_id = p_stripe_session_id;
  IF FOUND THEN
    RETURN QUERY SELECT v_reservation_id, true;
    RETURN;
  END IF;

  -- The Checkout session id is Stripe-signed event data; do not select a hold
  -- from browser-provided metadata. Row locking makes concurrent deliveries safe.
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
    RAISE EXCEPTION 'No hold found for Stripe Checkout session %', p_stripe_session_id;
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
  RETURN QUERY SELECT v_reservation_id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_promote_paid_reservation(text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_promote_paid_reservation(text, numeric) TO service_role;

COMMIT;
