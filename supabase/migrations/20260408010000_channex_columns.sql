-- BaW OS — Add Channex integration columns to reservations
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS channel text;

CREATE UNIQUE INDEX IF NOT EXISTS reservations_external_id_key ON reservations (external_id) WHERE external_id IS NOT NULL;
