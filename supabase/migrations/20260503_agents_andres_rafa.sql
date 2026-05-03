-- BaW OS — Sembrar agentes ZXY faltantes: Andrés-CTO y Rafa-Research
-- Definidos en docs/AGENT_ROSTER.md, mencionados en Notion master doc.

BEGIN;

INSERT INTO public.agents (
  id, display_name, full_name, family, domain, description,
  capability_level, feedback_level, status, is_shared_zxy
) VALUES
  (
    'andres-cto', 'Andrés-CTO', 'Agente Andrés-CTO',
    'third-party', 'tech',
    'CTO OpenClaw — coordinación técnica cross-platform BaW ↔ OpenClaw ↔ ZXY',
    0, 0, 'planned', true
  ),
  (
    'rafa-research', 'Rafa-Research', 'Agente Rafa-Research',
    'third-party', 'research',
    'Customer development y síntesis competitiva. Read-only respecto al sistema operativo.',
    0, 0, 'planned', true
  )
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  full_name = EXCLUDED.full_name,
  family = EXCLUDED.family,
  domain = EXCLUDED.domain,
  description = EXCLUDED.description,
  is_shared_zxy = EXCLUDED.is_shared_zxy;

COMMIT;
