-- =============================================================================
-- BAW-3 · Registro de versiones faltantes en supabase_migrations.schema_migrations
-- =============================================================================
-- Proyecto: zlcgxmllaeweypyodvzk (prod). LO CORRE FRAN, A MANO, EN EL SQL EDITOR.
--
-- Qué hace: SOLO inserta filas de bitácora (version, name) para las 55
-- migraciones de supabase/migrations/ cuyo efecto ya está en prod pero que
-- nunca se registraron. NO ejecuta ninguna migración ni toca tablas de negocio.
-- Antes: 17 filas (20260429041148 … 20260523234131). Después: 72 = 72 archivos.
-- No registra 20261014010000 (BAW-15) ni 20261015010000 (BAW-18): reservadas.
--
-- Por qué un solo bloque DO (3 líneas):
--   1. El SQL Editor solo muestra la última instrucción y no muestra NOTICEs; un ROLLBACK final taparía las cifras.
--   2. Todo vive en UNA sentencia DO: es atómica en el editor y en psql, y si lanza excepción Postgres deshace todo solo.
--   3. Dry-run = el bloque SIEMPRE termina en excepción con el resumen en el mensaje (nada se guarda); aplicar = v_aplicar := true.
--
-- Pasos exactos para Fran (SQL Editor de Supabase, proyecto zlcgxmllaeweypyodvzk):
--   1. DRY-RUN: copiar el archivo COMPLETO tal cual (v_aplicar := false), pegarlo en
--      una query nueva y pulsar «Run». Debe salir en ROJO un error que empieza con
--        DRY-RUN OK (nada se guardó) · antes_total=17 · … · insertadas=55 · despues_total=72 · … · veredicto=OK
--      Eso es el éxito del dry-run: el error es el mecanismo que deshace todo.
--      Si el mensaje empieza con «DETENTE:», no seguir y pegar el mensaje en el PR #164.
--   2. APLICAR: cambiar `v_aplicar boolean := false;` por `true` (única edición),
--      pulsar «Run» con el archivo completo. Debe salir una tabla de UNA fila con
--      veredicto = OK, insertadas = 55, despues_total = 72. Si sale «DETENTE: …»
--      en rojo, no se guardó nada: detenerse y avisar en el PR.
--   3. No volver a correrlo: una segunda corrida da «DETENTE: antes_total=72…»
--      sin guardar nada (además el INSERT usa ON CONFLICT DO NOTHING).
--   Después: `supabase migration list --linked` debe mostrar 72 versiones, Local = Remote.
--   (Con psql: `psql -v ON_ERROR_STOP=1 -f …`; sin ese flag, tras el dry-run aparece un
--   segundo error inofensivo «_baw3_resumen does not exist» en el SELECT final.)
-- =============================================================================

DO $baw3$
DECLARE
  v_aplicar boolean := false;  -- ← DRY-RUN. Cambiar a true SOLO en el paso 2.

  c_prod  CONSTANT text[] := ARRAY[
      '20260429041148',
      '20260429041233',
      '20260429203827',
      '20260430010640',
      '20260430014937',
      '20260430020117',
      '20260502132116',
      '20260502132844',
      '20260502133814',
      '20260503132839',
      '20260503132858',
      '20260503132907',
      '20260503133017',
      '20260503133055',
      '20260523231651',
      '20260523232305',
      '20260523234131'
  ];
  c_ver   CONSTANT text[] := ARRAY[
      '20260327010000',
      '20260328010000',
      '20260329010000',
      '20260330010000',
      '20260330020000',
      '20260330030000',
      '20260401010000',
      '20260401020000',
      '20260402010000',
      '20260403010000',
      '20260403020000',
      '20260403030000',
      '20260403040000',
      '20260403050000',
      '20260403060000',
      '20260404010000',
      '20260404020000',
      '20260404030000',
      '20260404040000',
      '20260404050000',
      '20260408010000',
      '20260408020000',
      '20260415010000',
      '20260416010000',
      '20260611010000',
      '20260611020000',
      '20260612010000',
      '20260615010000',
      '20260615020000',
      '20260615030000',
      '20260616010000',
      '20260616020000',
      '20260616030000',
      '20260617010000',
      '20260617020000',
      '20260620010000',
      '20260620020000',
      '20260622010000',
      '20260623010000',
      '20260625010000',
      '20260627010000',
      '20260627020000',
      '20260628010000',
      '20260628020000',
      '20260629010000',
      '20260702010000',
      '20260703010000',
      '20260703020000',
      '20260703030000',
      '20260704010000',
      '20260704020000',
      '20260704030000',
      '20260704040000',
      '20261001010000',
      '20261001020000'
  ];
  c_name  CONSTANT text[] := ARRAY[
      'pricing_config',
      'payment_breakdown_incidents',
      'reservations',
      'contracts_legal',
      'occupants_fiscal',
      'occupants_type',
      'expenses',
      'str_seasons',
      'webhook_events',
      'audit_log',
      'drive_folder',
      'payment_ledger',
      'portal_inquilino',
      'tasks',
      'whatsapp_notifications',
      'guest_portal',
      'invoices',
      'rls_hardening',
      'tasks_task_type',
      'tenant_intake',
      'channex_columns',
      'mifiel_signature',
      'unit_media_tier1a',
      'settings_mvp',
      'agent_approvals_discord_resolver',
      'agents_alicia_hugo_beta',
      'rls_close_allow_all',
      'contract_status_en_renovacion',
      'contracts_rent_type',
      'payments_late_fee',
      'ownership_stakes_mgmt_vigencia',
      'ancillary_charges',
      'payments_ancillary_link',
      'crm',
      'payments_amount_paid',
      'audit_log_actor_type_system',
      'agents_catalog_fields',
      'archive_lifecycle',
      'agent_chat',
      'crm_occupant_sync',
      'party_kind_payer',
      'stay_occupants',
      'contracts_billing_start',
      'payment_receipts',
      'service_rates',
      'engagements',
      'public_listing_phase1',
      'reservation_holds_now_fix',
      'calendar_phase3',
      'quote_flow_crm',
      'finance_rls_hygiene',
      'finance_owner_statements',
      'org_usage_snapshots',
      'rls_close_open_policies',
      'rls_close_tasks_tenant_applications'
  ];

  v_antes_total                    bigint;
  v_antes_falta_registrada         bigint;
  v_antes_desconocida              bigint;
  v_antes_ya_registradas           bigint;
  v_insertadas                     bigint;
  v_despues_total                  bigint;
  v_despues_falta                  bigint;
  v_despues_reservadas_registradas bigint;
  v_veredicto                      text;
  v_resumen                        text;
BEGIN
  IF cardinality(c_prod) <> 17 OR cardinality(c_ver) <> 55 OR cardinality(c_name) <> 55 THEN
    RAISE EXCEPTION 'DETENTE: listas internas mal formadas (prod=%, ver=%, name=%)',
      cardinality(c_prod), cardinality(c_ver), cardinality(c_name);
  END IF;

  -- ── ANTES ────────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_antes_total FROM supabase_migrations.schema_migrations;

  SELECT count(*) INTO v_antes_falta_registrada
    FROM unnest(c_prod) AS p(version)
   WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations s WHERE s.version = p.version);

  SELECT count(*) INTO v_antes_desconocida
    FROM supabase_migrations.schema_migrations s
   WHERE s.version <> ALL (c_prod) AND s.version <> ALL (c_ver);

  SELECT count(*) INTO v_antes_ya_registradas
    FROM supabase_migrations.schema_migrations s
   WHERE s.version = ANY (c_ver);

  -- ── REGISTRO (solo bitácora) ─────────────────────────────────────────────
  INSERT INTO supabase_migrations.schema_migrations (version, name)
  SELECT v, n FROM unnest(c_ver, c_name) AS x(v, n) ORDER BY v
  ON CONFLICT (version) DO NOTHING;
  GET DIAGNOSTICS v_insertadas = ROW_COUNT;

  -- ── DESPUÉS ──────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_despues_total FROM supabase_migrations.schema_migrations;

  SELECT count(*) INTO v_despues_falta
    FROM unnest(c_prod || c_ver) AS x(version)
   WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations s WHERE s.version = x.version);

  SELECT count(*) INTO v_despues_reservadas_registradas
    FROM supabase_migrations.schema_migrations
   WHERE version IN ('20261014010000', '20261015010000');

  -- ── VEREDICTO: la primera comprobación que falle ─────────────────────────
  v_veredicto := CASE
    WHEN v_antes_total <> 17                   THEN format('DETENTE: antes_total=%s (esperado 17)', v_antes_total)
    WHEN v_antes_falta_registrada <> 0         THEN format('DETENTE: antes_falta_registrada=%s (esperado 0)', v_antes_falta_registrada)
    WHEN v_antes_desconocida <> 0              THEN format('DETENTE: antes_desconocida=%s (esperado 0; prod tiene versiones sin archivo en el repo)', v_antes_desconocida)
    WHEN v_antes_ya_registradas <> 0           THEN format('DETENTE: antes_ya_registradas=%s (esperado 0)', v_antes_ya_registradas)
    WHEN v_insertadas <> 55                    THEN format('DETENTE: insertadas=%s (esperado 55)', v_insertadas)
    WHEN v_despues_total <> 72                 THEN format('DETENTE: despues_total=%s (esperado 72)', v_despues_total)
    WHEN v_despues_falta <> 0                  THEN format('DETENTE: despues_falta=%s (esperado 0)', v_despues_falta)
    WHEN v_despues_reservadas_registradas <> 0 THEN format('DETENTE: despues_reservadas_registradas=%s (esperado 0)', v_despues_reservadas_registradas)
    ELSE 'OK'
  END;

  v_resumen := format(
    'antes_total=%s · antes_falta_registrada=%s · antes_desconocida=%s · antes_ya_registradas=%s · insertadas=%s · despues_total=%s · despues_falta=%s · despues_reservadas_registradas=%s · veredicto=%s',
    v_antes_total, v_antes_falta_registrada, v_antes_desconocida, v_antes_ya_registradas,
    v_insertadas, v_despues_total, v_despues_falta, v_despues_reservadas_registradas, v_veredicto);

  -- Cualquier excepción deshace TODO el bloque (incluido el INSERT).
  IF v_veredicto <> 'OK' THEN
    RAISE EXCEPTION '% (nada se guardó) · %', v_veredicto, v_resumen;
  END IF;
  IF NOT v_aplicar THEN
    RAISE EXCEPTION 'DRY-RUN OK (nada se guardó) · %', v_resumen;
  END IF;

  -- Solo con v_aplicar = true y veredicto OK: se confirma y se deja la fila
  -- resumen en una tabla temporal para la consulta final.
  CREATE TEMP TABLE _baw3_resumen AS
  SELECT v_antes_total                    AS antes_total,
         v_antes_falta_registrada         AS antes_falta_registrada,
         v_antes_desconocida              AS antes_desconocida,
         v_antes_ya_registradas           AS antes_ya_registradas,
         v_insertadas                     AS insertadas,
         v_despues_total                  AS despues_total,
         v_despues_falta                  AS despues_falta,
         v_despues_reservadas_registradas AS despues_reservadas_registradas,
         v_veredicto                      AS veredicto;
END
$baw3$;

-- Resumen de UNA fila (solo se llega aquí en el paso 2 con veredicto OK; en el
-- dry-run el editor se detiene en el error de arriba).
SELECT * FROM pg_temp._baw3_resumen;
