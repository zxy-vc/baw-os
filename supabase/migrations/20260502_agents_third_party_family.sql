-- BaW OS — Agents family taxonomy update
-- Decisión Fran 2026-05-02: el modelo correcto es 3 categorías
--   - baw-coord     · BaW Coordinador (orquestador raíz)
--   - pm-ops        · PM Operations (agentes nativos del producto)
--   - third-party   · Third Party Operations (agentes externos conectables; ZXY entra aquí)
--
-- Los agentes ZXY se mueven de family='zxy-shared' a family='third-party'.
-- El flag is_shared_zxy se mantiene para identificar específicamente los
-- de ZXY (subset de third-party).

UPDATE public.agents
SET family = 'third-party'
WHERE family = 'zxy-shared';

-- Asegura que cualquier agente con is_shared_zxy=true esté en third-party
UPDATE public.agents
SET family = 'third-party'
WHERE is_shared_zxy = true AND family != 'third-party';
