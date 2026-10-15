-- BaW OS — Fix: agregar 'en_renovacion' al enum contract_status.
--
-- BUG: el código usa status='en_renovacion' (contracts/page.tsx, renovación,
-- alertas) y la migración 20260330_contracts_legal.sql afirma que es "valid
-- value" pero NUNCA lo agregó al tipo. Si la columna sigue siendo el ENUM
-- contract_status, cualquier UPDATE a 'en_renovacion' falla (invalid input
-- value for enum). Esto rompe el flujo de renovación de contratos.
--
-- Defensivo: solo actúa si el tipo enum existe (si la columna ya fue convertida
-- a TEXT en prod, no hay nada que hacer y este bloque no falla). ADD VALUE IF
-- NOT EXISTS es idempotente.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_status') THEN
    ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'en_renovacion';
  END IF;
END
$$;
