-- ENG-624 · Conector de solo lectura para Engrane (lado BaW OS)
-- ============================================================================
-- Decisión de Fran (2026-10-18): BaW OS es el sistema especializado y Engrane
-- se conecta encima, SOLO LECTURA. Cada dato vive en un solo lugar.
--
-- Dos tablas nuevas, ninguna tabla existente cambia:
--
--  1. connector_keys — una llave por organización × espacio del consumidor
--     (consumer = 'engrane', consumer_ref = id del espacio en Engrane).
--     · Separada de agent_credentials: una llave de conector NO pertenece a un
--       agente del catálogo y NO sirve en /api/v1 (prefijo ck_live_ ≠ sk_live_).
--     · Solo se guarda el SHA-256 de la llave; el valor plano se enseña una
--       sola vez al crearla (POST /api/admin/connectors/keys).
--     · building_ids NULL = todos los edificios de la org; si trae valores, la
--       llave solo ve esos edificios.
--     · Revocable y sin vuelta atrás: el trigger impide reactivarla o cambiar
--       su identidad (org, consumidor, hash). Rotar = revocar + crear.
--     · A lo más UNA llave activa por (org, consumer, consumer_ref).
--
--  2. connector_access_log — rastro de cada lectura con llave reconocida
--     (quién: key/consumer_ref · cuándo: created_at · qué: endpoint + query +
--     filas devueltas). Append-only: el trigger bloquea UPDATE. El conector
--     no sirve datos si no pudo escribir aquí (fail closed).
--
-- Ningún usuario de navegador escribe en estas tablas: no hay policies de
-- INSERT/UPDATE/DELETE; solo service_role (rutas de servidor). Los admins de
-- la org (user_is_org_admin, 20260612010000) pueden LEER sus llaves y su
-- bitácora. El hash nunca sale por la API (la API selecciona columnas).
--
-- Idempotente (IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS).
-- ⚠️ NO EJECUTADA en prod. Aplicar en Supabase antes de entregar llaves.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) connector_keys
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.connector_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  consumer      text NOT NULL CHECK (consumer IN ('engrane')),
  consumer_ref  text NOT NULL CHECK (length(consumer_ref) BETWEEN 1 AND 128),
  label         text NOT NULL CHECK (length(label) BETWEEN 1 AND 64),
  key_prefix    text NOT NULL,                 -- 'ck_live_xxxxxxxx' (16 chars) para lookup y UI
  key_hash      text NOT NULL UNIQUE,          -- sha256 hex de la llave completa
  building_ids  uuid[],                        -- NULL = toda la org
  datasets      text[] NOT NULL
    DEFAULT ARRAY['units','reservations','occupancy','revenue','guests']::text[],
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at    timestamptz,
  revoked_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT connector_keys_datasets_known CHECK (
    cardinality(datasets) > 0
    AND datasets <@ ARRAY['units','reservations','occupancy','revenue','guests']::text[]
  ),
  CONSTRAINT connector_keys_buildings_not_empty CHECK (
    building_ids IS NULL OR cardinality(building_ids) > 0
  ),
  CONSTRAINT connector_keys_revoked_consistent CHECK (
    (status = 'revoked') = (revoked_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS connector_keys_one_active_per_consumer
  ON public.connector_keys (org_id, consumer, consumer_ref)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS connector_keys_prefix_idx
  ON public.connector_keys (key_prefix);

-- Identidad inmutable + revocación sin retorno.
CREATE OR REPLACE FUNCTION public.connector_keys_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.org_id       IS DISTINCT FROM OLD.org_id
  OR NEW.consumer     IS DISTINCT FROM OLD.consumer
  OR NEW.consumer_ref IS DISTINCT FROM OLD.consumer_ref
  OR NEW.key_prefix   IS DISTINCT FROM OLD.key_prefix
  OR NEW.key_hash     IS DISTINCT FROM OLD.key_hash THEN
    RAISE EXCEPTION 'connector_keys: la identidad de la llave es inmutable';
  END IF;
  IF OLD.status = 'revoked' AND NEW.status <> 'revoked' THEN
    RAISE EXCEPTION 'connector_keys: una llave revocada no se reactiva (crea otra)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS connector_keys_guard ON public.connector_keys;
CREATE TRIGGER connector_keys_guard
  BEFORE UPDATE ON public.connector_keys
  FOR EACH ROW EXECUTE FUNCTION public.connector_keys_guard();

ALTER TABLE public.connector_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connector_keys_select_admin ON public.connector_keys;
CREATE POLICY connector_keys_select_admin ON public.connector_keys
  FOR SELECT TO authenticated
  USING (public.user_is_org_admin(auth.uid(), org_id));

REVOKE ALL ON public.connector_keys FROM anon;

-- ---------------------------------------------------------------------------
-- 2) connector_access_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.connector_access_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key_id        uuid NOT NULL REFERENCES public.connector_keys(id) ON DELETE RESTRICT,
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  consumer      text NOT NULL,
  consumer_ref  text NOT NULL,
  dataset       text NOT NULL,
  endpoint      text NOT NULL,
  query         jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome       text NOT NULL CHECK (outcome IN (
                  'ok', 'bad_request', 'denied_revoked', 'denied_expired',
                  'denied_dataset', 'denied_scope', 'error')),
  http_status   integer NOT NULL,
  row_count     integer,
  ip            text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connector_access_log_key_idx
  ON public.connector_access_log (key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS connector_access_log_org_idx
  ON public.connector_access_log (org_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.connector_access_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'connector_access_log es append-only';
END;
$$;

DROP TRIGGER IF EXISTS connector_access_log_no_update ON public.connector_access_log;
CREATE TRIGGER connector_access_log_no_update
  BEFORE UPDATE ON public.connector_access_log
  FOR EACH ROW EXECUTE FUNCTION public.connector_access_log_append_only();

ALTER TABLE public.connector_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connector_access_log_select_admin ON public.connector_access_log;
CREATE POLICY connector_access_log_select_admin ON public.connector_access_log
  FOR SELECT TO authenticated
  USING (public.user_is_org_admin(auth.uid(), org_id));

REVOKE ALL ON public.connector_access_log FROM anon;

COMMIT;

-- Rollback:
-- BEGIN;
--   DROP TABLE IF EXISTS public.connector_access_log;
--   DROP FUNCTION IF EXISTS public.connector_access_log_append_only();
--   DROP TABLE IF EXISTS public.connector_keys;
--   DROP FUNCTION IF EXISTS public.connector_keys_guard();
-- COMMIT;
