-- BaW OS — BAW-18 Fase B: etiqueta 'void' en payment_status (cargo anulado por corte).
--
-- La Fase B (docs/audits/BAW-18-fase-b.sql) anula cargos generados para meses que
-- BaW OS no administró, sin borrarlos (nunca DELETE). En prod `payments.status` es
-- el ENUM payment_status (Q0 de BAW-18, 15-oct-2026), y en el esquema documentado
-- sus etiquetas son pending/paid/late/partial/waived (docs/schema.sql:113): no
-- existe 'void'.
--
-- Aditiva e idempotente; mismo patrón defensivo que
-- 20260615_contract_status_en_renovacion.sql. Si la columna fuera TEXT, no hace nada.
-- Se aplica SOLA y ANTES del script de la Fase B: un valor nuevo de ENUM no se
-- puede usar en la misma transacción que lo agrega.
--
-- Rollback: no hay (Postgres no quita valores de un ENUM). Una etiqueta sin uso
-- es inocua.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'void';
  END IF;
END
$$;
