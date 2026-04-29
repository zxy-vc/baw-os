-- =============================================================================
-- Sprint 3 · S1 — Parte 1/2 — Agregar valores pm_* al enum member_role
-- =============================================================================
-- Postgres no permite usar un enum value recién agregado en la misma transacción
-- donde se hizo ADD VALUE. Por eso esta migración va separada de la siguiente.
--
-- Los valores antiguos (owner, admin, operator, viewer, agent) quedan en el
-- enum sin uso post-wipe (deuda menor aceptable; PG no permite DROP VALUE).
-- =============================================================================

ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'pm_owner';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'pm_admin';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'pm_operator';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'pm_viewer';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'client';
