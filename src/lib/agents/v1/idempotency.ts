// BaW OS — Idempotency middleware para v1 API
// Cachea respuestas por (org, agent, idempotency_key) durante 24h.
// Si llega el mismo Idempotency-Key con body distinto, devuelve 409 conflict.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hashApiKey } from '@/lib/agents/auth'

export interface IdempotencyContext {
  orgId: string
  agentId: string
  credentialId: string
  endpoint: string
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
}

export interface IdempotencyHit {
  hit: true
  status: number
  body: unknown
}

export interface IdempotencyMiss {
  hit: false
  key: string | null
  bodyHash: string | null
}

/**
 * Lee Idempotency-Key del header y busca cache. Devuelve hit con respuesta
 * cacheada o miss con la info necesaria para guardar después.
 */
export async function checkIdempotency(
  req: NextRequest,
  ctx: IdempotencyContext,
  rawBody: string
): Promise<IdempotencyHit | IdempotencyMiss | { conflict: true }> {
  const key = req.headers.get('idempotency-key')?.trim()
  if (!key) return { hit: false, key: null, bodyHash: null }

  const bodyHash = await hashApiKey(rawBody) // SHA-256 helper reutilizado

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('idempotency_keys')
    .select('id, request_hash, response_status, response_body, expires_at')
    .eq('org_id', ctx.orgId)
    .eq('agent_id', ctx.agentId)
    .eq('idempotency_key', key)
    .maybeSingle()

  if (!existing) {
    return { hit: false, key, bodyHash }
  }

  // Si expiró, ignoramos y reusamos el slot
  const expired = new Date(existing.expires_at as string).getTime() < Date.now()
  if (expired) {
    return { hit: false, key, bodyHash }
  }

  // Mismo key + body distinto = conflict
  if (existing.request_hash !== bodyHash) {
    return { conflict: true }
  }

  // Hit: devolver respuesta cacheada
  return {
    hit: true,
    status: existing.response_status as number,
    body: existing.response_body,
  }
}

/**
 * Guarda la respuesta en cache idempotente. Llamar después de generar la
 * respuesta exitosamente (status < 500).
 */
export async function persistIdempotency(
  ctx: IdempotencyContext,
  key: string,
  bodyHash: string,
  responseStatus: number,
  responseBody: unknown
): Promise<void> {
  if (responseStatus >= 500) return // no cacheamos errores transitorios

  const supabase = createServiceClient()
  await supabase.from('idempotency_keys').upsert(
    {
      org_id: ctx.orgId,
      agent_id: ctx.agentId,
      credential_id: ctx.credentialId,
      idempotency_key: key,
      endpoint: ctx.endpoint,
      method: ctx.method,
      request_hash: bodyHash,
      response_status: responseStatus,
      response_body: responseBody as object,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: 'org_id,agent_id,idempotency_key' }
  )
}

/**
 * Helper para responder con conflict de idempotency.
 */
export function idempotencyConflictResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'idempotency_conflict',
        message:
          'Idempotency-Key ya fue usado con un body distinto en las últimas 24h.',
      },
    },
    { status: 409 }
  )
}
