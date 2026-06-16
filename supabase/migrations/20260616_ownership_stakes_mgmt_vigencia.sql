-- BaW OS — Vigencias separadas en ownership_stakes (propiedad vs administración).
-- Antes había un solo par de fechas (starts_on/ends_on) cuyo significado era
-- ambiguo: ¿desde cuándo es DUEÑO o desde cuándo BaW ADMINISTRA? Fran pidió
-- distinguir ambas. Decisión:
--   starts_on / ends_on        → vigencia de PROPIEDAD (titularidad del %).
--   mgmt_starts_on / mgmt_ends_on → vigencia de ADMINISTRACIÓN (mandato a BaW).
-- Fin (ends_on / mgmt_ends_on) vacío = vigente/indefinido.
--
-- Aditiva + idempotente. Rollback: DROP COLUMN mgmt_starts_on, mgmt_ends_on.

ALTER TABLE public.ownership_stakes
  ADD COLUMN IF NOT EXISTS mgmt_starts_on date,
  ADD COLUMN IF NOT EXISTS mgmt_ends_on   date;

COMMENT ON COLUMN public.ownership_stakes.starts_on IS
  'Vigencia de PROPIEDAD: desde cuándo el propietario tiene este % del edificio.';
COMMENT ON COLUMN public.ownership_stakes.ends_on IS
  'Vigencia de PROPIEDAD: hasta cuándo (NULL = vigente/indefinido).';
COMMENT ON COLUMN public.ownership_stakes.mgmt_starts_on IS
  'Vigencia de ADMINISTRACIÓN: desde cuándo BaW administra el edificio por mandato del dueño.';
COMMENT ON COLUMN public.ownership_stakes.mgmt_ends_on IS
  'Vigencia de ADMINISTRACIÓN: hasta cuándo (NULL = vigente/indefinido).';
