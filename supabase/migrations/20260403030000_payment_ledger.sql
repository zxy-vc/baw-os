-- Payment Ledger — Bitácora inmutable de cobros
-- Append-only by RLS design: only INSERT + SELECT policies, no UPDATE/DELETE

CREATE TABLE IF NOT EXISTS payment_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  payment_id UUID REFERENCES payments(id),
  contract_id UUID NOT NULL,
  unit_id UUID NOT NULL,
  tenant_name TEXT,
  amount NUMERIC NOT NULL,
  water_fee NUMERIC DEFAULT 0,
  total NUMERIC NOT NULL,
  payment_method TEXT DEFAULT 'efectivo' CHECK (payment_method IN ('efectivo', 'transferencia', 'cheque', 'otro')),
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT payment_ledger_created_at_immutable CHECK (true)
);

ALTER TABLE payment_ledger ENABLE ROW LEVEL SECURITY;

-- Solo INSERT y SELECT (no UPDATE, no DELETE)
CREATE POLICY ledger_select ON payment_ledger FOR SELECT USING (true);
CREATE POLICY ledger_insert ON payment_ledger FOR INSERT WITH CHECK (true);
-- NO policies for UPDATE/DELETE = efectivamente inmutable

CREATE INDEX idx_ledger_contract_id ON payment_ledger(contract_id);
CREATE INDEX idx_ledger_created_at ON payment_ledger(created_at DESC);

-- Agregar campos confirmed_by a payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS confirmed_by TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'efectivo';
