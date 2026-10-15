-- ============================================================
-- BaW OS · Fase 1 Public Listing — galería pública + tipo de renta
-- (rama claude/property-listing-website-qf916r)
--
-- 1. units.monthly_rate_mxn — precio mensual para unidades MTR/LTR
--    (base_rate_mxn sigue siendo tarifa POR NOCHE para STR).
-- 2. v_public_units expone rent_type (units.type: LTR/MTR/STR) y
--    monthly_rate_mxn. Columnas nuevas van AL FINAL para que
--    CREATE OR REPLACE VIEW sea válido.
-- 3. v_public_unit_media — fotos con visibility='public' de unidades
--    publicables. Es el puente media_assets → sitio público que
--    faltaba (las vistas de 20260523 solo exponían hero_url).
--
-- Aditiva + idempotente. Rollback:
--   DROP VIEW IF EXISTS public.v_public_unit_media;
--   ALTER TABLE public.units DROP COLUMN IF EXISTS monthly_rate_mxn;
--   (y re-correr la sección 7 de 20260523_public_booking.sql)
-- ============================================================
BEGIN;

-- ── 1. Precio mensual para MTR/LTR ───────────────────────────
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS monthly_rate_mxn numeric;

COMMENT ON COLUMN public.units.monthly_rate_mxn IS
  'Renta mensual pública para unidades MTR/LTR. base_rate_mxn es por noche (STR).';

-- ── 2. v_public_units + rent_type + monthly_rate_mxn ─────────
-- Mismo orden de columnas que 20260523; las nuevas al final.
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
  u.min_nights,
  CASE WHEN u.type IN ('LTR', 'MTR', 'STR') THEN u.type ELSE 'STR' END AS rent_type,
  u.monthly_rate_mxn
FROM public.units u
JOIN public.buildings b ON b.id = u.building_id
WHERE u.is_publicly_bookable = true
  AND b.is_public_listed    = true;

-- ── 3. Vista pública de galería de fotos ─────────────────────
CREATE OR REPLACE VIEW public.v_public_unit_media AS
SELECT
  m.id,
  m.unit_id,
  u.slug        AS unit_slug,
  m.file_url,
  m.alt_text,
  m.caption,
  m.sort_order,
  m.is_cover
FROM public.media_assets m
JOIN public.units u     ON u.id = m.unit_id
JOIN public.buildings b ON b.id = u.building_id
WHERE m.visibility = 'public'
  AND m.kind       = 'image'
  AND m.file_url IS NOT NULL
  AND u.is_publicly_bookable = true
  AND b.is_public_listed     = true;

-- ── 4. GRANTs (solo lectura de vistas para anon) ─────────────
GRANT SELECT ON public.v_public_units      TO anon;
GRANT SELECT ON public.v_public_unit_media TO anon;

COMMIT;
