# Tenant Intake — Spec Técnico
*Generado: 04-abr-2026 | Andrés Guardado*

---

## Arquitectura

```
(public)/apply/[unit_id]     → Form público multi-step (inquilino)
/admin/applications          → Vista interna Maribel (revisar + generar contrato)
/admin/applications/[id]     → Expediente detallado + trigger Mifiel
```

---

## 5 Tipos de Contrato

| Tipo | Caso | Titulares | Avales | Especial |
|------|------|-----------|--------|---------|
| A | Individual / Familia directa | 1-2 | 1 tercero | — |
| B | Roomies / Coarrendatarios | 2-4 (todos firman) | 1 por titular o compartido | clausula_solidaridad |
| C | Corporativo / Empresa | 1 empresa (rep. legal) | Empresa matriz o apoderado | ocupantes_autorizados, monto variable |
| D | Familia + Tercero Pagador | 1-2 | Pagador o familia | responsabilidades_tercero |
| E | Institucional | 1 institución | Institución matriz o fiador | uso_inmueble, renta preferencial |

---

## Variables Globales (todos los contratos)

```
{nombre_depto}           // D102, D201, etc.
{ubicacion_calle}        // Adolfo López Mateos 809
{area_m2}
{bedrooms}
{bathrooms}
{amenities}
{fecha_inicio}
{fecha_fin}
{monto_renta}
{deposit_monto}
{agua_basura}
{penalizacion_rescision}
{clausula_inpc}
{metodo_pago}
{dia_pago}
{nombre_arrendador}      // ZXY Ventures SAPI
{rfc_arrendador}         // ZVE2205196I9
```

---

## Variables por Tipo

### Tipo A — Individual
```
{nombre_titular}, {curp}, {rfc}
{nombre_aval}, {relacion_aval}
{domicilio}, {metodo_pago}, {dia_pago}
```

### Tipo B — Roomies
```
{nombre_coarrendatario_1..4}, {curp_1..4}
{nombre_aval_1..4}, {relacion_aval_1..4}
{clausula_solidaridad}  // bool
{monto_renta_total}, {monto_por_persona}
```

### Tipo C — Corporativo
```
{nombre_empresa}, {rfc_empresa}, {domicilio_fiscal}
{nombre_rep_legal}, {curp_rep_legal}, {cargo}
{ocupantes_autorizados}  // JSONB: lista + max
{monto_base}, {variable_por_persona}
{responsabilidad_daños}  // empresa | empleados | compartida
```

### Tipo D — Tercero Pagador
```
{nombre_titular}, {curp_titular}
{nombre_tercero_pagador}, {curp_tercero}, {relacion}
{responsabilidades_tercero}  // solo_pago | mantenimiento | total
{desglose_pagos}
```

### Tipo E — Institucional
```
{nombre_institucion}, {registro_publico}
{nombre_representante_legal}, {cargo}
{uso_inmueble}  // culto | educativo | asistencial
{monto_renta_preferencial}
```

---

## Schema Supabase — tenant_applications

```sql
CREATE TABLE tenant_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  unit_id uuid REFERENCES units(id),
  contract_type text CHECK (contract_type IN ('A','B','C','D','E')),
  status text DEFAULT 'draft' CHECK (status IN ('draft','submitted','reviewing','approved','rejected')),
  
  -- Titular(es) — JSONB para soportar 1-4
  titulares jsonb NOT NULL DEFAULT '[]',
  -- Cada titular: {nombre, curp, rfc, ine_front_url, ine_back_url, 
  --               domicilio, estado_civil, nacionalidad, birth_date,
  --               emergency_phone, income_proof_url}
  
  -- Aval(es) — JSONB
  avales jsonb NOT NULL DEFAULT '[]',
  -- Cada aval: {nombre, rfc, curp, domicilio, ine_url, 
  --            domicilio_proof_url, phone, relacion}
  
  -- Datos contrato
  clausula_solidaridad boolean,
  clausula_inpc text,
  uso_inmueble text,
  penalizacion_rescision text,
  inventario_checklist jsonb,
  
  -- Datos empresa (Tipo C/E)
  empresa jsonb,
  -- {nombre, rfc, domicilio_fiscal, rep_legal_nombre, rep_legal_curp, 
  --  cargo, ocupantes_autorizados, registro_publico}
  
  -- Tercero pagador (Tipo D)
  tercero_pagador jsonb,
  -- {nombre, curp, relacion, responsabilidades, desglose_pagos}
  
  -- Metadatos
  token text UNIQUE,  -- link único para el inquilino
  submitted_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

## Flujo completo

1. Maribel/Alicia crea `tenant_application` → genera `token` único
2. Link: `baw-os.vercel.app/apply/[token]` → se manda al inquilino
3. Inquilino llena form multi-step + sube docs (Supabase Storage)
4. Status → `submitted`
5. Maribel ve expediente en `/admin/applications`
6. Revisa, aprueba → status `approved`
7. Sistema puebla template del contrato con variables → genera PDF
8. Envía a Mifiel para firma digital
9. Contrato firmado → se adjunta al `contract` en BaW OS

---

## Supabase Storage Buckets necesarios
- `tenant-docs/ine/`
- `tenant-docs/income/`
- `tenant-docs/domicilio/`
- `tenant-docs/aval/`

---

## Notas implementación
- Form público NO requiere auth (ruta en `(public)/`)
- Usar `token` UUID en la URL en vez de `unit_id` para mayor seguridad
- Pre-llenado para renovaciones: cargar datos del contrato activo al crear la application
- Tipo B requiere UI dinámica: agregar/quitar coarrendatarios (max 4)
- Tipo C/E: campos de empresa en vez de persona física

*Bloqueador pendiente: template Word/PDF de Maribel para mapear variables exactas al documento final*
