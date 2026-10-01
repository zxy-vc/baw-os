-- Payment breakdown: rent + water fee
ALTER TABLE payments ADD COLUMN IF NOT EXISTS rent_amount DECIMAL(10,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS water_fee DECIMAL(10,2) DEFAULT 250;

-- Incidents table (if not already created)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_status') THEN
    CREATE TYPE incident_status AS ENUM ('open', 'in_progress', 'waiting_parts', 'resolved', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_priority') THEN
    CREATE TYPE incident_priority AS ENUM ('low', 'medium', 'high', 'urgent');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS incidents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id         UUID REFERENCES units(id),
  reported_by     UUID REFERENCES occupants(id),
  title           TEXT NOT NULL,
  description     TEXT,
  status          incident_status NOT NULL DEFAULT 'open',
  priority        incident_priority NOT NULL DEFAULT 'medium',
  assigned_to     TEXT,
  assigned_phone  TEXT,
  estimated_cost  DECIMAL(10,2),
  actual_cost     DECIMAL(10,2),
  resolved_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY incidents_org_isolation ON incidents
  USING (org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  ));

CREATE OR REPLACE TRIGGER update_incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
