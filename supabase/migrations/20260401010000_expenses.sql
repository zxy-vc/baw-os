CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT 'ed4308c7-2bdb-46f2-be69-7c59674838e2',
  category TEXT NOT NULL CHECK (category IN ('internet', 'gas', 'luz', 'mantenimiento', 'limpieza', 'otro')),
  scope TEXT NOT NULL DEFAULT 'general' CHECK (scope IN ('general', 'unit')),
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  expense_date DATE NOT NULL,
  provider TEXT,
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_org_date ON expenses(org_id, expense_date);
