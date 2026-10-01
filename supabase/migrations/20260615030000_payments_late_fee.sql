-- BaW OS — Cargos moratorios persistidos (Bloque 1: cobranza).
-- Antes el recargo por mora (3%/10%...) se calculaba solo en la UI y NUNCA se
-- guardaba: el inquilino "debía" un monto que no estaba en el sistema. Ahora el
-- runner de cobranza persiste el cargo escalonado por nivel en cada pago vencido.
--
-- Aditiva. Rollback: ALTER TABLE payments DROP COLUMN late_fee_amount, ...

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS late_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_fee_level TEXT,
  ADD COLUMN IF NOT EXISTS late_fee_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.payments.late_fee_amount IS
  'Cargo por mora aplicado a este pago (escalonado por nivel). El saldo del inquilino = amount + late_fee_amount.';
