-- Migration: tabla invoices para CFDI FacturAPI
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          TEXT NOT NULL DEFAULT 'baw',
  payment_id      UUID REFERENCES payments(id),
  contract_id     UUID REFERENCES contracts(id),
  facturapi_id    TEXT,
  folio_number    INTEGER,
  series          TEXT DEFAULT 'A',
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft, valid, cancelled
  cfdi_use        TEXT,
  tax_regime      TEXT,
  subtotal        DECIMAL(10,2) NOT NULL,
  tax             DECIMAL(10,2) NOT NULL DEFAULT 0,
  total           DECIMAL(10,2) NOT NULL,
  customer_rfc    TEXT NOT NULL,
  customer_name   TEXT NOT NULL,
  customer_email  TEXT,
  pdf_url         TEXT,
  xml_url         TEXT,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invoices_payment_id_idx ON invoices(payment_id);
CREATE INDEX IF NOT EXISTS invoices_contract_id_idx ON invoices(contract_id);
