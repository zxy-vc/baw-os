-- BaW OS — Roster de Agentes v0.2 (Notion canónico)
-- Reestructura para alinear con "BaW OS — Roster de Agentes y Arquitectura del Workforce" v0.2
-- 3 escuadrones (Operaciones Core / Experiencia / Inteligencia) + BaW Coordinador + Third Party
-- Total: 10 + 1 especialistas + 6 third-party

BEGIN;

-- 1. Reasignar agentes existentes según escuadrón canónico
-- Cobranza y Mantenimiento -> Operaciones Core
UPDATE agents SET family = 'ops-core' WHERE id IN ('cobranza', 'mantenimiento');

-- Reservas -> Experiencia (canónico)
UPDATE agents SET family = 'experiencia' WHERE id = 'reservas';

-- Huésped -> renombrar a Atención (canónico v0.2) y mover a Experiencia
UPDATE agents SET
  id = 'atencion',
  display_name = 'Atención',
  full_name = 'Agente Atención',
  family = 'experiencia',
  domain = 'cx',
  description = 'Comunicación 24/7 con residentes y huéspedes. FAQs, anuncios, surveys, manejo de quejas no críticas.'
WHERE id = 'huesped';

-- 2. Sembrar agentes faltantes del roster v0.2
INSERT INTO agents (id, display_name, full_name, family, domain, description, capability_level, feedback_level, status, is_shared_zxy)
VALUES
  -- Operaciones Core (3)
  ('facturacion', 'Facturación', 'Agente Facturación', 'ops-core', 'finanzas',
   'CFDI 4.0 vía PAC, conciliación bancaria, recibos electrónicos. Moat regulatorio LATAM.',
   1, 1, 'planned', false),

  -- Experiencia (4) — Atención y Reservas ya existen
  ('tarifas', 'Tarifas', 'Agente Tarifas', 'experiencia', 'revenue',
   'Dynamic pricing STR/MTR. Optimización por temporada, eventos locales, ocupación, FX.',
   1, 1, 'planned', false),
  ('renovaciones', 'Renovaciones', 'Agente Renovaciones', 'experiencia', 'cx',
   'Outreach 60/30/15 días pre-vencimiento, propuestas de renovación con pricing actualizado.',
   1, 1, 'planned', false),

  -- Inteligencia (3)
  ('reportes', 'Reportes', 'Agente Reportes', 'inteligencia', 'analytics',
   'Dashboards de propietario, narrativa LLM, briefings. Síntesis de KPIs y anomaly detection.',
   1, 1, 'planned', false),
  ('auditoria', 'Auditoría', 'Agente Auditoría', 'inteligencia', 'governance',
   'Audit trail inmutable, detección de anomalías operativas. Capa de governance interna.',
   1, 1, 'planned', false),
  ('fiscal', 'Fiscal', 'Agente Fiscal', 'inteligencia', 'compliance',
   'Validación CFDI/SAT, monitoreo regulatorio, verificación documental. LATAM tax compliance.',
   1, 1, 'planned', false)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  full_name = EXCLUDED.full_name,
  family = EXCLUDED.family,
  domain = EXCLUDED.domain,
  description = EXCLUDED.description;

-- 3. Verificación: 10 + 1 especialistas + 6 third-party = 17 totales
-- (1 baw-coord + 3 ops-core + 4 experiencia + 3 inteligencia + 6 third-party)

COMMIT;
