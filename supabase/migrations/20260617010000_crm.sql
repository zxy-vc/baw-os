-- BaW OS — CRM de clientes (Bloque: relación y recompra).
--
-- Contexto (decisión de Fran): el valor no está en el lead frío sino en el
-- CLIENTE — quien ya rentó por cualquier canal — y en su RECOMPRA / MIGRACIÓN
-- de producto (renta corta → media → larga). El CRM se unifica en la PERSONA;
-- el producto vive en cada renta y en cada oportunidad. También registra leads
-- fríos (llamadas entrantes) para no perderlos.
--
-- Dos tablas:
--   • crm_contacts      — la ficha de persona (cliente o lead), opcionalmente
--                         ligada a un occupant del sistema.
--   • crm_opportunities — oportunidades de recompra/migración/nueva renta, con
--                         producto objetivo y etapa de pipeline.
--
-- Producto = taxonomía existente de renta: LTR (larga), MTR (media), STR (corta).
-- Aditiva + idempotente. Rollback al final.

-- ───────────────────────────────────────────────────────────────────────────
-- crm_contacts
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  occupant_id      UUID REFERENCES occupants(id) ON DELETE SET NULL, -- enlaza con un inquilino existente; NULL = histórico/manual
  name             TEXT NOT NULL,
  phone            TEXT,
  email            TEXT,
  -- Canal por el que llegó.
  source           TEXT NOT NULL DEFAULT 'manual'
                     CHECK (source IN ('llamada','whatsapp','referido','portal','anuncio','manual','otro')),
  -- true una vez que rentó (cliente); false = lead frío.
  is_client        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Ciclo de vida unificado (lead + cliente).
  status           TEXT NOT NULL DEFAULT 'nuevo'
                     CHECK (status IN ('nuevo','contactado','activo','inactivo','en_seguimiento','recompro','descartado')),
  -- Producto/segmento de interés. TEXTO LIBRE a propósito: el negocio tiene
  -- productos heterogéneos y crecientes (residencial larga/media/corta,
  -- espectacular, agropecuario, estacionamiento, bodega, otros). La UI ofrece
  -- una lista sugerida sin bloquear valores nuevos.
  interest_product TEXT,
  owner            TEXT,                 -- responsable del seguimiento
  next_followup_at DATE,                 -- próximo contacto
  tags             TEXT[] NOT NULL DEFAULT '{}',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT crm_contacts_occupant_uniq UNIQUE (org_id, occupant_id)
);

CREATE INDEX IF NOT EXISTS crm_contacts_org_status_idx ON public.crm_contacts(org_id, status);
CREATE INDEX IF NOT EXISTS crm_contacts_followup_idx   ON public.crm_contacts(org_id, next_followup_at);

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "crm_contacts_org_isolation" ON public.crm_contacts
    USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))
    WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.crm_contacts IS
  'Ficha de persona del CRM (cliente o lead). is_client=true cuando ya rentó. occupant_id enlaza con el inquilino del sistema; NULL = histórico/manual.';

-- ───────────────────────────────────────────────────────────────────────────
-- crm_opportunities
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_opportunities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id       UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL DEFAULT 'recompra'
                     CHECK (kind IN ('recompra','migracion','nueva')),
  target_product   TEXT,                -- producto/segmento objetivo (texto libre; ver crm_contacts.interest_product)
  unit_id          UUID REFERENCES units(id) ON DELETE SET NULL,  -- unidad objetivo (opcional)
  stage            TEXT NOT NULL DEFAULT 'identificado'
                     CHECK (stage IN ('identificado','contactado','interesado','negociacion','ganado','perdido')),
  est_monthly      DECIMAL(10,2),        -- renta mensual estimada del trato
  owner            TEXT,
  next_followup_at DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  closed_at        TIMESTAMPTZ           -- se fija al pasar a ganado/perdido
);

CREATE INDEX IF NOT EXISTS crm_opportunities_org_stage_idx ON public.crm_opportunities(org_id, stage);
CREATE INDEX IF NOT EXISTS crm_opportunities_contact_idx   ON public.crm_opportunities(contact_id);

ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "crm_opportunities_org_isolation" ON public.crm_opportunities
    USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))
    WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.crm_opportunities IS
  'Oportunidad de recompra/migración/nueva renta de un contacto del CRM, con producto objetivo (LTR/MTR/STR) y etapa de pipeline.';

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK
--   DROP TABLE IF EXISTS public.crm_opportunities;
--   DROP TABLE IF EXISTS public.crm_contacts;
-- ───────────────────────────────────────────────────────────────────────────
