// BaW OS — Admin (L0): editar un agente del catálogo
// PATCH /api/admin/agents/[id] — actualiza campos editables de un agente
//
// Solo Platform Admin (L0). Alcance V1: editar metadata + mostrar/ocultar
// (is_connectable). No crea ni elimina agentes (eso es una iteración aparte).

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { isPlatformAdmin } from '@/lib/platform-admin'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

const VALID_STATUS = ['planned', 'beta', 'live', 'paused', 'deprecated']

// Campos de texto editables: límite de longitud para evitar payloads abusivos.
const TEXT_FIELDS: { key: 'display_name' | 'full_name' | 'description' | 'role_label' | 'domain' | 'family'; max: number; nullable: boolean }[] = [
  { key: 'display_name', max: 60, nullable: false },
  { key: 'full_name', max: 80, nullable: false },
  { key: 'description', max: 400, nullable: true },
  { key: 'role_label', max: 80, nullable: true },
  { key: 'domain', max: 40, nullable: false },
  { key: 'family', max: 40, nullable: false },
]

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  if (!(await isPlatformAdmin())) {
    return NextResponse.json(
      { success: false, error: 'Platform admin required' },
      { status: 403 }
    )
  }

  const { id } = await ctx.params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}

  // Campos de texto
  for (const f of TEXT_FIELDS) {
    if (!(f.key in body)) continue
    const raw = body[f.key]
    if (raw === null && f.nullable) {
      update[f.key] = null
      continue
    }
    if (typeof raw !== 'string') {
      return NextResponse.json({ success: false, error: `${f.key} must be a string` }, { status: 400 })
    }
    const val = raw.trim()
    if (!f.nullable && val.length === 0) {
      return NextResponse.json({ success: false, error: `${f.key} no puede estar vacío` }, { status: 400 })
    }
    if (val.length > f.max) {
      return NextResponse.json({ success: false, error: `${f.key} excede ${f.max} caracteres` }, { status: 400 })
    }
    // role_label/description vacíos → null (limpia el campo)
    update[f.key] = f.nullable && val.length === 0 ? null : val
  }

  // capability_level / feedback_level (enteros 0-5)
  for (const k of ['capability_level', 'feedback_level'] as const) {
    if (!(k in body)) continue
    const n = body[k]
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 5) {
      return NextResponse.json({ success: false, error: `${k} debe ser un entero entre 0 y 5` }, { status: 400 })
    }
    update[k] = n
  }

  // status (enum)
  if ('status' in body) {
    if (typeof body.status !== 'string' || !VALID_STATUS.includes(body.status)) {
      return NextResponse.json(
        { success: false, error: `status inválido (válidos: ${VALID_STATUS.join(', ')})` },
        { status: 400 }
      )
    }
    update.status = body.status
  }

  // is_connectable (boolean)
  if ('is_connectable' in body) {
    if (typeof body.is_connectable !== 'boolean') {
      return NextResponse.json({ success: false, error: 'is_connectable debe ser booleano' }, { status: 400 })
    }
    update.is_connectable = body.is_connectable
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: false, error: 'Nada que actualizar' }, { status: 400 })
  }

  update.updated_at = new Date().toISOString()

  const service = createServiceClient()
  const { data, error } = await service
    .from('agents')
    .update(update)
    .eq('id', id)
    .select(
      'id, display_name, full_name, family, domain, description, role_label, capability_level, feedback_level, status, is_connectable, is_shared_zxy, updated_at'
    )
    .maybeSingle()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ success: false, error: 'Agente no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ success: true, data })
}
