-- BaW OS — Fase 3b: ocupantes por estancia (rotación).
--
-- Una estancia (contrato o reservación) puede tener VARIOS ocupantes y rotar en
-- el tiempo (distinta gente en distintas semanas). El que paga (contracts
-- .payer_occupant_id, Fase 2b) puede ser ≠ de los que ocupan. Esto modela "la
-- empresa firma, los empleados ocupan y rotan".
--
-- Tabla polimórfica: cuelga de UN contrato O de UNA reservación (no hay tabla
-- `stays` unificada todavía; eso es Fase 3c). occupant_id apunta al Party
-- (occupants). Idempotente, no destructiva.

CREATE TABLE IF NOT EXISTS public.stay_occupants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE CASCADE,
  occupant_id uuid NOT NULL REFERENCES public.occupants(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'ocupante',
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Exactamente un padre: contrato XOR reservación.
  CONSTRAINT stay_occupants_one_parent CHECK (
    (contract_id IS NOT NULL AND reservation_id IS NULL) OR
    (contract_id IS NULL AND reservation_id IS NOT NULL)
  ),
  CONSTRAINT stay_occupants_role_check CHECK (role IN ('titular', 'ocupante', 'dependiente')),
  -- Una misma persona no se repite en la misma estancia.
  CONSTRAINT stay_occupants_unique_contract UNIQUE (contract_id, occupant_id),
  CONSTRAINT stay_occupants_unique_reservation UNIQUE (reservation_id, occupant_id)
);

CREATE INDEX IF NOT EXISTS idx_stay_occupants_contract
  ON public.stay_occupants (contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stay_occupants_reservation
  ON public.stay_occupants (reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stay_occupants_occupant
  ON public.stay_occupants (occupant_id);

-- RLS: mismo patrón que el resto (miembros de la org).
ALTER TABLE public.stay_occupants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stay_occupants_member ON public.stay_occupants;
CREATE POLICY stay_occupants_member ON public.stay_occupants FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = stay_occupants.org_id AND om.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = stay_occupants.org_id AND om.user_id = auth.uid()
  ));
