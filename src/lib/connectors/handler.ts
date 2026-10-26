// BaW OS — Envoltura de lectura del conector v1 (ENG-624).
//
// Cada GET de /api/connectors/v1/* pasa por connectorRead():
//   llave (Bearer ck_live_…) → estado (revocada/vencida) → dataset permitido
//   → handler (alcance por edificio) → bitácora → respuesta con as_of + source.
//
// Garantías:
//  - Solo lectura: el handler recibe el cliente de servicio pero el único
//    INSERT del conector es la fila de connector_access_log.
//  - Fail closed: si la bitácora no se pudo escribir, no se sirven datos (503).
//  - Una llave no reconocida no deja rastro (no hay org a quién atribuirlo);
//    toda petición con llave reconocida sí, incluidas las rechazadas.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { timingSafeEqualStr } from '@/lib/api-auth'
import {
  CONNECTOR_KEY_LOOKUP_LEN,
  hashConnectorKey,
  isConnectorKeyFormat,
  type ConnectorDataset,
  type ConnectorKeyRow,
} from './keys'
import { RULES_VERSION } from './rules'

export const RULES_DOC_URL = 'https://github.com/zxy-vc/baw-os/blob/main/docs/connectors-v1.md'

type Db = ReturnType<typeof createServiceClient>

export type AccessOutcome =
  | 'ok'
  | 'bad_request'
  | 'denied_revoked'
  | 'denied_expired'
  | 'denied_dataset'
  | 'denied_scope'
  | 'error'

/** Error esperado de un handler: se responde y se registra tal cual. */
export class ConnectorError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public outcome: AccessOutcome,
  ) {
    super(message)
    this.name = 'ConnectorError'
  }
}

export const badRequest = (code: string, message: string) =>
  new ConnectorError(code, message, 400, 'bad_request')
export const outOfScope = (message: string) =>
  new ConnectorError('out_of_scope', message, 403, 'denied_scope')

export interface ConnectorCtx {
  req: NextRequest
  params: URLSearchParams
  key: ConnectorKeyRow
  db: Db
}

export interface ConnectorPayload {
  data: unknown
  /** filas devueltas (para la bitácora) */
  rowCount: number
  pagination?: { next_cursor: string | null; limit: number }
  /** campos extra del sobre (p.ej. period, currency) */
  meta?: Record<string, unknown>
}

function sourceOf(dataset: ConnectorDataset) {
  return {
    system: 'baw-os',
    api: 'connectors/v1',
    dataset,
    rules: RULES_VERSION,
    rules_doc: RULES_DOC_URL,
  }
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function errorBody(dataset: ConnectorDataset, asOf: string, code: string, message: string) {
  return { error: { code, message }, as_of: asOf, source: sourceOf(dataset) }
}

/** Query tal cual llegó: un parámetro repetido se guarda como lista. */
export function auditQuery(params: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const k of Array.from(new Set(Array.from(params.keys())))) {
    const all = params.getAll(k)
    out[k] = all.length === 1 ? all[0] : all
  }
  return out
}

type KeyLookup =
  | { ok: true; key: ConnectorKeyRow }
  | { ok: false; status: number; code: string; message: string }

/** Busca la llave por prefijo y compara el hash en tiempo constante. Devuelve
 *  la fila aunque esté revocada/vencida: el rechazo también se registra. */
export async function lookupConnectorKey(db: Db, req: NextRequest): Promise<KeyLookup> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  if (!token) {
    return { ok: false, status: 401, code: 'missing_credentials', message: 'Falta Authorization: Bearer ck_live_…' }
  }
  if (!isConnectorKeyFormat(token)) {
    return { ok: false, status: 401, code: 'invalid_key', message: 'Llave no reconocida' }
  }
  const hash = await hashConnectorKey(token)
  const { data, error } = await db
    .from('connector_keys')
    .select('id, org_id, consumer, consumer_ref, label, key_prefix, key_hash, building_ids, datasets, status, expires_at')
    .eq('key_prefix', token.slice(0, CONNECTOR_KEY_LOOKUP_LEN))
  if (error) {
    return { ok: false, status: 503, code: 'auth_unavailable', message: 'No se pudo validar la llave' }
  }
  const match = ((data ?? []) as ConnectorKeyRow[]).find((row) => timingSafeEqualStr(row.key_hash, hash))
  if (!match) return { ok: false, status: 401, code: 'invalid_key', message: 'Llave no reconocida' }
  return { ok: true, key: match }
}

export function connectorRead(
  dataset: ConnectorDataset,
  handler: (ctx: ConnectorCtx) => Promise<ConnectorPayload>,
) {
  return async function GET(req: NextRequest): Promise<NextResponse> {
    const asOf = new Date().toISOString()
    const db = createServiceClient()

    const lookup = await lookupConnectorKey(db, req)
    if (!lookup.ok) return json(errorBody(dataset, asOf, lookup.code, lookup.message), lookup.status)
    const key = lookup.key

    const audited = auditQuery(req.nextUrl.searchParams)
    const query = Object.entries(audited)
    let status = 200
    let outcome: AccessOutcome = 'ok'
    let rowCount: number | null = null
    let body: unknown

    const deny = (s: number, o: AccessOutcome, code: string, message: string) => {
      status = s
      outcome = o
      body = errorBody(dataset, asOf, code, message)
    }

    if (key.status !== 'active') {
      deny(401, 'denied_revoked', 'key_revoked', 'La llave fue revocada')
    } else if (key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) {
      deny(401, 'denied_expired', 'key_expired', 'La llave venció')
    } else if (!key.datasets.includes(dataset)) {
      deny(403, 'denied_dataset', 'dataset_not_allowed', `La llave no incluye el dataset "${dataset}"`)
    } else if (query.some(([, v]) => Array.isArray(v))) {
      // Sin ambigüedad: lo que se lee y lo que se registra deben ser lo mismo.
      const dup = query.filter(([, v]) => Array.isArray(v)).map(([k]) => k).join(', ')
      deny(400, 'bad_request', 'duplicate_param', `Parámetro repetido: ${dup}`)
    } else {
      try {
        const out = await handler({ req, params: req.nextUrl.searchParams, key, db })
        rowCount = out.rowCount
        body = {
          data: out.data,
          ...out.meta,
          ...(out.pagination ? { pagination: out.pagination } : {}),
          as_of: asOf,
          source: sourceOf(dataset),
          scope: { org_id: key.org_id, building_ids: key.building_ids ?? 'all' },
        }
      } catch (e) {
        if (e instanceof ConnectorError) {
          deny(e.status, e.outcome, e.code, e.message)
        } else {
          console.error(`connector dataset=${dataset} key=${key.id} error=`, e)
          deny(500, 'error', 'internal_error', 'Error interno al leer los datos')
        }
      }
    }

    const { error: logError } = await db.from('connector_access_log').insert({
      key_id: key.id,
      org_id: key.org_id,
      consumer: key.consumer,
      consumer_ref: key.consumer_ref,
      dataset,
      endpoint: req.nextUrl.pathname,
      query: audited,
      outcome,
      http_status: status,
      row_count: rowCount,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: req.headers.get('user-agent')?.slice(0, 256) || null,
    })
    if (logError) {
      console.error(`connector dataset=${dataset} key=${key.id} audit_log_failed=${logError.message}`)
      return json(errorBody(dataset, asOf, 'audit_unavailable', 'No se pudo registrar la lectura; intenta de nuevo'), 503)
    }

    return json(body, status)
  }
}
