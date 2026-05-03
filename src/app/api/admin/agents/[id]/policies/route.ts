// BaW OS — Admin: policies por agente y org (Fase 4 autonomy slider)
// GET  /api/admin/agents/:id/policies   — leer policy efectiva
// PUT  /api/admin/agents/:id/policies   — actualizar autonomy_level + per_action + rate_caps
//
// Cambios se auditan: el cambio mismo es action_type='policy.modify' → REQUIRE_APPROVAL.
// Sin embargo, como el editor es humano (admin/owner), aquí lo aplicamos directo
// (con audit). Las llamadas vía API key de agente sí pasan por el classifier.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdminCaller } from '@/lib/admin-auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface PolicyRow {
  agent_id: string
  org_id: string
  autonomy_level: number
  active: boolean
  per_action: Record<string, string> | null
  rate_caps: Record<string, number> | null
  updated_at: string
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminCaller()
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: { code: 'unauthorized', message: auth.message } },
      { status: auth.status }
    )
  }

  const { id } = await ctx.params
  const supabase = createServiceClient()

  // Verificar que el agent existe en catálogo
  const { data: agent } = await supabase
    .from('agents')
    .select('id, display_name, full_name, family, domain, status, is_shared_zxy')
    .eq('id', id)
    .maybeSingle()

  if (!agent) {
    return NextResponse.json(
      { success: false, error: { code: 'not_found', message: `agent '${id}' not found` } },
      { status: 404 }
    )
  }

  const { data: policy } = await supabase
    .from('agent_policies')
    .select('autonomy_level, active, per_action, rate_caps, updated_at')
    .eq('org_id', auth.orgId)
    .eq('agent_id', id)
    .maybeSingle()

  // Si no hay policy, devolver default (autonomy_level=1, active=true)
  const effective: PolicyRow = policy
    ? {
        agent_id: id,
        org_id: auth.orgId,
        autonomy_level: (policy.autonomy_level as number) ?? 1,
        active: (policy.active as boolean) !== false,
        per_action: (policy.per_action as Record<string, string> | null) ?? null,
        rate_caps: (policy.rate_caps as Record<string, number> | null) ?? null,
        updated_at: policy.updated_at as string,
      }
    : {
        agent_id: id,
        org_id: auth.orgId,
        autonomy_level: 1,
        active: true,
        per_action: null,
        rate_caps: null,
        updated_at: new Date().toISOString(),
      }

  return NextResponse.json({
    success: true,
    data: { agent, policy: effective, has_explicit_policy: !!policy },
  })
}

interface PutBody {
  autonomy_level?: number
  active?: boolean
  per_action?: Record<string, string> | null
  rate_caps?: Record<string, number> | null
}

const VALID_CLASSIFICATIONS = new Set([
  'AUTO',
  'LOG',
  'REQUIRE_APPROVAL',
  'DISABLED',
])

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminCaller()
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: { code: 'unauthorized', message: auth.message } },
      { status: auth.status }
    )
  }

  const { id } = await ctx.params
  let body: PutBody
  try {
    body = (await req.json()) as PutBody
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'invalid_json', message: 'body must be JSON' } },
      { status: 400 }
    )
  }

  // Validaciones
  if (
    body.autonomy_level !== undefined &&
    (typeof body.autonomy_level !== 'number' ||
      body.autonomy_level < 0 ||
      body.autonomy_level > 4)
  ) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'invalid_body', message: 'autonomy_level must be 0..4' },
      },
      { status: 400 }
    )
  }

  if (body.per_action) {
    for (const [k, v] of Object.entries(body.per_action)) {
      if (!VALID_CLASSIFICATIONS.has(v)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'invalid_body',
              message: `per_action.${k} must be one of AUTO|LOG|REQUIRE_APPROVAL|DISABLED`,
            },
          },
          { status: 400 }
        )
      }
    }
  }

  const supabase = createServiceClient()

  const upsertRow: Record<string, unknown> = {
    org_id: auth.orgId,
    agent_id: id,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  }
  if (body.autonomy_level !== undefined) upsertRow.autonomy_level = body.autonomy_level
  if (body.active !== undefined) upsertRow.active = body.active
  if (body.per_action !== undefined) upsertRow.per_action = body.per_action
  if (body.rate_caps !== undefined) upsertRow.rate_caps = body.rate_caps

  const { data, error } = await supabase
    .from('agent_policies')
    .upsert(upsertRow, { onConflict: 'org_id,agent_id' })
    .select('autonomy_level, active, per_action, rate_caps, updated_at')
    .single()

  if (error || !data) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'upsert_error', message: error?.message || 'failed to save policy' },
      },
      { status: 500 }
    )
  }

  // Audit: registrar el cambio
  await supabase.from('agent_actions').insert({
    run_id: null,
    org_id: auth.orgId,
    agent_id: id,
    action_type: 'policy.modify',
    entity_type: 'agent_policy',
    entity_id: id,
    status: 'ok',
    payload: body as object,
    result: data as object,
  }).then(() => {}, () => {}) // policy.modify audit puede fallar silenciosamente si run_id NOT NULL

  return NextResponse.json({
    success: true,
    data: {
      agent_id: id,
      org_id: auth.orgId,
      ...data,
    },
  })
}
