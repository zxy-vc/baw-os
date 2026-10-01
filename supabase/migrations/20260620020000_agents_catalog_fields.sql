-- BaW OS — Catálogo de agentes editable / autoservicio desde el admin L0.
--
-- Agrega dos columnas a `agents`:
--   is_connectable — controla qué agentes se muestran en /agents (y a los que
--     se les pueden emitir credenciales). Reemplaza el hardcode MVP_AGENT_IDS
--     que vivía en src/app/agents/page.tsx.
--   role_label     — línea de rol que se muestra en la tarjeta del agente
--     (p.ej. "Operadora"). Reemplaza el hardcode MVP_AGENT_ROLES.
--
-- Editable solo por Platform Admin (L0): la RLS existente `agents_write_platform`
-- ya restringe la escritura de esta tabla a platform_admins, así que no hace
-- falta tocar políticas.
--
-- Aditiva e idempotente.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS is_connectable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS role_label TEXT;

-- Preserva el comportamiento actual de la UI: Alicia + Hugo son los dos agentes
-- conectables del MVP. Se siembran con los textos actuales; a partir de aquí son
-- editables desde /admin/agents.
UPDATE public.agents
SET is_connectable = true,
    role_label = 'Operadora · Mateos 809P'
WHERE id = 'alicia-ops';

UPDATE public.agents
SET is_connectable = true,
    role_label = 'Supervisor de Alicia · solo lectura'
WHERE id = 'hugo-cos';
