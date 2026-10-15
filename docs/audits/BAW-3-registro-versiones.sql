-- =============================================================================
-- BAW-3 · Registro de versiones faltantes en supabase_migrations.schema_migrations
-- =============================================================================
-- Proyecto: zlcgxmllaeweypyodvzk (prod). LO CORRE FRAN, A MANO, EN EL SQL EDITOR.
--
-- Qué hace: SOLO inserta filas de bitácora (version, name) para las 54
-- migraciones de supabase/migrations/ cuyo efecto ya está en prod pero que
-- nunca se registraron. NO ejecuta ninguna migración ni toca tablas de negocio.
--
-- Estado esperado ANTES: 17 filas (20260429041148 … 20260523234131).
-- Estado esperado DESPUÉS: 71 filas = 71 archivos de supabase/migrations/.
--
-- Excluidas a propósito:
--   · Las 17 versiones que prod ya tiene registradas (lista _baw3_prod_registradas).
--   · 20261014010000 (BAW-15) y 20261015010000 (BAW-18): reservadas por otros
--     carriles, no existen en el repo y NO se registran aquí.
--
-- Modo de uso:
--   1. Dry-run: correr el archivo tal cual. Termina en ROLLBACK → no queda nada.
--      Revisar los SELECT de verificación (valores esperados en comentarios).
--   2. Si todo cuadra: comentar la línea ROLLBACK, descomentar COMMIT y volver
--      a correr el archivo completo.
--   3. Después: `supabase migration list --linked` debe mostrar las 71 versiones
--      en Local y Remote. Recién entonces `supabase db push` deja de intentar
--      re-aplicar migraciones viejas.
-- =============================================================================

BEGIN;

-- Las 17 versiones que prod ya tiene (no se tocan; solo sirven para verificar).
CREATE TEMP TABLE _baw3_prod_registradas (version text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _baw3_prod_registradas (version) VALUES
  ('20260429041148'),
  ('20260429041233'),
  ('20260429203827'),
  ('20260430010640'),
  ('20260430014937'),
  ('20260430020117'),
  ('20260502132116'),
  ('20260502132844'),
  ('20260502133814'),
  ('20260503132839'),
  ('20260503132858'),
  ('20260503132907'),
  ('20260503133017'),
  ('20260503133055'),
  ('20260523231651'),
  ('20260523232305'),
  ('20260523234131');

-- Las 54 versiones a registrar (una por archivo de supabase/migrations/ que no
-- está en la lista anterior). name = nombre del archivo sin versión ni .sql,
-- igual que lo guarda el CLI de Supabase.
CREATE TEMP TABLE _baw3_a_registrar (version text PRIMARY KEY, name text NOT NULL) ON COMMIT DROP;
INSERT INTO _baw3_a_registrar (version, name) VALUES
  ('20260327010000', 'pricing_config'),
  ('20260328010000', 'payment_breakdown_incidents'),
  ('20260329010000', 'reservations'),
  ('20260330010000', 'contracts_legal'),
  ('20260330020000', 'occupants_fiscal'),
  ('20260330030000', 'occupants_type'),
  ('20260401010000', 'expenses'),
  ('20260401020000', 'str_seasons'),
  ('20260402010000', 'webhook_events'),
  ('20260403010000', 'audit_log'),
  ('20260403020000', 'drive_folder'),
  ('20260403030000', 'payment_ledger'),
  ('20260403040000', 'portal_inquilino'),
  ('20260403050000', 'tasks'),
  ('20260403060000', 'whatsapp_notifications'),
  ('20260404010000', 'guest_portal'),
  ('20260404020000', 'invoices'),
  ('20260404030000', 'rls_hardening'),
  ('20260404040000', 'tasks_task_type'),
  ('20260404050000', 'tenant_intake'),
  ('20260408010000', 'channex_columns'),
  ('20260408020000', 'mifiel_signature'),
  ('20260415010000', 'unit_media_tier1a'),
  ('20260611010000', 'agent_approvals_discord_resolver'),
  ('20260611020000', 'agents_alicia_hugo_beta'),
  ('20260612010000', 'rls_close_allow_all'),
  ('20260615010000', 'contract_status_en_renovacion'),
  ('20260615020000', 'contracts_rent_type'),
  ('20260615030000', 'payments_late_fee'),
  ('20260616010000', 'ownership_stakes_mgmt_vigencia'),
  ('20260616020000', 'ancillary_charges'),
  ('20260616030000', 'payments_ancillary_link'),
  ('20260617010000', 'crm'),
  ('20260617020000', 'payments_amount_paid'),
  ('20260620010000', 'audit_log_actor_type_system'),
  ('20260620020000', 'agents_catalog_fields'),
  ('20260622010000', 'archive_lifecycle'),
  ('20260623010000', 'agent_chat'),
  ('20260625010000', 'crm_occupant_sync'),
  ('20260627010000', 'party_kind_payer'),
  ('20260627020000', 'stay_occupants'),
  ('20260628010000', 'contracts_billing_start'),
  ('20260628020000', 'payment_receipts'),
  ('20260629010000', 'service_rates'),
  ('20260702010000', 'engagements'),
  ('20260703010000', 'public_listing_phase1'),
  ('20260703020000', 'reservation_holds_now_fix'),
  ('20260703030000', 'calendar_phase3'),
  ('20260704010000', 'quote_flow_crm'),
  ('20260704020000', 'finance_rls_hygiene'),
  ('20260704030000', 'finance_owner_statements'),
  ('20260704040000', 'org_usage_snapshots'),
  ('20261001010000', 'rls_close_open_policies'),
  ('20261001020000', 'rls_close_tasks_tenant_applications');

-- -----------------------------------------------------------------------------
-- Verificación ANTES
-- -----------------------------------------------------------------------------

-- A1. Total de filas registradas. Esperado: 17.
SELECT count(*) AS antes_total FROM supabase_migrations.schema_migrations;

-- A2. De las 17 conocidas, cuáles NO están en prod. Esperado: 0 filas.
SELECT p.version AS antes_falta_registrada
  FROM _baw3_prod_registradas p
  LEFT JOIN supabase_migrations.schema_migrations s USING (version)
 WHERE s.version IS NULL;

-- A3. Filas de prod que no corresponden a ningún archivo del repo. Esperado: 0
--     filas. Si aparece algo (p. ej. una versión con timestamp de
--     apply_migration), DETENERSE y avisar en el PR #164.
SELECT s.version AS antes_desconocida, s.name
  FROM supabase_migrations.schema_migrations s
 WHERE s.version NOT IN (SELECT version FROM _baw3_prod_registradas)
   AND s.version NOT IN (SELECT version FROM _baw3_a_registrar)
 ORDER BY s.version;

-- A4. De las 54 a registrar, cuántas ya existen. Esperado: 0.
SELECT count(*) AS antes_ya_registradas
  FROM _baw3_a_registrar r
  JOIN supabase_migrations.schema_migrations s USING (version);

-- -----------------------------------------------------------------------------
-- Registro (solo bitácora)
-- -----------------------------------------------------------------------------

-- Esperado: insertadas = 54.
WITH ins AS (
  INSERT INTO supabase_migrations.schema_migrations (version, name)
  SELECT version, name FROM _baw3_a_registrar ORDER BY version
  ON CONFLICT (version) DO NOTHING
  RETURNING version
)
SELECT count(*) AS insertadas FROM ins;

-- -----------------------------------------------------------------------------
-- Verificación DESPUÉS
-- -----------------------------------------------------------------------------

-- D1. Total de filas registradas. Esperado: 71.
SELECT count(*) AS despues_total FROM supabase_migrations.schema_migrations;

-- D2. Archivos del repo (17 + 54) sin fila en prod. Esperado: 0 filas.
SELECT x.version AS despues_falta
  FROM (SELECT version FROM _baw3_prod_registradas
        UNION ALL
        SELECT version FROM _baw3_a_registrar) x
  LEFT JOIN supabase_migrations.schema_migrations s USING (version)
 WHERE s.version IS NULL;

-- D3. Las versiones reservadas por otros carriles siguen sin registrar.
--     Esperado: 0.
SELECT count(*) AS despues_reservadas_registradas
  FROM supabase_migrations.schema_migrations
 WHERE version IN ('20261014010000', '20261015010000');

-- Dry-run: deshace todo. Para aplicar, comentar ROLLBACK y descomentar COMMIT.
ROLLBACK;
-- COMMIT;
