-- BaW OS — Libro de abonos (payment_receipts).
--
-- Problema: un cobro mensual (payments) guardaba el cargo Y lo pagado en una sola
-- fila, así que varios abonos del mismo mes (pagos parciales, cuenta familiar,
-- distintos pagadores) se mezclaban y se perdía el detalle por movimiento.
--
-- Solución: cada ABONO (dinero que entra) es su propia fila aquí, ligada al
-- cargo del mes (payment_id). El estatus del mes se deriva sumando sus abonos.
-- payments sigue siendo el CARGO (renta + agua + mora) y am_paid queda como
-- suma cacheada de los abonos. payment_ledger sigue siendo la bitácora inmutable.
--
-- Idempotente, no destructiva.

CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  paid_date date NOT NULL,
  method text,            -- enum inglés: 'cash' | 'transfer' | ...
  payment_method text,    -- español: 'efectivo' | 'transferencia' | 'otro'
  reference text,
  payer_occupant_id uuid REFERENCES public.occupants(id) ON DELETE SET NULL,
  confirmed_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_payment ON public.payment_receipts (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_contract ON public.payment_receipts (contract_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_payer ON public.payment_receipts (payer_occupant_id);

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_receipts_member ON public.payment_receipts;
CREATE POLICY payment_receipts_member ON public.payment_receipts FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = payment_receipts.org_id AND om.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = payment_receipts.org_id AND om.user_id = auth.uid()
  ));
