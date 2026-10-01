CREATE TABLE IF NOT EXISTS whatsapp_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  contract_id UUID REFERENCES contracts(id),
  occupant_id UUID REFERENCES occupants(id),
  message_type TEXT NOT NULL CHECK (message_type IN ('mora', 'recordatorio', 'welcome', 'custom')),
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
