-- BaW OS — Lifecycle: archivado uniforme (soft-delete) para entidades core.
--
-- Agrega `archived_at timestamptz` (NULL = activo) a las entidades que el feature
-- de Archivar/Eliminar maneja. No se usa un enum de status para esto porque los
-- status operativos (units.status='inactive', contracts.status='terminated', ...)
-- significan cosas distintas a "archivado/oculto". `archived_at` es ortogonal y
-- uniforme entre tablas.
--
-- Aditiva e idempotente. Las listas filtran archived_at IS NULL por defecto.

ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.units     ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.occupants ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Índices parciales para listar "activos" rápido (la mayoría de las consultas).
CREATE INDEX IF NOT EXISTS idx_buildings_active ON public.buildings (org_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_units_active     ON public.units (org_id)     WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_active ON public.contracts (org_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_occupants_active ON public.occupants (org_id) WHERE archived_at IS NULL;
