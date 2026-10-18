-- BaW OS — Separar la fecha de facturación de la fecha real del contrato.
--
-- Caso: contratos viejos (2023/2024) que siguen vigentes mes a mes. Queremos
-- registrar su fecha REAL de inicio (historial, antigüedad, CRM) sin que Cobros
-- genere 2 años de adeudo no verificado. `billing_start_date` controla desde qué
-- mes se generan los cobros; si es NULL, se factura desde `start_date` (igual que
-- hoy). Aditiva, no destructiva.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS billing_start_date date;

COMMENT ON COLUMN public.contracts.billing_start_date IS
  'Mes desde el que Cobros genera cargos. NULL = desde start_date. Permite registrar la fecha real del contrato sin facturar todo el histórico.';
