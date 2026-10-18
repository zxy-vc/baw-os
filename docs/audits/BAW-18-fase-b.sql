-- =============================================================================
-- BAW-18 · Fase B1 · Punto de corte del 809 (limpieza sin inventar datos de contrato)
-- =============================================================================
-- Proyecto: zlcgxmllaeweypyodvzk (prod). LO CORRE FRAN, A MANO, EN EL SQL EDITOR.
-- Org: DuVa ReEs 81a011c4-4ea6-4b79-924d-73dbe6d35e14.
--
-- Qué hace: «punto de corte», no reconstrucción. BaW OS empieza a cobrar a partir
-- de v_fecha_corte. Lo anterior se anula (void, nunca DELETE) y no se proyecta.
--   1. Contratos que siguen: billing_start_date = v_fecha_corte. Las filas de renta
--      'pending' con due_date < corte pasan a 'void'.
--   2. D102 y D202: contrato terminado (fin 2026-10-11 y 2026-09-30); unidad
--      available. El cargo pendiente de oct de D102 se queda (deuda real) salvo
--      v_anular_octubre_d102. El de oct de D202 se anula (vence después de su fin).
--   3. D303: unidad available.
--   4. D301: el contrato viejo (José Luis) se cierra; se crea el nuevo (Rodrigo
--      Jiménez Ontiveros, 2026-07-01 → 2026-12-31, día 5). Sus cargos jul–oct
--      pagados se registran solo si v_registrar_pagos_d301.
--   5. D203, D204 y D302: monthly_amount = renta real y facturación desde el corte.
--      Los cargos pendientes desde el corte se ajustan a la renta nueva. Su estatus
--      y end_date NO se tocan: se renuevan en la Fase B2 con el expediente digital.
--   6. Saldos iniciales: NO hay forma limpia en el esquema actual; ver
--      v_cargar_saldos_iniciales (si es true, el script se detiene).
--   Fuera de B1 (Fase B2, sin SQL; ver docs/audits/BAW-18-fase-b.md): crear D401,
--   D402 y D404 y renovar D203, D204 y D302 con los contratos digitalizados.
--
-- Requisito: la migración supabase/migrations/20261015010000_baw18_payments_void.sql
-- aplicada ANTES (agrega 'void' al ENUM payment_status). Sin ella: «DETENTE: …».
-- Usa payment_receipts, payment_ledger e invoices (Q0.a confirma que existen en prod).
--
-- Mismo mecanismo que BAW-3 (un solo bloque DO):
--   · Dry-run = el bloque SIEMPRE termina en excepción con el resumen en el mensaje;
--     Postgres deshace todo solo. El error rojo ES el resultado del dry-run.
--   · Aplicar = v_aplicar := true + copiar la «huella» del dry-run. La huella
--     resume TODO el plan (cargos a anular y a ajustar, contratos, unidades); si
--     algo cambió entre el dry-run y la aplicación, no coincide y no aplica nada.
--   · Bitácora: cada fila tocada queda en audit_log (before_data/after_data) con
--     metadata.run_id = id del lote. La reversa (BAW-18-fase-b-reversa.sql) deshace
--     solo ese lote.
--
-- Pasos exactos para Fran (SQL Editor, proyecto zlcgxmllaeweypyodvzk):
--   (Antes que nada: #164 BAW-3 mergeado y su SQL de registro aplicado; luego este PR.)
--   0. Aplicar la migración 20261015010000 (copiar el archivo y Run). Una vez.
--   0b. Registrarla en supabase_migrations.schema_migrations (INSERT ON CONFLICT DO
--       NOTHING + SELECT de verificación): ver paso 1b en docs/audits/BAW-18-fase-b.md.
--   1. DRY-RUN: copiar ESTE archivo COMPLETO tal cual y Run. Debe salir en ROJO:
--        DRY-RUN OK (nada se guardó) · huella=xxxxxxxxxxxx · lote=… · contratos_cerrados=3 · … · veredicto=OK
--      Si empieza con «DETENTE:», no seguir y pegar el mensaje en el PR.
--   2. APLICAR: editar SOLO estas 2 líneas y Run con el archivo completo:
--        v_aplicar := true;   v_esperado_huella := 'xxxxxxxxxxxx';  (la del paso 1)
--      Debe salir una tabla de UNA fila con veredicto = OK y el run_id del lote.
--   3. No volver a correrlo: una segunda corrida da «DETENTE: … ya se aplicó».
--   (psql: `psql -v ON_ERROR_STOP=1 -f …`.)
-- =============================================================================

DO $baw18b$
DECLARE
  -- ═════════════════════ PARÁMETROS (lo único que se edita) ═════════════════════
  v_aplicar          boolean := false;  -- ← DRY-RUN. true SOLO en el paso 2.
  v_esperado_huella  text    := NULL;   -- ← paso 2: copiar «huella=…» del dry-run

  v_org          uuid := '81a011c4-4ea6-4b79-924d-73dbe6d35e14';
  v_fecha_corte  date := '2026-10-01';         -- BaW OS cobra desde aquí (confirmada por Fran)
  v_hoy          date := (now() AT TIME ZONE 'America/Mexico_City')::date;  -- para estimar la morosidad
  v_actor        text := 'fran@zxy.vc';        -- audit_log.actor_id

  -- Etiquetas de ENUM (verificar con Q0.b; el script se detiene si no existen)
  v_st_anulado     text := 'void';           -- payment_status
  v_st_activo      text := 'active';         -- contract_status del contrato nuevo de D301
  v_st_terminado   text := 'terminated';     -- contract_status (D102, D202)
  v_st_d301_viejo  text := 'expired';        -- contract_status del contrato viejo de D301 ('renewed' también vale)
  v_estatus_anulables text[] := ARRAY['pending'];  -- estatus de cargo que se anulan/ajustan

  -- D102 / D202
  v_fin_d102              date    := '2026-10-11';
  v_fin_d202              date    := '2026-09-30';
  v_anular_octubre_d102   boolean := false;  -- true = anular también el cargo de oct de D102

  -- D301 (contrato nuevo)
  v_d301_fin_viejo        date    := '2024-12-06';
  v_d301_inicio           date    := '2026-07-01';
  v_d301_fin              date    := '2026-12-31';
  v_d301_renta            numeric := 8000;   -- sin agua
  v_d301_dia              integer := 5;
  v_d301_titular          text    := 'Rodrigo Jiménez Ontiveros';
  v_d301_cotitular        text    := 'D. Jacobsen';
  v_d301_aval             text    := 'José Luis Bautista Cano';
  v_d301_firmado          date    := '2026-07-11';
  v_registrar_pagos_d301  boolean := false;  -- true = crear cargos jul–oct como pagados
  v_d301_pago_agua        numeric := 250;    -- cargo pagado = renta + este agua (8250)

  -- Renta real = lo que paga el inquilino al mes. Si «incluye agua», monthly_amount
  -- = total − agua del edificio (Mission Control y el cron SUMAN el agua aparte:
  -- src/app/page.tsx:188 + src/lib/billing.ts:91, src/app/api/cron/payments/route.ts:100-106).
  v_d203_total numeric := 5000;  v_d203_incluye_agua boolean := true;   -- «5000 (incluye agua)»
  v_d204_total numeric := 5300;  v_d204_incluye_agua boolean := false;  -- POR CONFIRMAR (la tabla no dice)
  v_d302_total numeric := 4500;  v_d302_incluye_agua boolean := false;  -- «4500 + 250»
  v_ajustar_cargos_post_corte boolean := true;  -- ajustar cargos pendientes ≥ corte a la renta nueva

  -- Saldos históricos: se definen después con el expediente (BAW-24). Ver doc §4.
  v_cargar_saldos_iniciales boolean := false;
  v_saldo_d302 numeric := 32256;  v_saldo_d402 numeric := 80000;
  v_saldo_d102 numeric := 26000;  v_saldo_d202 numeric := 26000;  v_saldo_d301 numeric := 7450;
  -- ══════════════════════════════════════════════════════════════════════════════

  -- Contratos esperados (Q3, 15-oct-2026)
  c_d102 CONSTANT uuid := '66a5f33c-9982-473f-af4a-d36eee149992';
  c_d202 CONSTANT uuid := '40249f8e-58ad-4cc7-86da-aee5e0d469cd';
  c_d203 CONSTANT uuid := 'a540a9e6-3e83-46a8-b431-40905ecb2c06';
  c_d204 CONSTANT uuid := '15f5d66e-61bf-4310-8534-d844356276df';
  c_d301 CONSTANT uuid := 'c38fdd8f-7041-4661-8da0-f702cfd9bc25';
  c_d302 CONSTANT uuid := 'e145c3b2-e1a9-4821-ba54-5e5c2781b06a';
  c_ids    CONSTANT uuid[] := ARRAY[c_d102, c_d202, c_d203, c_d204, c_d301, c_d302];
  c_unidad CONSTANT text[] := ARRAY['D102','D202','D203','D204','D301','D302'];
  c_unidades_tocadas CONSTANT text[] := ARRAY['D102','D202','D203','D204','D301','D302','D303'];

  -- Agua vigente: misma regla que el cron y Mission Control (src/lib/cobros.ts:56-76,
  -- fallback 250). $1 = org, $2 = edificio, $3 = mes (date).
  c_sql_agua CONSTANT text := $ag$
    SELECT COALESCE((SELECT sr.amount FROM public.service_rates sr
                      WHERE sr.org_id = $1 AND sr.service = 'agua'
                        AND to_char(sr.effective_from::date, 'YYYY-MM') <= to_char($3::date, 'YYYY-MM')
                        AND (sr.building_id = $2 OR sr.building_id IS NULL)
                      ORDER BY (sr.building_id IS NOT DISTINCT FROM $2) DESC, sr.effective_from DESC
                      LIMIT 1), 250)
  $ag$;

  -- MC: réplica de Q4 (src/app/page.tsx:119-199 + src/lib/billing.ts) con el
  -- tratamiento de 'void' de este PR. $1 = org, $2 = hoy.
  c_sql_mc CONSTANT text := $mc$
    WITH c AS (
      SELECT c.id AS contract_id, COALESCE(c.monthly_amount, 0) AS monthly_amount, c.payment_day,
             c.start_date, c.billing_start_date, u.number AS unit_number, u.building_id
      FROM public.contracts c LEFT JOIN public.units u ON u.id = c.unit_id
      WHERE c.org_id = $1 AND c.status::text IN ('active', 'en_renovacion')
    ),
    m AS (
      SELECT c.*, gs::date AS month_start
      FROM c CROSS JOIN LATERAL generate_series(
        GREATEST(date_trunc('month', COALESCE(c.billing_start_date, c.start_date, $2::date)),
                 date_trunc('month', $2::date) - interval '23 months'),
        date_trunc('month', $2::date), interval '1 month') AS gs
    ),
    pay AS (
      SELECT DISTINCT ON (py.contract_id, date_trunc('month', py.due_date))
             py.contract_id, date_trunc('month', py.due_date)::date AS month_start, py.id AS payment_id,
             py.status::text AS payment_status, py.amount AS payment_amount, py.amount_paid, py.late_fee_amount
      FROM public.payments py
      WHERE py.contract_id IN (SELECT contract_id FROM c)
      ORDER BY py.contract_id, date_trunc('month', py.due_date),
               CASE py.status::text WHEN 'paid' THEN 3 WHEN 'partial' THEN 2 WHEN 'void' THEN 0 ELSE 1 END DESC,
               py.created_at
    ),
    x AS (
      SELECT m.*, pay.payment_id, pay.payment_status, pay.payment_amount, pay.amount_paid, pay.late_fee_amount,
             (m.month_start + (COALESCE(NULLIF(m.payment_day, 0), 1) - 1))::date AS due_date,
             COALESCE((SELECT sr.amount FROM public.service_rates sr
                       WHERE sr.org_id = $1 AND sr.service = 'agua'
                         AND to_char(sr.effective_from::date, 'YYYY-MM') <= to_char(m.month_start, 'YYYY-MM')
                         AND (sr.building_id = m.building_id OR sr.building_id IS NULL)
                       ORDER BY (sr.building_id IS NOT DISTINCT FROM m.building_id) DESC, sr.effective_from DESC
                       LIMIT 1), 250) AS water_fee
      FROM m LEFT JOIN pay ON pay.contract_id = m.contract_id AND pay.month_start = m.month_start
    ),
    s AS (
      SELECT x.*, COALESCE(x.payment_amount, x.monthly_amount + x.water_fee) AS base,
             COALESCE(x.late_fee_amount, 0) AS fee, COALESCE(x.amount_paid, 0) AS paid
      FROM x
    ),
    v AS (
      SELECT s.*,
             CASE
               WHEN s.payment_status = 'void' THEN 'anulado'
               WHEN s.payment_status IN ('paid', 'partial') THEN
                 CASE WHEN GREATEST(0, s.base + s.fee - s.paid) > 0.001 THEN 'parcial' ELSE 'pagado' END
               WHEN COALESCE(s.payment_day, 0) = 0 THEN 'verbal'
               WHEN $2::date < s.due_date THEN 'pendiente'
               WHEN s.fee > 0 THEN 'mora'
               ELSE 'vencido'
             END AS st
      FROM s
    ),
    o AS (
      SELECT v.*, CASE v.st WHEN 'parcial' THEN GREATEST(0, v.base + v.fee - v.paid)
                            WHEN 'mora' THEN v.base + v.fee ELSE v.base END AS owed
      FROM v WHERE v.st IN ('mora', 'vencido', 'parcial')
    )
    SELECT count(*)::int, COALESCE(sum(owed), 0), (count(*) FILTER (WHERE payment_id IS NULL))::int,
           COALESCE(string_agg(COALESCE(unit_number, '?') || ' ' || to_char(month_start, 'YYYY-MM') || ' $' || round(owed, 2),
                               ', ' ORDER BY unit_number, month_start), '—')
    FROM o
  $mc$;

  -- Estado
  v_run uuid := gen_random_uuid();
  v_tag text;
  v_n bigint;
  v_msg text;
  v_tipo text;
  v_unit_id uuid;
  v_uid jsonb := '{}'::jsonb;       -- número de unidad → id
  v_building uuid;
  v_agua numeric;
  v_occ uuid;
  v_d301_nuevo uuid;
  v_before jsonb;
  v_after jsonb;
  v_huella text;
  r record;
  i integer;
  v_mes date;

  -- Contadores para el resumen
  v_mc_antes_n integer;  v_mc_antes_total numeric;  v_mc_antes_sinfila integer;  v_mc_antes_det text;
  v_mc_desp_n  integer;  v_mc_desp_total  numeric;  v_mc_desp_sinfila  integer;  v_mc_desp_det  text;
  v_contratos_cerrados integer := 0;
  v_contratos_actualizados integer := 0;
  v_contratos_creados integer := 0;
  v_ocupantes_creados integer := 0;
  v_ocupantes_reusados integer := 0;
  v_unidades_cambiadas integer := 0;
  v_anuladas integer := 0;
  v_monto_anulado numeric := 0;
  v_cargos_ajustados integer := 0;
  v_cargos_ajuste_delta numeric := 0;
  v_pagos_d301 integer := 0;
  v_accesorios_sin_tocar integer := 0;
  v_deuda_fuera_mc numeric := 0;
  v_deuda_fuera_mc_det text;
  v_montos text := '';
  v_veredicto text;
  v_resumen text;
BEGIN
  v_tag := 'BAW-18 corte ' || v_fecha_corte || ' (lote ' || left(v_run::text, 8) || ')';

  -- ═══════════════════════════════ GUARDAS ═══════════════════════════════════
  IF v_cargar_saldos_iniciales THEN
    RAISE EXCEPTION 'DETENTE: v_cargar_saldos_iniciales=true, pero el esquema no tiene una forma limpia de registrar un saldo inicial (un cargo con due_date antes del corte queda fuera de Mission Control y cobranza le cobraría mora). Ver «Saldos iniciales» en docs/audits/BAW-18-fase-b.md §4. Nada se guardó.';
  END IF;

  SELECT count(*) INTO v_n FROM public.organizations;
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RAISE EXCEPTION 'DETENTE: se esperaba UNA sola org (%) y hay % orgs. Nada se guardó.', v_org, v_n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.audit_log a
              WHERE a.action = 'baw18.fase_b.lote' AND a.org_id = v_org
                AND NOT EXISTS (SELECT 1 FROM public.audit_log rv
                                 WHERE rv.action = 'baw18.fase_b.reversa'
                                   AND rv.metadata->>'run_id' = a.metadata->>'run_id')) THEN
    RAISE EXCEPTION 'DETENTE: la Fase B ya se aplicó (hay un lote baw18.fase_b.lote sin reversa en audit_log). Nada se guardó.';
  END IF;

  -- Etiquetas de ENUM: la columna debe aceptar el valor (ENUM: debe existir la etiqueta).
  FOR r IN SELECT * FROM (VALUES
      ('payments', 'status', v_st_anulado), ('payments', 'status', 'paid'), ('payments', 'status', 'pending'),
      ('contracts', 'status', v_st_activo), ('contracts', 'status', v_st_terminado),
      ('contracts', 'status', v_st_d301_viejo),
      ('units', 'status', 'available'), ('units', 'status', 'occupied')) AS t(tabla, columna, valor)
  LOOP
    SELECT CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name END INTO v_tipo
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = r.tabla AND c.column_name = r.columna;
    IF v_tipo IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
          WHERE t.typname = v_tipo AND e.enumlabel = r.valor) THEN
      RAISE EXCEPTION 'DETENTE: el ENUM % (%.%) no tiene la etiqueta «%».% Nada se guardó.',
        v_tipo, r.tabla, r.columna, r.valor,
        CASE WHEN r.valor = v_st_anulado THEN ' Aplica antes la migración 20261015010000_baw18_payments_void.sql.'
             ELSE ' Corrige el parámetro con una etiqueta de Q0.b.' END;
    END IF;
  END LOOP;

  -- Unidades: cada número existe exactamente una vez en la org (no archivada).
  FOREACH v_msg IN ARRAY c_unidades_tocadas LOOP
    SELECT count(*), min(id::text)::uuid INTO v_n, v_unit_id
      FROM public.units WHERE org_id = v_org AND number = v_msg AND archived_at IS NULL;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'DETENTE: la unidad % aparece % veces en la org (se esperaba 1). Nada se guardó.', v_msg, v_n;
    END IF;
    v_uid := v_uid || jsonb_build_object(v_msg, v_unit_id);
  END LOOP;

  -- Bloqueo de todo lo que se va a leer y tocar, hasta el fin de la transacción.
  -- Con las FKs hacia payments (abonos, bitácora, CFDI), nadie puede colgarles
  -- dinero nuevo a estos cargos mientras corre el script.
  PERFORM 1 FROM public.contracts WHERE id = ANY (c_ids) OR unit_id = (v_uid->>'D301')::uuid FOR UPDATE;
  PERFORM 1 FROM public.payments  WHERE contract_id = ANY (c_ids) FOR UPDATE;
  PERFORM 1 FROM public.units     WHERE org_id = v_org AND number = ANY (c_unidades_tocadas) FOR UPDATE;

  -- Los 6 contratos esperados existen, son de la org, de su unidad y siguen 'active'.
  FOR i IN 1 .. cardinality(c_ids) LOOP
    SELECT to_jsonb(c) INTO v_before FROM public.contracts c WHERE c.id = c_ids[i];
    IF v_before IS NULL THEN
      RAISE EXCEPTION 'DETENTE: no existe el contrato % de %. Nada se guardó.', c_ids[i], c_unidad[i];
    END IF;
    IF (v_before->>'org_id')::uuid IS DISTINCT FROM v_org
       OR (v_before->>'unit_id')::uuid IS DISTINCT FROM (v_uid->>c_unidad[i])::uuid THEN
      RAISE EXCEPTION 'DETENTE: el contrato % no es de la org o no está en %. Nada se guardó.', c_ids[i], c_unidad[i];
    END IF;
    IF v_before->>'status' IS DISTINCT FROM 'active' OR v_before->>'archived_at' IS NOT NULL THEN
      RAISE EXCEPTION 'DETENTE: el contrato % de % está «%»%; se esperaba active (¿ya aplicado?). Nada se guardó.',
        c_ids[i], c_unidad[i], v_before->>'status',
        CASE WHEN v_before->>'archived_at' IS NOT NULL THEN ' y archivado' ELSE '' END;
    END IF;
  END LOOP;

  -- D301: no debe existir ya otro contrato vigente además del viejo (evita duplicar el nuevo).
  SELECT string_agg(u.number || ':' || c.status::text, ', ') INTO v_msg
    FROM public.contracts c JOIN public.units u ON u.id = c.unit_id
   WHERE c.org_id = v_org AND c.archived_at IS NULL
     AND u.number = 'D301' AND c.id <> c_d301
     AND c.status::text IN ('active', 'en_renovacion', 'pending', v_st_activo);
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'DETENTE: ya hay contrato vigente en %. Nada se guardó.', v_msg;
  END IF;

  -- Morosidad de Mission Control ANTES (con v_hoy).
  EXECUTE c_sql_mc INTO v_mc_antes_n, v_mc_antes_total, v_mc_antes_sinfila, v_mc_antes_det USING v_org, v_hoy;

  -- ════════════════════════ PLAN (todavía sin escribir) ════════════════════════
  -- Guarda de dinero única: un cargo «limpio» no tiene dinero ni rastro de cobro.
  CREATE TEMP TABLE _b18_sucio ON COMMIT DROP AS
  SELECT py.id AS payment_id
    FROM public.payments py
   WHERE py.contract_id = ANY (c_ids)
     AND (COALESCE(py.amount_paid, 0) <> 0
          OR py.confirmed_at IS NOT NULL
          OR COALESCE(py.reference, '') LIKE 'pi\_%'
          OR EXISTS (SELECT 1 FROM public.payment_receipts x WHERE x.payment_id = py.id)
          OR EXISTS (SELECT 1 FROM public.payment_ledger l WHERE l.payment_id = py.id)
          OR EXISTS (SELECT 1 FROM public.invoices f WHERE f.payment_id = py.id AND COALESCE(f.status, '') <> 'cancelled'));

  -- (a) Cargos a anular.
  CREATE TEMP TABLE _b18_anular (
    payment_id uuid PRIMARY KEY, contract_id uuid, unidad text, regla text, amount numeric, due_date date
  ) ON COMMIT DROP;
  -- A) Renta pendiente antes del corte, en los 6 contratos.
  INSERT INTO _b18_anular
  SELECT py.id, py.contract_id, c_unidad[array_position(c_ids, py.contract_id)], 'A_antes_del_corte', py.amount, py.due_date
    FROM public.payments py
   WHERE py.contract_id = ANY (c_ids) AND py.ancillary_charge_id IS NULL
     AND py.status::text = ANY (v_estatus_anulables) AND py.due_date < v_fecha_corte;
  -- B) Renta pendiente de contratos que se cierran, con vencimiento después de su nuevo fin.
  INSERT INTO _b18_anular
  SELECT py.id, py.contract_id, c_unidad[array_position(c_ids, py.contract_id)], 'B_despues_del_fin', py.amount, py.due_date
    FROM public.payments py
   WHERE py.ancillary_charge_id IS NULL AND py.status::text = ANY (v_estatus_anulables)
     AND ((py.contract_id = c_d102 AND py.due_date > v_fin_d102)
       OR (py.contract_id = c_d202 AND py.due_date > v_fin_d202)
       OR (py.contract_id = c_d301 AND py.due_date > v_d301_fin_viejo))
  ON CONFLICT (payment_id) DO NOTHING;
  -- C) Opcional: el cargo de octubre de D102 (por defecto se queda como deuda real).
  IF v_anular_octubre_d102 THEN
    INSERT INTO _b18_anular
    SELECT py.id, py.contract_id, 'D102', 'C_octubre_d102', py.amount, py.due_date
      FROM public.payments py
     WHERE py.contract_id = c_d102 AND py.ancillary_charge_id IS NULL
       AND py.status::text = ANY (v_estatus_anulables)
       AND py.due_date >= v_fecha_corte AND py.due_date <= v_fin_d102
    ON CONFLICT (payment_id) DO NOTHING;
  END IF;

  SELECT count(*) INTO v_n FROM _b18_anular a JOIN _b18_sucio s ON s.payment_id = a.payment_id;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'DETENTE: % cargo(s) a anular tienen dinero, confirmación, abonos, bitácora, CFDI o intent de Stripe. Revísalos con Q10. Nada se guardó.', v_n;
  END IF;

  -- Antes del corte no debe quedar renta impaga con otro estatus (late, partial…).
  SELECT string_agg(DISTINCT py.status::text, ','), count(*) INTO v_msg, v_n
    FROM public.payments py
   WHERE py.contract_id = ANY (c_ids) AND py.ancillary_charge_id IS NULL
     AND py.due_date < v_fecha_corte
     AND py.status::text NOT IN ('paid', v_st_anulado)
     AND NOT (py.status::text = ANY (v_estatus_anulables));
  IF v_n > 0 THEN
    RAISE EXCEPTION 'DETENTE: hay % cargo(s) de renta antes del corte con estatus «%» que el script no anula. Agrégalos a v_estatus_anulables solo si no tienen dinero (partial nunca). Nada se guardó.', v_n, v_msg;
  END IF;

  SELECT count(*) INTO v_accesorios_sin_tocar
    FROM public.payments py
   WHERE py.contract_id = ANY (c_ids) AND py.ancillary_charge_id IS NOT NULL
     AND py.status::text NOT IN ('paid', v_st_anulado) AND py.due_date < v_fecha_corte;

  SELECT count(*), COALESCE(sum(amount), 0) INTO v_anuladas, v_monto_anulado FROM _b18_anular;

  -- (b) Renta real de D203, D204 y D302 (monthly_amount = total − agua si «incluye agua»).
  CREATE TEMP TABLE _b18_rentas (
    contract_id uuid PRIMARY KEY, unidad text, building_id uuid, total numeric, incluye_agua boolean,
    agua_corte numeric, monto numeric
  ) ON COMMIT DROP;
  FOR r IN SELECT * FROM (VALUES
      (c_d203, 'D203', v_d203_total, v_d203_incluye_agua),
      (c_d204, 'D204', v_d204_total, v_d204_incluye_agua),
      (c_d302, 'D302', v_d302_total, v_d302_incluye_agua)
    ) AS t(cid, unidad, total, incluye_agua)
  LOOP
    SELECT u.building_id INTO v_building FROM public.units u WHERE u.id = (v_uid->>r.unidad)::uuid;
    EXECUTE c_sql_agua INTO v_agua USING v_org, v_building, v_fecha_corte;  -- agua del mes del corte
    INSERT INTO _b18_rentas VALUES (r.cid, r.unidad, v_building, r.total, r.incluye_agua, v_agua,
                                    r.total - CASE WHEN r.incluye_agua THEN v_agua ELSE 0 END);
  END LOOP;
  IF EXISTS (SELECT 1 FROM _b18_rentas WHERE monto <= 0) THEN
    RAISE EXCEPTION 'DETENTE: renta resultante ≤ 0 (revisa v_d2xx_total). Nada se guardó.';
  END IF;
  SELECT string_agg(format('%s=%s+agua%s', unidad, monto, agua_corte), ' ' ORDER BY unidad) INTO v_montos FROM _b18_rentas;

  -- (c) Cargos pendientes desde el corte a ajustar a la renta nueva. El agua de cada
  --     cargo es la vigente para SU mes (como el cron), así el total cuadra.
  CREATE TEMP TABLE _b18_ajustar (
    payment_id uuid PRIMARY KEY, contract_id uuid, unidad text, amount_antes numeric,
    agua numeric, rent_nuevo numeric, amount_nuevo numeric, due_date date
  ) ON COMMIT DROP;
  IF v_ajustar_cargos_post_corte THEN
    FOR r IN SELECT py.id, py.contract_id, py.amount, py.due_date, py.rent_amount, py.water_fee,
                    re.unidad, re.building_id, re.monto, re.total, re.incluye_agua
               FROM public.payments py JOIN _b18_rentas re ON re.contract_id = py.contract_id
              WHERE py.ancillary_charge_id IS NULL AND py.status::text = ANY (v_estatus_anulables)
                AND py.due_date >= v_fecha_corte
    LOOP
      EXECUTE c_sql_agua INTO v_agua USING v_org, r.building_id, r.due_date;
      CONTINUE WHEN r.rent_amount IS NOT DISTINCT FROM r.monto AND r.water_fee IS NOT DISTINCT FROM v_agua
                    AND r.amount IS NOT DISTINCT FROM r.monto + v_agua;
      INSERT INTO _b18_ajustar VALUES (r.id, r.contract_id, r.unidad, r.amount, v_agua, r.monto, r.monto + v_agua, r.due_date);
    END LOOP;
    SELECT count(*) INTO v_n FROM _b18_ajustar a JOIN _b18_sucio s ON s.payment_id = a.payment_id;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'DETENTE: % cargo(s) a ajustar tienen dinero, confirmación, abonos, bitácora, CFDI o intent de Stripe. Nada se guardó.', v_n;
    END IF;
    -- Con «incluye agua», el cargo del mes del corte debe quedar exactamente en el total pactado.
    SELECT count(*) INTO v_n
      FROM _b18_ajustar a JOIN _b18_rentas re ON re.contract_id = a.contract_id
     WHERE re.incluye_agua AND date_trunc('month', a.due_date) = date_trunc('month', v_fecha_corte)
       AND a.amount_nuevo <> re.total;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'DETENTE: % cargo(s) «incluye agua» no cuadran con el total pactado. Nada se guardó.', v_n;
    END IF;
  END IF;

  -- (d) D301: pagos jul–oct solo si no hay ya dinero o recibos de esos meses.
  IF v_registrar_pagos_d301 THEN
    SELECT count(*) INTO v_n
      FROM public.payments py JOIN public.contracts c ON c.id = py.contract_id
     WHERE c.org_id = v_org
       AND ((c.unit_id = (v_uid->>'D301')::uuid
             AND py.due_date >= date_trunc('month', v_d301_inicio)
             AND py.due_date < date_trunc('month', v_fecha_corte) + interval '1 month'
             AND (py.status::text IN ('paid', 'partial') OR COALESCE(py.amount_paid, 0) <> 0))
         OR COALESCE(py.reference, '') ILIKE 'BaW-D301-%'
         OR COALESCE(py.notes, '') ILIKE '%BaW-D301-%');
    IF v_n = 0 THEN
      SELECT count(*) INTO v_n FROM public.payment_receipts x
       WHERE x.org_id = v_org AND COALESCE(x.reference, '') ILIKE 'BaW-D301-%';
    END IF;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'DETENTE: ya hay % cargo(s)/recibo(s) de D301 jul–oct o con referencia BaW-D301-…; registrar los pagos los duplicaría. Nada se guardó.', v_n;
    END IF;
  END IF;

  -- Occupant del contrato nuevo de D301 (solo no archivados).
  SELECT count(*), min(o.id::text)::uuid INTO v_n, v_occ
    FROM public.occupants o
   WHERE o.org_id = v_org AND o.archived_at IS NULL AND lower(btrim(o.name)) = lower(btrim(v_d301_titular));
  IF v_n > 1 THEN
    RAISE EXCEPTION 'DETENTE: hay % occupants llamados «%» en la org; deja uno. Nada se guardó.', v_n, v_d301_titular;
  END IF;

  -- (e) Huella del plan completo: si algo cambia entre el dry-run y la aplicación, no coincide.
  -- Todos los parámetros que deciden qué y cuánto se escribe.
  SELECT left(md5(concat_ws('|',
      jsonb_build_object(
        'org', v_org, 'corte', v_fecha_corte, 'actor', v_actor,
        'st', jsonb_build_array(v_st_anulado, v_st_activo, v_st_terminado, v_st_d301_viejo), 'anulables', v_estatus_anulables,
        'fin_d102', v_fin_d102, 'fin_d202', v_fin_d202, 'anular_oct_d102', v_anular_octubre_d102,
        'd301', jsonb_build_array(v_d301_fin_viejo, v_d301_inicio, v_d301_fin, v_d301_renta, v_d301_dia, v_d301_titular,
                                  v_d301_cotitular, v_d301_aval, v_d301_firmado, v_registrar_pagos_d301, v_d301_pago_agua),
        'rentas', jsonb_build_array(v_d203_total, v_d203_incluye_agua, v_d204_total, v_d204_incluye_agua,
                                    v_d302_total, v_d302_incluye_agua, v_ajustar_cargos_post_corte),
        'saldos', v_cargar_saldos_iniciales)::text,
      (SELECT string_agg(format('%s:%s:%s', a.payment_id, a.regla, a.amount), ',' ORDER BY a.payment_id) FROM _b18_anular a),
      (SELECT string_agg(format('%s:%s>%s', a.payment_id, a.amount_antes, a.amount_nuevo), ',' ORDER BY a.payment_id) FROM _b18_ajustar a),
      (SELECT string_agg(format('%s:%s', contract_id, monto), ',' ORDER BY contract_id) FROM _b18_rentas),
      (SELECT string_agg(format('%s:%s:%s:%s:%s:%s', c.id, c.status, c.end_date, c.billing_start_date, c.monthly_amount, c.payment_day),
                         ',' ORDER BY c.id) FROM public.contracts c WHERE c.id = ANY (c_ids)),
      (SELECT string_agg(format('%s:%s', u.number, u.status), ',' ORDER BY u.number)
         FROM public.units u WHERE u.org_id = v_org AND u.number = ANY (c_unidades_tocadas)),
      COALESCE(v_occ::text, 'occupant_nuevo'))), 12)
    INTO v_huella;

  IF v_aplicar AND v_esperado_huella IS NULL THEN
    RAISE EXCEPTION 'DETENTE: para aplicar copia del dry-run v_esperado_huella := ''%''. Nada se guardó.', v_huella;
  END IF;
  IF v_aplicar AND v_esperado_huella <> v_huella THEN
    RAISE EXCEPTION 'DETENTE: la huella del dry-run (%) no coincide con la de ahora (%): los datos cambiaron. Repite el dry-run. Nada se guardó.',
      v_esperado_huella, v_huella;
  END IF;

  -- ════════════════════════════ 1. ANULAR CARGOS ════════════════════════════
  -- jsonb_populate_record convierte el texto al tipo real de la columna (ENUM o TEXT).
  -- Las guardas se revalidan en el propio UPDATE.
  WITH antes AS (
    SELECT py.id, to_jsonb(py) AS before_data, a.regla
      FROM public.payments py JOIN _b18_anular a ON a.payment_id = py.id
  ), upd AS (
    UPDATE public.payments py
       SET status = (jsonb_populate_record(NULL::public.payments, jsonb_build_object('status', v_st_anulado))).status,
           notes  = concat_ws(' · ', NULLIF(py.notes, ''), v_tag || ': anulado (mes que BaW OS no administró)'),
           updated_at = now()
      FROM _b18_anular a
     WHERE py.id = a.payment_id
       AND py.status::text = ANY (v_estatus_anulables)
       AND NOT EXISTS (SELECT 1 FROM _b18_sucio s WHERE s.payment_id = py.id)
    RETURNING py.id, to_jsonb(py) AS after_data
  )
  INSERT INTO public.audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
  SELECT v_org, 'human', v_actor, 'baw18.fase_b.payment.void', 'payment', upd.id, antes.before_data, upd.after_data,
         jsonb_build_object('run_id', v_run, 'ticket', 'BAW-18', 'regla', antes.regla)
    FROM upd JOIN antes ON antes.id = upd.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_anuladas THEN
    RAISE EXCEPTION 'DETENTE: se anularían % de % cargos planeados. Nada se guardó.', v_n, v_anuladas;
  END IF;

  -- ═══════════════════════ 2. CERRAR CONTRATOS (D102, D202, D301 viejo) ═══════════
  FOR r IN SELECT * FROM (VALUES
      (c_d102, 'D102', v_st_terminado,  v_fin_d102,       'terminado: el inquilino abandonó / entregó'),
      (c_d202, 'D202', v_st_terminado,  v_fin_d202,       'terminado: el inquilino entregó el 1-oct'),
      (c_d301, 'D301', v_st_d301_viejo, v_d301_fin_viejo, 'cerrado: lo sustituye el contrato nuevo 2026-07-01')
    ) AS t(cid, unidad, n_status, n_end, nota)
  LOOP
    SELECT to_jsonb(c) INTO v_before FROM public.contracts c WHERE c.id = r.cid;
    UPDATE public.contracts c
       SET status   = (jsonb_populate_record(NULL::public.contracts, jsonb_build_object('status', r.n_status))).status,
           end_date = r.n_end,
           notes    = concat_ws(' · ', NULLIF(c.notes, ''), v_tag || ': ' || r.nota)
     WHERE c.id = r.cid AND c.status::text = 'active'
    RETURNING to_jsonb(c) INTO v_after;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN RAISE EXCEPTION 'DETENTE: no se pudo cerrar el contrato de %. Nada se guardó.', r.unidad; END IF;
    INSERT INTO public.audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
    VALUES (v_org, 'human', v_actor, 'baw18.fase_b.contract.update', 'contract', r.cid, v_before, v_after,
            jsonb_build_object('run_id', v_run, 'ticket', 'BAW-18', 'regla', 'cerrar_' || r.unidad));
    v_contratos_cerrados := v_contratos_cerrados + 1;
  END LOOP;

  -- ═══════════ 3. D203, D204, D302: renta real + facturación desde el corte ═══════════
  -- Estatus y end_date NO se tocan (Fase B2). Siguen 'active' con end_date vencida:
  -- Mission Control y el cron no miran end_date (src/app/page.tsx:179-182,
  -- src/app/api/cron/payments/route.ts:66-70), así que cobran desde el corte.
  FOR r IN SELECT * FROM _b18_rentas ORDER BY unidad LOOP
    SELECT to_jsonb(c) INTO v_before FROM public.contracts c WHERE c.id = r.contract_id;
    UPDATE public.contracts c
       SET billing_start_date = v_fecha_corte,
           monthly_amount     = r.monto,
           notes              = concat_ws(' · ', NULLIF(c.notes, ''),
                                  format('%s: contrato vencido el %s, sin renovar (Fase B2); se cobra desde el corte; renta real %s/mes (%s); antes monthly_amount=%s',
                                         v_tag, c.end_date, r.total,
                                         CASE WHEN r.incluye_agua THEN 'incluye agua' ELSE 'más agua' END,
                                         c.monthly_amount))
     WHERE c.id = r.contract_id AND c.status::text = 'active'
    RETURNING to_jsonb(c) INTO v_after;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN RAISE EXCEPTION 'DETENTE: no se pudo actualizar el contrato de %. Nada se guardó.', r.unidad; END IF;
    INSERT INTO public.audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
    VALUES (v_org, 'human', v_actor, 'baw18.fase_b.contract.update', 'contract', r.contract_id, v_before, v_after,
            jsonb_build_object('run_id', v_run, 'ticket', 'BAW-18', 'regla', 'renta_y_corte_' || r.unidad));
    v_contratos_actualizados := v_contratos_actualizados + 1;
  END LOOP;

  -- Cargos pendientes desde el corte → renta nueva (guardas revalidadas en el UPDATE).
  WITH antes AS (
    SELECT py.id, to_jsonb(py) AS before_data, a.unidad, a.amount_nuevo - a.amount_antes AS delta
      FROM public.payments py JOIN _b18_ajustar a ON a.payment_id = py.id
  ), upd AS (
    UPDATE public.payments py
       SET rent_amount = a.rent_nuevo,
           water_fee   = a.agua,
           amount      = a.amount_nuevo,
           notes       = concat_ws(' · ', NULLIF(py.notes, ''), v_tag || ': ajustado a la renta real'),
           updated_at  = now()
      FROM _b18_ajustar a
     WHERE py.id = a.payment_id
       AND py.status::text = ANY (v_estatus_anulables)
       AND py.amount IS NOT DISTINCT FROM a.amount_antes
       AND NOT EXISTS (SELECT 1 FROM _b18_sucio s WHERE s.payment_id = py.id)
    RETURNING py.id, to_jsonb(py) AS after_data
  )
  INSERT INTO public.audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
  SELECT v_org, 'human', v_actor, 'baw18.fase_b.payment.update', 'payment', upd.id, antes.before_data, upd.after_data,
         jsonb_build_object('run_id', v_run, 'ticket', 'BAW-18', 'regla', 'renta_real_' || antes.unidad, 'delta', antes.delta)
    FROM upd JOIN antes ON antes.id = upd.id;
  GET DIAGNOSTICS v_cargos_ajustados = ROW_COUNT;
  SELECT count(*), COALESCE(sum(amount_nuevo - amount_antes), 0) INTO v_n, v_cargos_ajuste_delta FROM _b18_ajustar;
  IF v_cargos_ajustados <> v_n THEN
    RAISE EXCEPTION 'DETENTE: se ajustarían % de % cargos planeados. Nada se guardó.', v_cargos_ajustados, v_n;
  END IF;

  -- ═══════════════════════════ 4. CONTRATO NUEVO DE D301 ═══════════════════════════
  IF v_occ IS NOT NULL THEN
    v_ocupantes_reusados := 1;
  ELSE
    INSERT INTO public.occupants (org_id, name, notes)
    VALUES (v_org, v_d301_titular, v_tag || ': titular del contrato de D301 firmado el ' || v_d301_firmado)
    RETURNING id, to_jsonb(occupants) INTO v_occ, v_after;
    INSERT INTO public.audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
    VALUES (v_org, 'human', v_actor, 'baw18.fase_b.occupant.insert', 'occupant', v_occ, NULL, v_after,
            jsonb_build_object('run_id', v_run, 'ticket', 'BAW-18', 'regla', 'ocupante_D301'));
    v_ocupantes_creados := 1;
    -- El trigger trg_crm_contact_for_occupant (20260625010000_crm_occupant_sync.sql:42-54) crea su crm_contact.
    IF to_regclass('public.crm_contacts') IS NOT NULL THEN
      INSERT INTO public.audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
      SELECT v_org, 'human', v_actor, 'baw18.fase_b.crm_contact.insert', 'crm_contact', cc.id, NULL, to_jsonb(cc),
             jsonb_build_object('run_id', v_run, 'ticket', 'BAW-18', 'regla', 'trigger_ocupante_D301')
        FROM public.crm_contacts cc WHERE cc.occupant_id = v_occ AND cc.org_id = v_org;
    END IF;
  END IF;

  INSERT INTO public.contracts (org_id, unit_id, occupant_id, start_date, end_date, billing_start_date,
                                monthly_amount, payment_day, status, rent_type, notes, aval)
  SELECT v_org, (v_uid->>'D301')::uuid, v_occ, v_d301_inicio, v_d301_fin, v_fecha_corte,
         v_d301_renta, v_d301_dia, x.status, 'LTR',
         format('%s: contrato firmado el %s, vigente %s → %s. Titulares: %s y %s. Aval: %s. Sustituye al contrato %s.',
                v_tag, v_d301_firmado, v_d301_inicio, v_d301_fin, v_d301_titular, v_d301_cotitular, v_d301_aval, c_d301),
         v_d301_aval
    FROM jsonb_populate_record(NULL::public.contracts, jsonb_build_object('status', v_st_activo)) x
  RETURNING id, to_jsonb(contracts) INTO v_d301_nuevo, v_after;
  INSERT INTO public.audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (v_org, 'human', v_actor, 'baw18.fase_b.contract.insert', 'contract', v_d301_nuevo, NULL, v_after,
          jsonb_build_object('run_id', v_run, 'ticket', 'BAW-18', 'regla', 'contrato_nuevo_D301'));
  v_contratos_creados := 1;
  v_montos := v_montos || format(' D301=%s+agua', v_d301_renta);

  -- D301: cargos jul–oct pagados (solo si Fran lo pide). Modelo «pago directo en el
  -- cargo», igual que conserje/Stripe (src/app/api/conserje/cobros/[id]/route.ts:44-58).
  IF v_registrar_pagos_d301 THEN
    FOR v_mes IN SELECT gs::date FROM generate_series(date_trunc('month', v_d301_inicio),
                                                      date_trunc('month', v_fecha_corte), interval '1 month') gs
    LOOP
      INSERT INTO public.payments (org_id, contract_id, amount, rent_amount, water_fee, amount_paid, due_date,
                                   paid_date, status, method, payment_method, reference, notes, confirmed_by, confirmed_at)
      SELECT v_org, v_d301_nuevo, v_d301_renta + v_d301_pago_agua, v_d301_renta, v_d301_pago_agua,
             v_d301_renta + v_d301_pago_agua, (v_mes + (v_d301_dia - 1))::date, (v_mes + (v_d301_dia - 1))::date,
             x.status, x.method, 'efectivo',
             'BaW-D301-' || to_char(v_mes, 'YYYY-MM') || '-1',
             v_tag || ': pago registrado por Fran (recibo BaW-D301-' || to_char(v_mes, 'YYYY-MM') || '-1); fecha de pago = vencimiento, real por confirmar',
             v_actor, now()
        FROM jsonb_populate_record(NULL::public.payments, jsonb_build_object('status', 'paid', 'method', 'cash')) x
      RETURNING to_jsonb(payments) INTO v_after;
      INSERT INTO public.audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
      VALUES (v_org, 'human', v_actor, 'baw18.fase_b.payment.insert', 'payment', (v_after->>'id')::uuid, NULL, v_after,
              jsonb_build_object('run_id', v_run, 'ticket', 'BAW-18', 'regla', 'pago_d301_' || to_char(v_mes, 'YYYY-MM')));
      v_pagos_d301 := v_pagos_d301 + 1;
    END LOOP;
  END IF;

  -- ═════════════════════════════ 5. UNIDADES ═════════════════════════════
  FOR r IN SELECT * FROM (VALUES
      ('D102', 'available'), ('D202', 'available'), ('D303', 'available')) AS t(unidad, n_status)
  LOOP
    SELECT to_jsonb(u) INTO v_before FROM public.units u WHERE u.id = (v_uid->>r.unidad)::uuid;
    CONTINUE WHEN v_before->>'status' = r.n_status;
    UPDATE public.units u
       SET status = (jsonb_populate_record(NULL::public.units, jsonb_build_object('status', r.n_status))).status
     WHERE u.id = (v_uid->>r.unidad)::uuid
    RETURNING to_jsonb(u) INTO v_after;
    INSERT INTO public.audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
    VALUES (v_org, 'human', v_actor, 'baw18.fase_b.unit.update', 'unit', (v_uid->>r.unidad)::uuid, v_before, v_after,
            jsonb_build_object('run_id', v_run, 'ticket', 'BAW-18', 'regla', 'unidad_' || r.unidad));
    v_unidades_cambiadas := v_unidades_cambiadas + 1;
  END LOOP;

  -- ═════════════════════════════ 6. DESPUÉS ═════════════════════════════
  EXECUTE c_sql_mc INTO v_mc_desp_n, v_mc_desp_total, v_mc_desp_sinfila, v_mc_desp_det USING v_org, v_hoy;

  -- Deuda en filas de contratos que Mission Control ya no cuenta (terminados/expirados).
  SELECT COALESCE(sum(py.amount + COALESCE(py.late_fee_amount, 0) - COALESCE(py.amount_paid, 0)), 0),
         COALESCE(string_agg(u.number || ' ' || to_char(py.due_date, 'YYYY-MM') || ' $' || py.amount, ', '), '—')
    INTO v_deuda_fuera_mc, v_deuda_fuera_mc_det
    FROM public.payments py
    JOIN public.contracts c ON c.id = py.contract_id
    LEFT JOIN public.units u ON u.id = c.unit_id
   WHERE py.org_id = v_org AND py.status::text NOT IN ('paid', v_st_anulado)
     AND c.status::text NOT IN ('active', 'en_renovacion')
     AND py.due_date <= v_hoy;

  v_veredicto := CASE
    WHEN v_contratos_cerrados <> 3 THEN format('DETENTE: contratos_cerrados=%s (esperado 3)', v_contratos_cerrados)
    WHEN v_contratos_actualizados <> 3 THEN format('DETENTE: contratos_actualizados=%s (esperado 3)', v_contratos_actualizados)
    WHEN v_contratos_creados <> 1 THEN format('DETENTE: contratos_creados=%s (esperado 1)', v_contratos_creados)
    WHEN v_registrar_pagos_d301 AND v_pagos_d301 = 0 THEN 'DETENTE: no se registraron pagos de D301'
    WHEN EXISTS (SELECT 1 FROM public.payments py
                  WHERE py.contract_id = ANY (c_ids) AND py.ancillary_charge_id IS NULL
                    AND py.due_date < v_fecha_corte
                    AND py.status::text = ANY (v_estatus_anulables))
      THEN 'DETENTE: quedaron cargos pendientes antes del corte'
    ELSE 'OK'
  END;

  v_resumen := format(
    'huella=%s · lote=%s · corte=%s · hoy=%s · contratos_cerrados=%s · contratos_actualizados=%s · contratos_creados=%s · '
    'ocupantes_creados=%s · ocupantes_reusados=%s · unidades_cambiadas=%s · anuladas=%s · monto_anulado=%s · '
    'cargos_ajustados=%s (delta %s) · pagos_d301_registrados=%s · accesorios_pre_corte_sin_tocar=%s · rentas[%s] · '
    'MC_antes=%s meses $%s (%s sin fila) · MC_despues=%s meses $%s (%s sin fila) · MC_despues_detalle=[%s] · '
    'deuda_fuera_de_MC (contratos cerrados)=$%s [%s] · veredicto=%s',
    v_huella, v_run, v_fecha_corte, v_hoy, v_contratos_cerrados, v_contratos_actualizados, v_contratos_creados,
    v_ocupantes_creados, v_ocupantes_reusados, v_unidades_cambiadas, v_anuladas, v_monto_anulado,
    v_cargos_ajustados, v_cargos_ajuste_delta, v_pagos_d301, v_accesorios_sin_tocar, btrim(v_montos),
    v_mc_antes_n, v_mc_antes_total, v_mc_antes_sinfila, v_mc_desp_n, v_mc_desp_total, v_mc_desp_sinfila,
    v_mc_desp_det, v_deuda_fuera_mc, v_deuda_fuera_mc_det, v_veredicto);

  -- Cabecera del lote (la reversa la usa como índice).
  INSERT INTO public.audit_log (org_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (v_org, 'human', v_actor, 'baw18.fase_b.lote', 'lote', v_run, NULL, NULL,
          jsonb_build_object('run_id', v_run, 'ticket', 'BAW-18', 'huella', v_huella, 'fecha_corte', v_fecha_corte, 'hoy', v_hoy,
                             'anular_octubre_d102', v_anular_octubre_d102, 'registrar_pagos_d301', v_registrar_pagos_d301,
                             'st_terminado', v_st_terminado, 'st_d301_viejo', v_st_d301_viejo, 'resumen', v_resumen));

  -- Cualquier excepción deshace TODO el bloque.
  IF v_veredicto <> 'OK' THEN
    RAISE EXCEPTION '% (nada se guardó) · %', v_veredicto, v_resumen;
  END IF;
  IF NOT v_aplicar THEN
    RAISE EXCEPTION 'DRY-RUN OK (nada se guardó) · %', v_resumen;
  END IF;

  DROP TABLE IF EXISTS pg_temp._b18_resumen;
  CREATE TEMP TABLE _b18_resumen AS
  SELECT v_veredicto AS veredicto, v_run AS run_id, v_huella AS huella, v_fecha_corte AS fecha_corte,
         v_anuladas AS anuladas, v_monto_anulado AS monto_anulado,
         v_contratos_cerrados AS contratos_cerrados, v_contratos_actualizados AS contratos_actualizados,
         v_contratos_creados AS contratos_creados, v_unidades_cambiadas AS unidades_cambiadas,
         v_pagos_d301 AS pagos_d301, v_mc_antes_total AS mc_antes, v_mc_desp_n AS mc_despues_meses,
         v_mc_desp_total AS mc_despues, v_deuda_fuera_mc AS deuda_fuera_de_mc, v_resumen AS resumen;
END
$baw18b$;

-- Resumen de UNA fila (solo se llega aquí aplicando con veredicto OK; en el
-- dry-run el editor se detiene en el error de arriba). Guarda el run_id: la
-- reversa lo pide.
SELECT * FROM pg_temp._b18_resumen;
