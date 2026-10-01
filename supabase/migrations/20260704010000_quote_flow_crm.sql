-- BaW OS — Flujo de cotización telefónica + CRM mínimo viable.
--
-- User story (Fran, 2026-07-03): llamada → ver disponibilidad en calendario →
-- seleccionar fechas → cotizar → crear contacto CRM + oportunidad "cotizado" →
-- enviar propuesta → las fechas quedan apartadas 24-72h y se liberan solas.
-- Modelo: la cotización ES una reservación `tentative` con vencimiento; el
-- prospecto vive SOLO en CRM y se convierte en occupant al confirmar.
--
-- Cambios:
-- 1. reservations.hold_expires_at — vencimiento del apartado. Una tentativa
--    vencida deja de bloquear el sitio público automáticamente (sin cron).
-- 2. reservations.occupant_id — liga la reservación a la identidad durable
--    (hoy solo guarda texto); habilita historial de transacciones en CRM.
-- 3. crm_opportunities.temperature — frío/tibio/caliente.
-- 4. crm_opportunities.reservation_id — liga oportunidad ↔ cotización.
-- 5. Etapa 'cotizado' en el funnel.
-- 6. fn_unit_is_available + disponibilidad pública: tentativas vencidas NO
--    bloquean; unit_blocks (fase 3) SÍ bloquean (hueco detectado: los
--    bloqueos de mantenimiento no cerraban el booking público).
--
-- Idempotente, no destructiva.

-- ── 1-2. reservations ──────────────────────────────────────────────────────
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS occupant_id uuid REFERENCES public.occupants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_occupant
  ON public.reservations (occupant_id) WHERE occupant_id IS NOT NULL;

-- ── 3-4. crm_opportunities ─────────────────────────────────────────────────
ALTER TABLE public.crm_opportunities
  ADD COLUMN IF NOT EXISTS temperature text NOT NULL DEFAULT 'tibio'
    CHECK (temperature IN ('frio', 'tibio', 'caliente')),
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_reservation
  ON public.crm_opportunities (reservation_id) WHERE reservation_id IS NOT NULL;

-- ── 5. Etapa 'cotizado' en el funnel (entre interesado y negociación) ──────
ALTER TABLE public.crm_opportunities
  DROP CONSTRAINT IF EXISTS crm_opportunities_stage_check;
ALTER TABLE public.crm_opportunities
  ADD CONSTRAINT crm_opportunities_stage_check CHECK (
    stage IN ('identificado', 'contactado', 'interesado', 'cotizado', 'negociacion', 'ganado', 'perdido')
  );

-- ── 6. Disponibilidad pública ──────────────────────────────────────────────
-- Tentativas: bloquean solo mientras su hold esté vigente (o si no tienen
-- vencimiento, comportamiento previo). Bloqueos operativos: bloquean siempre
-- (end_date inclusivo → daterange '[]').
CREATE OR REPLACE FUNCTION public.fn_unit_is_available(
  p_unit_id uuid,
  p_from    date,
  p_to      date
) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.reservations
      WHERE unit_id = p_unit_id
        AND (
          status IN ('confirmed', 'checked_in')
          OR (
            status = 'tentative'
            AND (hold_expires_at IS NULL OR hold_expires_at > now())
          )
        )
        AND daterange(check_in, check_out, '[)') && daterange(p_from, p_to, '[)')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.reservation_holds
      WHERE unit_id   = p_unit_id
        AND expires_at > now()
        AND daterange(from_date, to_date, '[)') && daterange(p_from, p_to, '[)')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.unit_blocks
      WHERE unit_id = p_unit_id
        AND daterange(start_date, end_date, '[]') && daterange(p_from, p_to, '[)')
    );
$$;
