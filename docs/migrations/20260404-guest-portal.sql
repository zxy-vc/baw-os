-- Migration: campos para Guest Portal STR en reservations
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS guest_token UUID DEFAULT uuid_generate_v4() UNIQUE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS wifi_name TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS wifi_password TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS access_code TEXT;       -- código de acceso / pin
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS arrival_instructions TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS checkin_time TEXT DEFAULT '15:00';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS checkout_time TEXT DEFAULT '12:00';
