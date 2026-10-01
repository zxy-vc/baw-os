-- S4-3: Infra común agentes BaW OS — 10+1 agentes ZXY
-- Tablas: agents (catálogo), agent_runs (ejecuciones), agent_actions (efectos auditables)
-- BaW = Building Always Working (coordinador, no es uno de los 10)

-- Catálogo de agentes ZXY
CREATE TABLE IF NOT EXISTS public.agents (
  id TEXT PRIMARY KEY,                -- slug estable: 'cobranza', 'hugo-cos', etc.
  display_name TEXT NOT NULL,         -- 'Cobranza' (sin "Agente" prefix)
  full_name TEXT NOT NULL,            -- 'Agente Cobranza' for UI labels
  family TEXT NOT NULL,               -- 'pm-ops' | 'zxy-shared' | 'baw-coord'
  domain TEXT NOT NULL,               -- 'finanzas' | 'ops' | 'legal' | etc.
  description TEXT,
  capability_level INT NOT NULL DEFAULT 0,  -- L0-L4 (autonomy framework)
  feedback_level INT NOT NULL DEFAULT 0,    -- F0-F5 (feedback maturity)
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','beta','live','paused','deprecated')),
  is_shared_zxy BOOLEAN NOT NULL DEFAULT false,  -- agentes ZXY no tienen L0
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ejecuciones de agentes (1 run = 1 invocación, manual o cron)
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('manual','cron','webhook','agent')),
  triggered_by_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','partial','canceled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb  -- {actions_total, actions_ok, actions_failed, ...}
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_org_started ON public.agent_runs(org_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_started ON public.agent_runs(agent_id, started_at DESC);

-- Acciones individuales que un run produjo (auditables granular)
CREATE TABLE IF NOT EXISTS public.agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES public.agents(id),
  action_type TEXT NOT NULL,          -- 'mora.notify' | 'email.send' | 'task.create' | etc.
  entity_type TEXT,
  entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','failed','skipped','pending_approval')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_actions_run ON public.agent_actions(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_actions_org_agent ON public.agent_actions(org_id, agent_id, created_at DESC);

-- RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;

-- Catálogo agents: legible por todo usuario autenticado, escritura solo platform admin
DROP POLICY IF EXISTS agents_select_all ON public.agents;
CREATE POLICY agents_select_all ON public.agents FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS agents_write_platform ON public.agents;
CREATE POLICY agents_write_platform ON public.agents FOR ALL
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- agent_runs: visible para miembros del tenant
DROP POLICY IF EXISTS agent_runs_select ON public.agent_runs;
CREATE POLICY agent_runs_select ON public.agent_runs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = agent_runs.org_id AND om.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);

DROP POLICY IF EXISTS agent_runs_write_member ON public.agent_runs;
CREATE POLICY agent_runs_write_member ON public.agent_runs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = agent_runs.org_id AND om.user_id = auth.uid())
);

DROP POLICY IF EXISTS agent_runs_update_member ON public.agent_runs;
CREATE POLICY agent_runs_update_member ON public.agent_runs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = agent_runs.org_id AND om.user_id = auth.uid())
);

-- agent_actions: idem
DROP POLICY IF EXISTS agent_actions_select ON public.agent_actions;
CREATE POLICY agent_actions_select ON public.agent_actions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = agent_actions.org_id AND om.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);

DROP POLICY IF EXISTS agent_actions_write ON public.agent_actions;
CREATE POLICY agent_actions_write ON public.agent_actions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = agent_actions.org_id AND om.user_id = auth.uid())
);

-- Seed catálogo 10 + 1 agentes (BaW coordinador + 10 especializados)
-- Familia pm-ops: 4 agentes específicos del PM
-- Familia zxy-shared: 6 agentes ZXY (sin L0, compartidos entre tenants ZXY)
INSERT INTO public.agents (id, display_name, full_name, family, domain, description, capability_level, feedback_level, status, is_shared_zxy)
VALUES
  ('baw',         'BaW',        'BaW',                  'baw-coord',  'coord',     'Coordinador Building Always Working — orquestador raíz',                  1, 1, 'beta',    false),
  ('cobranza',    'Cobranza',   'Agente Cobranza',      'pm-ops',     'finanzas',  'Dunning automatizado: detecta mora, escala niveles, notifica',           1, 1, 'beta',    false),
  ('reservas',    'Reservas',   'Agente Reservas',      'pm-ops',     'ops',       'Channex sync, disponibilidad, pricing dinámico',                          0, 0, 'planned', false),
  ('mantenimiento','Mantenimiento','Agente Mantenimiento','pm-ops',   'ops',       'Tareas, vendors, SLA en unidades',                                        0, 0, 'planned', false),
  ('huesped',     'Huésped',    'Agente Huésped',       'pm-ops',     'cx',        'Onboarding, check-in, soporte huésped',                                   0, 0, 'planned', false),
  ('hugo-cos',    'Hugo-COS',   'Agente Hugo-COS',      'zxy-shared', 'ops',       'Chief of Staff ZXY — coordinación cross-vc',                              0, 0, 'planned', true),
  ('alicia-ops',  'Alicia-Ops', 'Agente Alicia-Ops',    'zxy-shared', 'ops',       'Operaciones internas ZXY',                                                0, 0, 'planned', true),
  ('conta-beto',  'Conta-Beto', 'Agente Conta-Beto',    'zxy-shared', 'finanzas',  'Contabilidad, conciliación, facturación CFDI',                            0, 0, 'planned', true),
  ('maribel-law', 'Maribel-Law','Agente Maribel-Law',   'zxy-shared', 'legal',     'Legal: contratos, NDA, cumplimiento',                                     0, 0, 'planned', true),
  ('luis-growth', 'Luis-Growth','Agente Luis-Growth',   'zxy-shared', 'growth',    'Growth, marketing, captación',                                            0, 0, 'planned', true),
  ('andres-tech', 'Andres-Tech','Agente Andres-Tech',   'zxy-shared', 'tech',      'Plataforma, infra, build siempre verde',                                  0, 0, 'planned', true)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  full_name = EXCLUDED.full_name,
  family = EXCLUDED.family,
  domain = EXCLUDED.domain,
  description = EXCLUDED.description,
  is_shared_zxy = EXCLUDED.is_shared_zxy,
  updated_at = now();

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agents_updated_at ON public.agents;
CREATE TRIGGER trg_agents_updated_at BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.touch_agents_updated_at();
