-- #9 + #10 — Datos fiscales en occupants (contactos)
ALTER TABLE occupants
  ADD COLUMN IF NOT EXISTS rfc text,
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS regimen_fiscal text,
  ADD COLUMN IF NOT EXISTS cp_fiscal text,
  ADD COLUMN IF NOT EXISTS email_factura text,
  ADD COLUMN IF NOT EXISTS requiere_factura boolean DEFAULT false;
