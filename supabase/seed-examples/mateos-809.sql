-- BaW OS — Seed Mateos 809P (corte 26-abr-2026)
-- Idempotente: usa funciones helper que UPDATE si existe, INSERT si no.
-- No depende de UNIQUE constraints específicos.
-- Datos vivos del Notion "BaW Mateos 809P — Estado Operativo Vivo".
-- Org Mateos: ed4308c7-2bdb-46f2-be69-7c59674838e2 (preexistente).

-- ============================================================
-- HELPER FUNCTIONS (idempotentes, scope: este seed)
-- ============================================================

CREATE OR REPLACE FUNCTION pg_temp.seed_unit(
  p_org_id uuid, p_number text, p_type text, p_floor int, p_status text, p_notes text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM units WHERE org_id = p_org_id AND number = p_number LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO units (org_id, number, type, floor, status, notes)
    VALUES (p_org_id, p_number, p_type, p_floor, p_status, p_notes)
    RETURNING id INTO v_id;
  ELSE
    UPDATE units
    SET type = p_type, floor = p_floor, status = p_status, notes = p_notes
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.seed_occupant(
  p_org_id uuid, p_name text, p_phone text, p_type text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM occupants WHERE org_id = p_org_id AND name = p_name LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO occupants (org_id, name, phone, type)
    VALUES (p_org_id, p_name, p_phone, p_type)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.seed_contract(
  p_org_id uuid, p_unit_id uuid, p_occ_id uuid,
  p_amount numeric, p_payment_day int, p_start date, p_end date, p_status text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM contracts
   WHERE unit_id = p_unit_id AND occupant_id = p_occ_id
   ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO contracts (org_id, unit_id, occupant_id, monthly_amount, payment_day, start_date, end_date, status)
    VALUES (p_org_id, p_unit_id, p_occ_id, p_amount, p_payment_day, p_start, p_end, p_status)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.seed_payment(
  p_org_id uuid, p_contract_id uuid,
  p_amount numeric, p_rent numeric, p_water numeric,
  p_due date, p_status text, p_paid date
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
  IF p_contract_id IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM payments
   WHERE contract_id = p_contract_id
     AND due_date >= date_trunc('month', p_due)::date
     AND due_date < (date_trunc('month', p_due) + interval '1 month')::date
   LIMIT 1;
  IF v_id IS NULL THEN
    IF p_paid IS NOT NULL THEN
      INSERT INTO payments (org_id, contract_id, amount, rent_amount, water_fee, due_date, status, paid_date)
      VALUES (p_org_id, p_contract_id, p_amount, p_rent, p_water, p_due, p_status, p_paid)
      RETURNING id INTO v_id;
    ELSE
      INSERT INTO payments (org_id, contract_id, amount, rent_amount, water_fee, due_date, status)
      VALUES (p_org_id, p_contract_id, p_amount, p_rent, p_water, p_due, p_status)
      RETURNING id INTO v_id;
    END IF;
  END IF;
  RETURN v_id;
END $fn$;

-- ============================================================
-- SEED PRINCIPAL
-- ============================================================

DO $$
DECLARE
  v_org uuid := 'ed4308c7-2bdb-46f2-be69-7c59674838e2';
  u_d102 uuid; u_d202 uuid; u_d203 uuid; u_d204 uuid;
  u_d301 uuid; u_d302 uuid; u_d401 uuid; u_d402 uuid; u_d404 uuid;
  o_erik uuid; o_pat uuid; o_let uuid; o_jose uuid; o_humb uuid;
  o_jorge uuid; o_arturo uuid; o_martin uuid; o_d202 uuid;
  c_d102 uuid; c_d203 uuid; c_d204 uuid; c_d301 uuid; c_d302 uuid;
  c_d401 uuid; c_d402 uuid; c_d404 uuid; c_d202 uuid;
BEGIN
  -- 1. UNIDADES (16)
  PERFORM pg_temp.seed_unit(v_org, 'D101', 'STR', 1, 'available', 'Tipo 01 Básico 102m². Drenaje recurrente. Mantenimiento pendiente.');
  u_d102 := pg_temp.seed_unit(v_org, 'D102', 'LTR', 1, 'occupied',  'Tipo 02 Confort 122m². Erik Mauricio Núñez Rivera.');
  PERFORM pg_temp.seed_unit(v_org, 'D103', 'STR', 1, 'available', 'Tipo 03 Clásico 131m². Requiere remodelación profunda.');
  PERFORM pg_temp.seed_unit(v_org, 'D104', 'STR', 1, 'available', 'Tipo 04 Superior 149m². Baño y cocina urgentes.');
  PERFORM pg_temp.seed_unit(v_org, 'D201', 'MTR', 2, 'available', 'Tipo 01 Básico. Acuerdo Natturaly $2,000/persona, mín verbal $6,000. Pendiente confirmar.');
  u_d202 := pg_temp.seed_unit(v_org, 'D202', 'MTR', 2, 'occupied',  'Tipo 02 Confort. 1 mujer hoy, pagó $2,000 abril. Mover a D303 en mayo, liberar D202.');
  u_d203 := pg_temp.seed_unit(v_org, 'D203', 'LTR', 2, 'occupied',  'Tipo 03 Clásico. Patricia Hernández. Contrato vencido — renovación pendiente.');
  u_d204 := pg_temp.seed_unit(v_org, 'D204', 'LTR', 2, 'occupied',  'Tipo 04 Superior. Leticia (Felipe Gómez paga). Contrato vencido.');
  u_d301 := pg_temp.seed_unit(v_org, 'D301', 'LTR', 3, 'occupied',  'Tipo 01 Básico. José Luis Bautista (Misioneros SUD). Boiler dañado, medidor CFE pendiente.');
  u_d302 := pg_temp.seed_unit(v_org, 'D302', 'LTR', 3, 'occupied',  'Tipo 02 Confort. Humberto Ortiz. MOROSO ~$32K. Decisión legal/cobranza requerida.');
  PERFORM pg_temp.seed_unit(v_org, 'D303', 'MTR', 3, 'reserved',  'Tipo 03 Clásico. Reservada para renta variable mayo (recibirá ocupante actual de D202).');
  PERFORM pg_temp.seed_unit(v_org, 'D304', 'STR', 3, 'available', 'Tipo 04 Superior. Vacante.');
  u_d401 := pg_temp.seed_unit(v_org, 'D401', 'LTR', 4, 'occupied',  'Tipo 01 Básico. Jorge Alberto Álvarez. Contrato vencido ago-2024.');
  u_d402 := pg_temp.seed_unit(v_org, 'D402', 'LTR', 4, 'occupied',  'Tipo 02 Confort. Arturo Osornio. MOROSO ~$80K. CASO CRÍTICO.');
  PERFORM pg_temp.seed_unit(v_org, 'D403', 'STR', 4, 'available', 'Tipo 03 Clásico. VACANTE — Daniel Mercado no cerró.');
  u_d404 := pg_temp.seed_unit(v_org, 'D404', 'LTR', 4, 'occupied',  'Tipo 04 Superior. Martín Briones (colaborador mantenimiento). Contrato vencido ene-2025.');

  -- 2. OCCUPANTS
  o_erik   := pg_temp.seed_occupant(v_org, 'Erik Mauricio Núñez Rivera',         NULL, 'ltr');
  o_pat    := pg_temp.seed_occupant(v_org, 'Patricia Hernández',                  NULL, 'ltr');
  o_let    := pg_temp.seed_occupant(v_org, 'Leticia (Felipe Gómez paga)',         NULL, 'ltr');
  o_jose   := pg_temp.seed_occupant(v_org, 'José Luis Bautista (Misioneros SUD)', NULL, 'ltr');
  o_humb   := pg_temp.seed_occupant(v_org, 'Humberto Ortiz',                      NULL, 'ltr');
  o_jorge  := pg_temp.seed_occupant(v_org, 'Jorge Alberto Álvarez',               NULL, 'ltr');
  o_arturo := pg_temp.seed_occupant(v_org, 'Arturo Osornio',                      NULL, 'ltr');
  o_martin := pg_temp.seed_occupant(v_org, 'Martín Briones',                      NULL, 'ltr');
  o_d202   := pg_temp.seed_occupant(v_org, 'Ocupante D202 (renta variable abr-2026)', NULL, 'both');

  -- 3. CONTRACTS
  c_d102 := pg_temp.seed_contract(v_org, u_d102, o_erik,   8250, 1, '2025-09-01', NULL,         'active');
  c_d203 := pg_temp.seed_contract(v_org, u_d203, o_pat,    5050, 1, '2024-01-01', '2025-12-31', 'en_renovacion');
  c_d204 := pg_temp.seed_contract(v_org, u_d204, o_let,    5050, 1, '2024-01-01', '2025-12-31', 'en_renovacion');
  c_d301 := pg_temp.seed_contract(v_org, u_d301, o_jose,   7450, 1, '2025-06-01', NULL,         'active');
  c_d302 := pg_temp.seed_contract(v_org, u_d302, o_humb,   4750, 1, '2024-03-01', NULL,         'active');
  c_d401 := pg_temp.seed_contract(v_org, u_d401, o_jorge,  4750, 1, '2023-08-01', '2024-08-31', 'en_renovacion');
  c_d402 := pg_temp.seed_contract(v_org, u_d402, o_arturo, 3800, 1, '2023-01-01', NULL,         'active');
  c_d404 := pg_temp.seed_contract(v_org, u_d404, o_martin, 5550, 1, '2024-01-01', '2025-01-31', 'en_renovacion');
  c_d202 := pg_temp.seed_contract(v_org, u_d202, o_d202,   2000, 1, '2026-04-01', '2026-04-30', 'active');

  -- 4. PAYMENTS — estados puntuales abril 2026
  -- D202 — pagó $2,000 abril
  PERFORM pg_temp.seed_payment(v_org, c_d202, 2000, 2000, 0,   '2026-04-01', 'paid', '2026-04-15');
  -- D302 — Humberto Ortiz — late (parte de mora ~$32K)
  PERFORM pg_temp.seed_payment(v_org, c_d302, 5000, 4750, 250, '2026-04-01', 'late', NULL);
  -- D402 — Arturo Osornio — late (parte de mora ~$80K)
  PERFORM pg_temp.seed_payment(v_org, c_d402, 4050, 3800, 250, '2026-04-01', 'late', NULL);

END $$;

-- Comentarios operativos (no se almacenan, solo para reviewers):
-- - Ingreso nominal estimado: ~$46,650/mes incluyendo morosos (D102 8250 + D203/D204 5050x2 + D301 7450 + D302 4750 + D401 4750 + D402 3800 + D404 5550 + D202 2000).
-- - Conservador: ~$38,100/mes excluyendo D302 y D402.
-- - D403 vacante (Daniel Mercado no cerró).
-- - D303 reservada para renta variable mayo (recibirá ocupante de D202).
-- - Locales y bodegas rooftop NO modeladas en `units` — pendiente de Sprint 3.
