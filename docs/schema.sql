-- BaW OS — Database Schema v0.1
-- Supabase (PostgreSQL) con Row Level Security por organización
-- BaW Design Lab · ZXY Ventures · Marzo 2026

-- ============================================
-- EXTENSIONES
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ORGANIZATIONS (Multi-tenant core)
-- ============================================
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  settings    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- BaW como organización #1
INSERT INTO organizations (name, slug) VALUES ('BaW', 'baw-alm809p');

-- ============================================
-- UNITS (Departamentos/unidades del edificio)
-- ============================================
CREATE TYPE unit_type AS ENUM ('STR', 'MTR', 'LTR', 'OFFICE', 'COMMON');
CREATE TYPE unit_status AS ENUM ('available', 'occupied', 'maintenance', 'reserved', 'inactive');

CREATE TABLE units (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number      TEXT NOT NULL,           -- ej: "101", "202", "5A"
  floor       INTEGER,
  type        unit_type NOT NULL DEFAULT 'LTR',
  status      unit_status NOT NULL DEFAULT 'available',
  area_m2     DECIMAL(8,2),
  bedrooms    INTEGER,
  bathrooms   INTEGER,
  amenities   TEXT[],
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, number)
);

-- RLS
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units_org_isolation" ON units
  USING (org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  ));

-- ============================================
-- OCCUPANTS (Inquilinos y huéspedes)
-- ============================================
CREATE TYPE occupant_type AS ENUM ('tenant', 'guest', 'owner', 'staff');

CREATE TABLE occupants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT,                  -- formato: +521XXXXXXXXXX
  email         TEXT,
  id_type       TEXT,                  -- INE, pasaporte, etc.
  id_number     TEXT,
  type          occupant_type NOT NULL DEFAULT 'tenant',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE occupants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "occupants_org_isolation" ON occupants
  USING (org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  ));

-- ============================================
-- CONTRACTS (Contratos LTR/MTR)
-- ============================================
CREATE TYPE contract_status AS ENUM ('active', 'expired', 'terminated', 'pending', 'renewed');

CREATE TABLE contracts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id         UUID NOT NULL REFERENCES units(id),
  occupant_id     UUID NOT NULL REFERENCES occupants(id),
  start_date      DATE NOT NULL,
  end_date        DATE,
  monthly_amount  DECIMAL(10,2) NOT NULL,
  deposit_amount  DECIMAL(10,2),
  deposit_paid    BOOLEAN DEFAULT FALSE,
  payment_day     INTEGER DEFAULT 1,    -- día del mes en que vence el pago
  status          contract_status NOT NULL DEFAULT 'active',
  contract_url    TEXT,                 -- URL al PDF del contrato en Storage
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contracts_org_isolation" ON contracts
  USING (org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  ));

-- ============================================
-- PAYMENTS (Registro de pagos)
-- ============================================
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'late', 'partial', 'waived');
CREATE TYPE payment_method AS ENUM ('cash', 'transfer', 'stripe', 'spei', 'other');

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_id     UUID NOT NULL REFERENCES contracts(id),
  amount          DECIMAL(10,2) NOT NULL,
  amount_paid     DECIMAL(10,2),
  due_date        DATE NOT NULL,
  paid_date       DATE,
  status          payment_status NOT NULL DEFAULT 'pending',
  method          payment_method,
  reference       TEXT,                 -- número de transferencia, ID de Stripe, etc.
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_org_isolation" ON payments
  USING (org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  ));

-- ============================================
-- INCIDENTS (Incidencias y mantenimiento)
-- ============================================
CREATE TYPE incident_status AS ENUM ('open', 'in_progress', 'waiting_parts', 'resolved', 'cancelled');
CREATE TYPE incident_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE incidents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id         UUID REFERENCES units(id),           -- puede ser área común
  reported_by     UUID REFERENCES occupants(id),
  title           TEXT NOT NULL,
  description     TEXT,
  status          incident_status NOT NULL DEFAULT 'open',
  priority        incident_priority NOT NULL DEFAULT 'medium',
  assigned_to     TEXT,                 -- nombre del proveedor/técnico
  assigned_phone  TEXT,
  estimated_cost  DECIMAL(10,2),
  actual_cost     DECIMAL(10,2),
  resolved_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incidents_org_isolation" ON incidents
  USING (org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  ));

-- ============================================
-- STR RESERVATIONS (Reservas de renta corta)
-- ============================================
CREATE TYPE reservation_status AS ENUM ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show');

CREATE TABLE reservations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id         UUID NOT NULL REFERENCES units(id),
  guest_id        UUID REFERENCES occupants(id),
  check_in        DATE NOT NULL,
  check_out       DATE NOT NULL,
  nights          INTEGER GENERATED ALWAYS AS (check_out - check_in) STORED,
  guests_count    INTEGER DEFAULT 1,
  nightly_rate    DECIMAL(10,2) NOT NULL,
  total_amount    DECIMAL(10,2) NOT NULL,
  cleaning_fee    DECIMAL(10,2) DEFAULT 0,
  status          reservation_status NOT NULL DEFAULT 'pending',
  source          TEXT DEFAULT 'direct', -- direct, airbnb, booking, etc.
  stripe_payment_id TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reservations_org_isolation" ON reservations
  USING (org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  ));

-- ============================================
-- ORG MEMBERS (Usuarios por organización)
-- ============================================
CREATE TYPE member_role AS ENUM ('owner', 'admin', 'operator', 'viewer', 'agent');

CREATE TABLE org_members (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      member_role NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_self" ON org_members
  USING (user_id = auth.uid());

-- ============================================
-- WEBHOOK EVENTS LOG
-- ============================================
CREATE TABLE webhook_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  event_type  TEXT NOT NULL,    -- unit.status_changed, payment.overdue, etc.
  payload     JSONB NOT NULL,
  delivered   BOOLEAN DEFAULT FALSE,
  attempts    INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FUNCIONES ÚTILES
-- ============================================

-- Auto-update de updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a todas las tablas principales
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_occupants_updated_at BEFORE UPDATE ON occupants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_incidents_updated_at BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- DATOS INICIALES: ALM809P (BaW)
-- Descomentar y ajustar al migrar de Lodgify
-- ============================================

-- INSERT INTO units (org_id, number, floor, type, status) 
-- SELECT id, '101', 1, 'LTR', 'occupied' FROM organizations WHERE slug = 'baw-alm809p';
-- (repetir para los 16 departamentos)
