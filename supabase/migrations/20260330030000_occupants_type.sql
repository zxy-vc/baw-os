-- BaW OS — Add contact type to occupants for CRM module
ALTER TABLE occupants ADD COLUMN IF NOT EXISTS type text DEFAULT 'both' CHECK (type IN ('ltr', 'str', 'both'));
