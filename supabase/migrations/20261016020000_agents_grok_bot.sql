-- BaW OS — BAW-11: Grok Bot entra al catálogo de agentes
--
-- Grok Bot (xAI) no tiene API pública; se conecta a BaW OS como servidor MCP
-- remoto (POST /api/mcp) con una credencial sk_live_ propia. Este registro solo
-- da de alta la identidad para poder emitirle credenciales en
-- /agents/grok-bot/credentials y auditar sus runs/acciones (FK de
-- agent_credentials, agent_runs, agent_actions y agent_policies).
--
-- No se siembra agent_policies: sin política el clasificador usa autonomía L1,
-- o sea que TODA escritura de Grok Bot queda pendiente de aprobación de Fran
-- hasta que Fran decida subirla en /agents/grok-bot/policies.
--
-- Aditiva e idempotente. Rollback (solo si no hay credenciales ni runs):
--   DELETE FROM public.agents WHERE id = 'grok-bot';

BEGIN;

INSERT INTO public.agents (
  id, display_name, full_name, family, domain, description,
  capability_level, feedback_level, status, is_shared_zxy,
  is_connectable, role_label
) VALUES (
  'grok-bot', 'Grok Bot', 'Grok Bot',
  'third-party', 'ops',
  'Asistente personal de Fran en Grok (xAI). Opera BaW OS vía el servidor MCP /api/mcp con los scopes de su credencial; las escrituras pasan por el clasificador y las sensibles esperan aprobación de Fran.',
  1, 0, 'beta', false,
  true, 'Asistente de Fran · vía MCP'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  full_name = EXCLUDED.full_name,
  family = EXCLUDED.family,
  domain = EXCLUDED.domain,
  description = EXCLUDED.description,
  is_shared_zxy = EXCLUDED.is_shared_zxy,
  is_connectable = EXCLUDED.is_connectable,
  role_label = EXCLUDED.role_label,
  updated_at = now();

COMMIT;
