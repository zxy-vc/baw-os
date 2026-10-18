-- BaW OS — Enlace pago ↔ cargo accesorio (Fase 2 / PR B3: cobranza).
--
-- El cron mensual ahora genera, además de la renta, un renglón de pago por cada
-- cargo accesorio activo (estacionamiento extra, espectaculares):
--   • cadence='monthly' → cada mes en su billing_day.
--   • cadence='annual'  → una vez al año, en el mes de effective_from, día billing_day.
--
-- Esta columna liga el pago con el cargo que lo originó, y es la clave de
-- idempotencia: el cron no vuelve a generar un pago para el mismo cargo en el
-- mismo periodo si ya existe. NULL = pago de renta normal (no accesorio).
--
-- Aditiva + idempotente. Rollback: ALTER TABLE payments DROP COLUMN ancillary_charge_id.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS ancillary_charge_id UUID REFERENCES ancillary_charges(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payments_ancillary_charge_idx ON public.payments(ancillary_charge_id);

COMMENT ON COLUMN public.payments.ancillary_charge_id IS
  'Cargo accesorio que originó este pago (estacionamiento/espectacular). NULL = pago de renta normal.';
