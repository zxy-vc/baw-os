-- Mifiel digital signature fields
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS mifiel_document_id TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signature_status TEXT DEFAULT 'none';
