-- BaW OS — Sprint 5A MVP: Alicia y Hugo pasan de 'planned' a 'beta'
-- Son los dos únicos agentes third-party del MVP: Alicia opera Mateos 809P,
-- Hugo la supervisa en modo solo-lectura. El resto del catálogo (nativos y
-- otros ZXY) permanece 'planned' y oculto de la UI.
--
-- Aditiva e idempotente. Rollback:
--   UPDATE public.agents SET status = 'planned' WHERE id IN ('alicia-ops','hugo-cos');

UPDATE public.agents
SET status = 'beta'
WHERE id IN ('alicia-ops', 'hugo-cos')
  AND status = 'planned';
