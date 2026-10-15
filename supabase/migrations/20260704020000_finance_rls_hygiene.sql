-- BaW OS — Fase 0 de higiene financiera (ADR-022 §2.6: D3 + D4)
--
-- D3: invoices.org_id era TEXT con default 'baw' (hardcodeado también en el
--     POST del API) — inconsistente con el multi-tenant (uuid). Se backfillea
--     desde el contrato y se convierte a uuid con FK real.
-- D4: RLS abierta o ausente en tablas de dinero:
--     - invoices: políticas USING(true) para select/insert/update
--     - payment_ledger: select/insert USING(true) sin aislar org
--     - expenses: RLS habilitada (20260404_rls_hardening) pero solo con
--       política service_role → el cliente autenticado quedaba sin política
--       explícita de org
--     Se reemplazan por políticas org-scoped reutilizando los helpers
--     SECURITY DEFINER de 20260612 (user_org_ids). service_role sigue
--     bypasseando RLS por diseño (APIs server-side no cambian).
--
-- payment_ledger conserva su inmutabilidad: solo SELECT + INSERT, sin
-- políticas de UPDATE/DELETE.

BEGIN;

-- =====================================================================
-- 1) invoices.org_id TEXT 'baw' → uuid + FK a organizations
-- =====================================================================
ALTER TABLE public.invoices ALTER COLUMN org_id DROP DEFAULT;

-- Backfill 1: derivar org del contrato ligado (fuente más confiable)
UPDATE public.invoices i
SET org_id = c.org_id::text
FROM public.contracts c
WHERE i.contract_id = c.id
  AND i.org_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- Backfill 2: derivar org vía el payment (facturas sin contract_id directo)
UPDATE public.invoices i
SET org_id = c.org_id::text
FROM public.payments p
JOIN public.contracts c ON c.id = p.contract_id
WHERE i.payment_id = p.id
  AND i.org_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- Backfill 3 (última red): primera org por created_at — mismo criterio que el
-- shim legacy getOrgIdAsync(). Solo aplica a filas que sigan sin uuid válido.
UPDATE public.invoices
SET org_id = (SELECT id::text FROM public.organizations ORDER BY created_at ASC LIMIT 1)
WHERE org_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND EXISTS (SELECT 1 FROM public.organizations);

ALTER TABLE public.invoices
  ALTER COLUMN org_id TYPE uuid USING org_id::uuid;
ALTER TABLE public.invoices
  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(org_id);

-- Políticas: lectura para miembros de la org (la página /invoices lee directo
-- como fallback). Escrituras SOLO server-side vía service_role (el POST del
-- API usa createServiceClient) → no se crean políticas de insert/update para
-- authenticated.
DROP POLICY IF EXISTS "Read invoices" ON public.invoices;
DROP POLICY IF EXISTS "Insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Update invoices" ON public.invoices;

CREATE POLICY invoices_select_member ON public.invoices
  FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())));

-- =====================================================================
-- 2) payment_ledger — aislar por org, conservar inmutabilidad
-- =====================================================================
-- Backfill de filas viejas sin org (la columna era nullable y los primeros
-- inserts no la mandaban). contract_id es NOT NULL.
UPDATE public.payment_ledger pl
SET org_id = c.org_id
FROM public.contracts c
WHERE pl.contract_id = c.id
  AND pl.org_id IS NULL;

DROP POLICY IF EXISTS ledger_select ON public.payment_ledger;
DROP POLICY IF EXISTS ledger_insert ON public.payment_ledger;

CREATE POLICY ledger_select_member ON public.payment_ledger
  FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())));

CREATE POLICY ledger_insert_member ON public.payment_ledger
  FOR INSERT
  WITH CHECK (org_id IN (SELECT public.user_org_ids(auth.uid())));

-- Sin políticas de UPDATE/DELETE = inmutable para clientes. El borrado del
-- lifecycle (archive/delete de contratos) corre con service_role.

-- =====================================================================
-- 3) expenses — políticas de org para el cliente autenticado
-- =====================================================================
-- Quitar el default hardcodeado a una org concreta (20260401_expenses.sql):
-- todo insert debe traer org_id explícito.
ALTER TABLE public.expenses ALTER COLUMN org_id DROP DEFAULT;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expenses_select_member ON public.expenses;
CREATE POLICY expenses_select_member ON public.expenses
  FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())));

DROP POLICY IF EXISTS expenses_insert_member ON public.expenses;
CREATE POLICY expenses_insert_member ON public.expenses
  FOR INSERT
  WITH CHECK (org_id IN (SELECT public.user_org_ids(auth.uid())));

DROP POLICY IF EXISTS expenses_update_member ON public.expenses;
CREATE POLICY expenses_update_member ON public.expenses
  FOR UPDATE
  USING (org_id IN (SELECT public.user_org_ids(auth.uid())))
  WITH CHECK (org_id IN (SELECT public.user_org_ids(auth.uid())));

-- DELETE se hace vía API (service_role) — sin política de delete para clientes.
-- La política service_role_expenses de 20260404_rls_hardening sigue vigente.

COMMIT;
