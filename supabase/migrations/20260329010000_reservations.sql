-- BaW OS — Reservations table (Booking Engine Fase 1)

CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid REFERENCES units(id),
  organization_id uuid REFERENCES organizations(id),
  guest_name text NOT NULL,
  guest_phone text,
  guest_email text,
  check_in date NOT NULL,
  check_out date NOT NULL,
  mode text NOT NULL CHECK (mode IN ('full', 'room', 'bed')),
  rooms_count integer DEFAULT 1,
  beds_count integer DEFAULT 1,
  guests_count integer DEFAULT 1,
  price_per_night numeric NOT NULL,
  total_price numeric NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('tentative', 'confirmed', 'cancelled', 'checked_in', 'checked_out')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid')),
  amount_paid numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can manage reservations" ON reservations
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );
