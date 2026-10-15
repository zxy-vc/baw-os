-- =============================================================================
-- SOLO CI · bootstrap previo a supabase/migrations/ (NO es una migración)
-- =============================================================================
-- Prod nació con tablas creadas a mano antes de la primera migración del repo
-- (20260327010000). Mientras no exista el baseline desde pg_dump (BAW-3 parte
-- 4), el job `db-reset` (.github/workflows/migrations.yml) copia este archivo
-- en el runner como `20260326000000_ci_bootstrap.sql` para que la cadena tenga
-- sobre qué correr. Vive fuera de supabase/migrations/: el CLI nunca lo empuja
-- a ningún proyecto remoto y NO se registra en schema_migrations de prod.
--
-- Contenido: el subconjunto mínimo de docs/schema.sql (v0.1, marzo 2026) que
-- las migraciones asumen existente, más lo que prod tenía y ningún archivo
-- crea. Cuando llegue el baseline real, este archivo se borra.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  settings    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Org histórica de BaW: el seed QA de 20260404010000_guest_portal.sql:19-35 la
-- referencia por id (FK de reservations.organization_id).
INSERT INTO organizations (id, name, slug)
VALUES ('ed4308c7-2bdb-46f2-be69-7c59674838e2', 'BaW', 'baw-alm809p');

-- 'manager' lo usa 20260503133017_v1_api_infra.sql:96 y ninguna migración lo agrega.
CREATE TYPE member_role AS ENUM ('owner', 'admin', 'operator', 'viewer', 'agent', 'manager');

CREATE TABLE org_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       member_role NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

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

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

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

CREATE TYPE contract_status AS ENUM ('active', 'expired', 'terminated', 'pending', 'renewed');

CREATE TABLE contracts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id         UUID REFERENCES units(id),            -- NULL = contrato independiente (standalone), ej. anunciante
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

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_occupants_updated_at BEFORE UPDATE ON occupants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Existen en prod pero ningún archivo del repo las crea; las trunca
-- 20260429041233_multitenancy_v2.sql:21-39.
CREATE TABLE unit_prices (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE escalation_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
