-- BaW OS — Invoices / CFDI (FacturAPI)
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'baw',
  payment_id UUID REFERENCES payments(id),
  contract_id UUID REFERENCES contracts(id),
  facturapi_id TEXT,
  folio_number INTEGER,
  series TEXT DEFAULT 'A',
  status TEXT DEFAULT 'draft',  -- draft | valid | cancelled
  cfdi_use TEXT NOT NULL,             -- S01 (LTR) o G03 (STR/MTR)
  tax_regime TEXT DEFAULT '601',
  subtotal DECIMAL(10,2),
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2),
  pdf_url TEXT,
  xml_url TEXT,
  customer_rfc TEXT,
  customer_name TEXT,
  customer_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read invoices" ON invoices FOR SELECT USING (true);
CREATE POLICY "Insert invoices" ON invoices FOR INSERT WITH CHECK (true);
CREATE POLICY "Update invoices" ON invoices FOR UPDATE USING (true);
