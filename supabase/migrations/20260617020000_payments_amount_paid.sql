-- BaW OS — Pagos parciales: columna amount_paid faltante (Bloque: cobranza).
--
-- El flujo de cobranza (marcar pago / pago parcial en /cobros) y la generación
-- del estado de cuenta ESCRIBEN y LEEN payments.amount_paid, pero ninguna
-- migración la creó: se introdujo con el bloque de pagos parciales sin su DDL.
-- Sin esta columna, CUALQUIER registro de pago (incluso uno normal) y el estado
-- de cuenta fallan. Esta migración la agrega.
--
-- Aditiva + idempotente. Rollback: ALTER TABLE payments DROP COLUMN amount_paid.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2);

-- Backfill: los pagos ya marcados como 'paid' cubrieron el total.
UPDATE public.payments
  SET amount_paid = amount
  WHERE status = 'paid' AND amount_paid IS NULL;

COMMENT ON COLUMN public.payments.amount_paid IS
  'Monto efectivamente recibido. amount_paid < amount => pago parcial (status=partial).';

-- Si existe un CHECK sobre payments.status que NO contempla 'partial', se quita
-- para no bloquear los pagos parciales (la app controla los valores válidos).
-- Idempotente: si no hay constraint, o ya admite 'partial', no hace nada.
DO $$
DECLARE
  cname text;
  cdef  text;
BEGIN
  SELECT conname, pg_get_constraintdef(oid)
    INTO cname, cdef
  FROM pg_constraint
  WHERE conrelid = 'public.payments'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%'
  LIMIT 1;

  IF cname IS NOT NULL AND cdef NOT ILIKE '%partial%' THEN
    EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT %I', cname);
  END IF;
END $$;
