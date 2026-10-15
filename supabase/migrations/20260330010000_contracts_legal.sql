-- #15 + #16 — Datos legales en contratos
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS aval text,
  ADD COLUMN IF NOT EXISTS curp_arrendatario text,
  ADD COLUMN IF NOT EXISTS domicilio_arrendatario text;
-- status is text, en_renovacion is now a valid value alongside active/expired/terminated/pending/renewed
