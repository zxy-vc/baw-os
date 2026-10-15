-- ============================================================
-- BaW OS · Sprint 5B — Public Booking Engine (Mateos 809 / ADR-017 / ADR-018)
-- ============================================================
BEGIN;

-- ── 1. buildings: campos públicos ────────────────────────────
ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS public_name text,
  ADD COLUMN IF NOT EXISTS public_description text,
  ADD COLUMN IF NOT EXISTS hero_url text,
  ADD COLUMN IF NOT EXISTS gallery jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS amenities_common jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS faq jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS location_lat numeric,
  ADD COLUMN IF NOT EXISTS location_lng numeric,
  ADD COLUMN IF NOT EXISTS is_public_listed boolean NOT NULL DEFAULT false;

-- ── 2. units: campos públicos ────────────────────────────────
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS public_name text,
  ADD COLUMN IF NOT EXISTS public_description text,
  ADD COLUMN IF NOT EXISTS hero_url text,
  ADD COLUMN IF NOT EXISTS base_rate_mxn numeric,
  ADD COLUMN IF NOT EXISTS cleaning_fee_mxn numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_guests integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS min_nights integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES public.buildings(id),
  ADD COLUMN IF NOT EXISTS is_publicly_bookable boolean NOT NULL DEFAULT false;

-- ── 3. Constraint anti double-booking en reservations ────────
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- usar DO/EXCEPTION porque ADD CONSTRAINT IF NOT EXISTS no está soportado
-- en todas las versiones de Postgres para EXCLUDE constraints
DO $$
BEGIN
  ALTER TABLE public.reservations
    ADD CONSTRAINT no_overlap_per_unit
    EXCLUDE USING gist (
      unit_id WITH =,
      daterange(check_in, check_out, '[)') WITH &&
    ) WHERE (status IN ('confirmed', 'checked_in'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table  THEN NULL;
END;
$$;

-- ── 4. Hold temporal ─────────────────────────────────────────
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

-- EXCLUDE en holds (separado del CREATE TABLE para poder usar DO/EXCEPTION)
DO $$
BEGIN
  ALTER TABLE public.reservation_holds
    ADD CONSTRAINT no_overlap_per_hold
    EXCLUDE USING gist (
      unit_id WITH =,
      daterange(from_date, to_date, '[)') WITH &&
    ) WHERE (expires_at > now());
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table  THEN NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS reservation_holds_expires_idx
  ON public.reservation_holds(expires_at);

CREATE INDEX IF NOT EXISTS reservation_holds_stripe_idx
  ON public.reservation_holds(stripe_session_id);

-- ── 5. Idempotencia webhook Stripe ───────────────────────────
CREATE TABLE IF NOT EXISTS public.stripe_processed_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);

-- ── 6. Idempotencia checkout cliente ─────────────────────────
CREATE TABLE IF NOT EXISTS public.checkout_idempotency (
  key text PRIMARY KEY,
  response jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_idempotency_expires_idx
  ON public.checkout_idempotency(expires_at);

-- ── 7. Vistas públicas ───────────────────────────────────────
CREATE OR REPLACE VIEW public.v_public_buildings AS
SELECT
  id,
  slug,
  public_name      AS name,
  public_description AS description,
  hero_url,
  gallery,
  amenities_common AS amenities,
  faq,
  city,
  state,
  country,
  location_lat,
  location_lng
FROM public.buildings
WHERE is_public_listed = true;

CREATE OR REPLACE VIEW public.v_public_units AS
SELECT
  u.id,
  u.slug,
  u.building_id,
  b.slug         AS building_slug,
  u.public_name  AS name,
  u.public_description AS description,
  u.hero_url,
  u.amenities,
  u.base_rate_mxn,
  u.cleaning_fee_mxn,
  u.max_guests,
  u.min_nights
FROM public.units u
JOIN public.buildings b ON b.id = u.building_id
WHERE u.is_publicly_bookable = true
  AND b.is_public_listed    = true;

-- ── 8. Función helper de disponibilidad ──────────────────────
CREATE OR REPLACE FUNCTION public.fn_unit_is_available(
  p_unit_id uuid,
  p_from    date,
  p_to      date
) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.reservations
      WHERE unit_id = p_unit_id
        AND status IN ('confirmed', 'checked_in', 'tentative')
        AND daterange(check_in, check_out, '[)') && daterange(p_from, p_to, '[)')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.reservation_holds
      WHERE unit_id   = p_unit_id
        AND expires_at > now()
        AND daterange(from_date, to_date, '[)') && daterange(p_from, p_to, '[)')
    );
$$;

-- ── 9. GRANTs públicos (solo vistas y función) ───────────────
GRANT SELECT ON public.v_public_buildings TO anon;
GRANT SELECT ON public.v_public_units     TO anon;
GRANT EXECUTE ON FUNCTION public.fn_unit_is_available TO anon;

-- ── 10. Seed: marcar Mateos 809 como edificio público ────────
UPDATE public.buildings
SET
  slug               = 'mateos-809',
  public_name        = '809',
  public_description = 'Doce departamentos sobre Adolfo López Mateos 809 en León, Guanajuato. Estancias contemporáneas desde una noche.',
  is_public_listed   = true
WHERE org_id = 'ed4308c7-2bdb-46f2-be69-7c59674838e2';

COMMIT;
