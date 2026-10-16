// BaW OS — Admin: gestión de credenciales por agente
// GET   /api/admin/agents/[id]/credentials              — listar (sin hash)
// POST  /api/admin/agents/[id]/credentials              — crear nueva (devuelve key plana 1 vez)
//        body: { label, scopes } o { label, preset: 'operador' } (scopes fijados en el servidor)
// DELETE /api/admin/agents/[id]/credentials?credential_id=... — revocar
//
// RLS protege a nivel DB; aquí además validamos que el caller sea owner/admin
// de la org activa o platform_admin.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { resolveOrgId, OrgContextError } from '@/lib/org-context'
import { createSupabaseServer } from '@/lib/supabase-server'
import { generateApiKey, hashApiKey } from '@/lib/agents/auth'
import type { AgentId } from '@/lib/agents/types'
import { ORG_ADMIN_ROLES } from '@/lib/admin-auth'
import { getScopePreset, isRetiredAgent, unknownScopes } from '@/lib/agents/roster'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function requireAdminCaller(): Promise<
  | { ok: true; userId: string; orgId: string; isPlatformAdmin: boolean }
  | { ok: false; status: number; message: string }
> {
  const supabase = createSupabaseServer()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    return { ok: false, status: 401, message: 'No authenticated user' }
  }

  const service = createServiceClient()
  const { data: pa } = await service
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const isPlatformAdmin = !!pa

  let orgId: string
  try {
    orgId = await resolveOrgId()
  } catch (e) {
    if (e instanceof OrgContextError) {
      return { ok: false, status: 401, message: e.message }
    }
    throw e
  }

  if (!isPlatformAdmin) {
    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!membership || !ORG_ADMIN_ROLES.includes(membership.role as string)) {
      return { ok: false, status: 403, message: 'Owner or admin role required' }
    }
  }

  return { ok: true, userId: user.id, orgId, isPlatformAdmin }
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const params = await ctx.params
  const agentId = params.id

  const auth = await requireAdminCaller()
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.message },
      { status: auth.status }
    )
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('v_agent_credentials_audit')
    .select('*')
    .eq('org_id', auth.orgId)
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, data: data || [] })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const params = await ctx.params
  const agentId = params.id as AgentId

  const auth = await requireAdminCaller()
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.message },
      { status: auth.status }
    )
  }

  let body: {
    label?: string
    scopes?: string[]
    preset?: string
    rate_limit_tier?: 'standard' | 'elevated' | 'unlimited'
    expires_in_days?: number | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const label = (body.label || '').trim()
  if (!label || label.length > 32) {
    return NextResponse.json(
      { success: false, error: 'label is required (1-32 chars)' },
      { status: 400 }
    )
  }
  // Preset (p.ej. 'operador'): el servidor fija los scopes exactos; no se
  // mezcla con una lista manual para que no haya ambigüedad sobre qué se emitió.
  let scopes: string[]
  if (body.preset !== undefined) {
    const preset = getScopePreset(body.preset)
    if (!preset) {
      return NextResponse.json(
        { success: false, error: `preset desconocido: ${String(body.preset)}` },
        { status: 400 }
      )
    }
    if (Array.isArray(body.scopes) && body.scopes.length > 0) {
      return NextResponse.json(
        { success: false, error: 'usa preset o scopes, no ambos' },
        { status: 400 }
      )
    }
    scopes = [...preset.scopes]
  } else {
    scopes = Array.isArray(body.scopes) ? body.scopes.filter((s) => typeof s === 'string') : []
  }
  // Solo scopes emitibles: approvals:resolve y '*' nunca salen de aquí.
  const rejected = unknownScopes(scopes)
  if (rejected.length > 0) {
    return NextResponse.json(
      { success: false, error: `scopes no permitidos: ${rejected.join(', ')}` },
      { status: 400 }
    )
  }
  const rateLimitTier = body.rate_limit_tier || 'standard'
  if (!['standard', 'elevated', 'unlimited'].includes(rateLimitTier)) {
    return NextResponse.json(
      { success: false, error: 'invalid rate_limit_tier' },
      { status: 400 }
    )
  }

  // Validar que el agente existe
  const service = createServiceClient()
  const { data: agent, error: agentErr } = await service
    .from('agents')
    .select('id, status')
    .eq('id', agentId)
    .maybeSingle()
  if (agentErr || !agent) {
    return NextResponse.json(
      { success: false, error: 'Agent not found' },
      { status: 404 }
    )
  }
  if (isRetiredAgent(agentId, (agent as { status?: string }).status)) {
    return NextResponse.json(
      { success: false, error: 'Este agente está retirado; no se le emiten credenciales nuevas' },
      { status: 409 }
    )
  }

  // Generar key + hash
  const { plainKey, prefix } = generateApiKey('live')
  const apiKeyHash = await hashApiKey(plainKey)

  const expiresAt = body.expires_in_days
    ? new Date(Date.now() + body.expires_in_days * 24 * 60 * 60 * 1000).toISOString()
    : null

  const { data: credential, error: insertErr } = await service
    .from('agent_credentials')
    .insert({
      org_id: auth.orgId,
      agent_id: agentId,
      label,
      api_key_hash: apiKeyHash,
      api_key_prefix: prefix,
      scopes,
      rate_limit_tier: rateLimitTier,
      expires_at: expiresAt,
      created_by: auth.userId,
    })
    .select('id, label, api_key_prefix, scopes, status, rate_limit_tier, expires_at, created_at')
    .single()

  if (insertErr || !credential) {
    const msg = insertErr?.message || 'Failed to create credential'
    const isDup = msg.includes('duplicate') || msg.includes('unique')
    return NextResponse.json(
      { success: false, error: isDup ? `Label "${label}" already exists for this agent` : msg },
      { status: isDup ? 409 : 500 }
    )
  }

  // Devolver la key plana UNA SOLA VEZ
  return NextResponse.json({
    success: true,
    data: {
      ...credential,
      api_key: plainKey,
      warning:
        'Esta es la única vez que verás la key completa. Guárdala ahora — no se puede recuperar después.',
    },
  })
}

export async function DELETE(req: NextRequest, _ctx: RouteContext) {
  const credentialId = req.nextUrl.searchParams.get('credential_id')
  if (!credentialId) {
    return NextResponse.json(
      { success: false, error: 'credential_id query param required' },
      { status: 400 }
    )
  }

  const auth = await requireAdminCaller()
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.message },
      { status: auth.status }
    )
  }

  const service = createServiceClient()
  const { error } = await service
    .from('agent_credentials')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      revoked_by: auth.userId,
    })
    .eq('id', credentialId)
    .eq('org_id', auth.orgId)
    .eq('status', 'active')

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
