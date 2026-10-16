-- BaW OS — BAW-26: Hugo reemplaza a Alicia como agente operador del 809.
--
-- Fran apagó a Alicia (alicia-ops). El agente conectado pasa a ser Hugo
-- (hugo-cos), ya no como supervisor de solo lectura sino como operador: Fran le
-- habla desde el chat in-app (y Discord) y Hugo opera BaW OS vía /api/v1/* con
-- su credencial (preset «operador», ver src/lib/agents/roster.ts).
--
-- NO borra nada: runs, approvals, acciones, interacciones y conversaciones de
-- Alicia se conservan (FKs ON DELETE RESTRICT intactas). Solo:
--   1. agents.status admite 'retired'.
--   2. Hugo → «Agente operador del 809», beta, conectable.
--   3. Alicia → 'retired', no conectable (ya no se le emiten credenciales).
--   4. Credenciales activas de Alicia → revocadas (nadie debe operar con ellas).
--   5. Interacciones de Alicia aún pendientes → 'failed' con motivo, para que el
--      chat no se quede "esperando" para siempre.
--
-- Aditiva e idempotente. Rollback (manual):
--   UPDATE public.agents SET status = 'beta', is_connectable = true,
--     role_label = 'Operadora · Mateos 809P' WHERE id = 'alicia-ops';
--   UPDATE public.agents SET role_label = 'Supervisor de Alicia · solo lectura',
--     description = 'Chief of Staff ZXY — coordinación cross-vc' WHERE id = 'hugo-cos';
--   (las credenciales revocadas no se reactivan: emitir una nueva si hiciera falta)
--   ALTER TABLE public.agents DROP CONSTRAINT agents_status_check;
--   ALTER TABLE public.agents ADD CONSTRAINT agents_status_check
--     CHECK (status IN ('planned','beta','live','paused','deprecated'));

BEGIN;

-- 1. Nuevo status 'retired' (el CHECK inline de 20260429_06 se llama agents_status_check).
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_status_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_status_check
  CHECK (status IN ('planned','beta','live','paused','deprecated','retired'));

-- 2. Hugo: agente operador del 809.
UPDATE public.agents
SET role_label     = 'Agente operador del 809',
    description    = 'Opera BaW OS para el 809: Fran le pide cosas desde el chat de la app o Discord y Hugo las registra vía API v1. Las aprobaciones las resuelve solo Fran.',
    status         = 'beta',
    is_connectable = true,
    updated_at     = now()
WHERE id = 'hugo-cos';

-- 3. Alicia: retirada (sin borrar historial).
UPDATE public.agents
SET status         = 'retired',
    is_connectable = false,
    role_label     = 'Retirada · solo historial',
    updated_at     = now()
WHERE id = 'alicia-ops';

-- 4. Sus credenciales activas se revocan (no se borran: quedan en auditoría).
UPDATE public.agent_credentials
SET status     = 'revoked',
    revoked_at = now()
WHERE agent_id = 'alicia-ops'
  AND status = 'active';

-- 5. Interacciones pendientes de Alicia: cerradas como fallidas con motivo.
UPDATE public.agent_interactions
SET status       = 'failed',
    error        = 'Alicia fue retirada (BAW-26). Repite la solicitud con Hugo.',
    completed_at = now()
WHERE agent_id = 'alicia-ops'
  AND status IN ('received', 'processing', 'deferred');

COMMIT;
