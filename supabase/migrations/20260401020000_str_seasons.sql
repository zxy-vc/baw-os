CREATE TABLE IF NOT EXISTS str_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT 'ed4308c7-2bdb-46f2-be69-7c59674838e2',
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  price_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
