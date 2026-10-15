-- BaW OS — Guest Portal columns for reservations table

-- Add guest portal fields to existing reservations table
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS guest_token UUID DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN IF NOT EXISTS platform TEXT,  -- airbnb | booking | direct
  ADD COLUMN IF NOT EXISTS platform_reservation_id TEXT,
  ADD COLUMN IF NOT EXISTS check_in_code TEXT,
  ADD COLUMN IF NOT EXISTS wifi_name TEXT,
  ADD COLUMN IF NOT EXISTS wifi_password TEXT,
  ADD COLUMN IF NOT EXISTS house_rules TEXT,
  ADD COLUMN IF NOT EXISTS check_in_instructions TEXT;

-- Open read policy for guest portal (token-based access, no auth)
CREATE POLICY "Guest portal read by token" ON reservations
  FOR SELECT USING (guest_token IS NOT NULL);

-- Seed: test reservation for QA
INSERT INTO reservations (
  unit_id, organization_id, guest_name, guest_email, guest_phone,
  check_in, check_out, mode, guests_count, price_per_night, total_price,
  platform, status, check_in_code, wifi_name, wifi_password,
  house_rules, check_in_instructions
) VALUES (
  (SELECT id FROM units WHERE number = '101' LIMIT 1),
  'ed4308c7-2bdb-46f2-be69-7c59674838e2',
  'Ana García', 'ana@ejemplo.com', '+52 477 123 4567',
  CURRENT_DATE + 1, CURRENT_DATE + 4,
  'full', 2, 2400.00, 9600.00,
  'airbnb', 'confirmed',
  '2847', 'BaW_ALM809P', 'baw2024secure',
  E'• No fumar dentro del depto\n• No mascotas\n• Silencio después de las 11 PM\n• Máximo 2 huéspedes',
  E'1. El código de acceso es 2847\n2. El depto está en el piso 1, puerta 101\n3. El conserje Enrique está disponible en recepción\n4. Checkout antes de las 12 PM'
);
