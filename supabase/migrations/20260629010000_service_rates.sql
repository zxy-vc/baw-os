-- BaW OS — Fase 1 servicios: tarifa de agua por edificio con historial.
--
-- El agua dejaba de ser un $250 hardcodeado: ahora es una TARIFA por edificio que
-- cambia en el tiempo (actualizaciones de precio). Cobros la resuelve al generar
-- cada cargo, así un cambio se aplica solo a todas las unidades del edificio, sin
-- tocar contratos. Tabla general (columna `service`) para reusar en luz/gas/
-- internet en Fase 2. Idempotente, no destructiva.

CREATE TABLE IF NOT EXISTS public.service_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  building_id uuid REFERENCES public.buildings(id) ON DELETE CASCADE, -- NULL = toda la org
  service text NOT NULL DEFAULT 'agua',
  amount numeric NOT NULL CHECK (amount >= 0),
  effective_from date NOT NULL, -- primer día del mes desde el que aplica
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_rates_lookup
  ON public.service_rates (org_id, service, building_id, effective_from DESC);

ALTER TABLE public.service_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_rates_member ON public.service_rates;
CREATE POLICY service_rates_member ON public.service_rates FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = service_rates.org_id AND om.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = service_rates.org_id AND om.user_id = auth.uid()
  ));
