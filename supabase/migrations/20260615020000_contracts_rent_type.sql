-- BaW OS — Tipo de renta explícito en contratos (Bloque 2).
-- Antes el tipo de renta (larga/media/corta) solo se infería del unit.type. Ahora
-- el contrato lo declara explícitamente: permite que la generación mensual de renta
-- omita estancias cortas (STR, que se cobran por reserva, no por mes) y habilita
-- reportes por modalidad. Se respalda la taxonomía existente UnitType (LTR/MTR/STR).
--
-- Aditiva + idempotente. Rollback: ALTER TABLE contracts DROP COLUMN rent_type.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS rent_type TEXT NOT NULL DEFAULT 'LTR';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_rent_type_chk'
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_rent_type_chk CHECK (rent_type IN ('LTR', 'MTR', 'STR'));
  END IF;
END$$;

-- Backfill: arrastrar el tipo desde la unidad cuando aplica.
UPDATE public.contracts c
SET rent_type = u.type
FROM public.units u
WHERE c.unit_id = u.id
  AND u.type IN ('LTR', 'MTR', 'STR')
  AND c.rent_type = 'LTR';

COMMENT ON COLUMN public.contracts.rent_type IS
  'Modalidad de renta: LTR (larga), MTR (media), STR (corta). STR no genera renta mensual automática.';
