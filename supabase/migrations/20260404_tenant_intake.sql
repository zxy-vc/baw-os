-- Tenant Intake — aplicaciones de inquilinos para generar contratos
-- BaW OS · 2026-04-04

CREATE TABLE IF NOT EXISTS tenant_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL DEFAULT 'baw',
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  contract_type text CHECK (contract_type IN ('A','B','C','D','E')),
  status text DEFAULT 'draft' CHECK (status IN ('draft','submitted','reviewing','approved','rejected')),
  token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),

  -- Titular(es) como JSONB (soporta 1-4 personas)
  titulares jsonb NOT NULL DEFAULT '[]',

  -- Aval(es) como JSONB
  avales jsonb NOT NULL DEFAULT '[]',

  -- Datos del contrato
  contract_data jsonb DEFAULT '{}',
  -- includes: clausula_solidaridad, clausula_mascotas, clausula_inpc,
  --           uso_inmueble, penalizacion_rescision, inventario_checklist,
  --           estado_amueblado, cajones, deposito_monto, metodo_pago, dia_pago

  -- Empresa (Tipo C/E)
  empresa jsonb,

  -- Tercero pagador (Tipo D)
  tercero_pagador jsonb,

  -- Documentos subidos (URLs a Supabase Storage)
  docs jsonb DEFAULT '{}',
  -- keys: ine_front, ine_back, income_proof, domicilio_proof,
  --       aval_ine, aval_domicilio_proof

  -- Metadatos
  submitted_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE tenant_applications ENABLE ROW LEVEL SECURITY;

-- Service role acceso completo
CREATE POLICY "service_role_intake" ON tenant_applications
  FOR ALL TO service_role USING (true);

-- Anon puede leer por token (para pre-llenado del form público)
CREATE POLICY "anon_read_by_token" ON tenant_applications
  FOR SELECT TO anon USING (true);

-- Anon puede actualizar por token (para envío del form público)
CREATE POLICY "anon_update_by_token" ON tenant_applications
  FOR UPDATE TO anon USING (true);
