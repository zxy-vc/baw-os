-- BaW OS — Fase 2b: Party persona/empresa + separar pagador ≠ ocupante.
--
-- Cimiento del caso corporativo: una empresa puede ser una "Party" de primera
-- clase (la que paga y factura) distinta de quien ocupa el inmueble.
--
-- Idempotente. NO destructivo (solo agrega columnas, defaults seguros).

-- 1. occupants.kind — la Party puede ser persona física o empresa.
--    Default 'persona' para no tocar nada existente; las empresas se marcan en UI.
ALTER TABLE public.occupants
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'persona';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'occupants_kind_check'
  ) THEN
    ALTER TABLE public.occupants
      ADD CONSTRAINT occupants_kind_check CHECK (kind IN ('persona', 'empresa'));
  END IF;
END $$;

-- 2. contracts.payer_occupant_id — quién paga, si es ≠ del inquilino (ej. la
--    empresa paga el contrato de su empleado). NULL ⇒ paga el propio inquilino
--    (comportamiento actual, intacto).
--
--    IMPORTANTE: columna uuid SIN foreign key a propósito. Una segunda FK
--    contracts→occupants volvería AMBIGUOS los embeds `occupant:occupants(...)`
--    de PostgREST en ~25 lugares de la app (finanzas, cobros, facturas, etc.),
--    rompiéndolos. El PersonPicker garantiza ids válidos; la FK formal queda como
--    follow-up junto con un sweep que desambigüe esos embeds (occupant_id).
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS payer_occupant_id uuid;

CREATE INDEX IF NOT EXISTS idx_contracts_payer_occupant
  ON public.contracts (payer_occupant_id);
