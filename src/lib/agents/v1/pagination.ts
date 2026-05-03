// BaW OS — Cursor-based pagination para v1 API
// Cursor format: base64({"after_id": "uuid", "after_ts": "iso"})

import { NextRequest } from 'next/server'

export interface PaginationParams {
  limit: number
  afterId: string | null
  afterTs: string | null
}

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200

export function parsePagination(req: NextRequest): PaginationParams {
  const sp = req.nextUrl.searchParams
  const limitRaw = parseInt(sp.get('limit') || '', 10)
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, limitRaw), MAX_LIMIT)
    : DEFAULT_LIMIT
  const cursor = sp.get('cursor')
  if (!cursor) return { limit, afterId: null, afterTs: null }
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'))
    return {
      limit,
      afterId: typeof decoded.after_id === 'string' ? decoded.after_id : null,
      afterTs: typeof decoded.after_ts === 'string' ? decoded.after_ts : null,
    }
  } catch {
    return { limit, afterId: null, afterTs: null }
  }
}

export function makeCursor(row: { id: string; created_at?: string }): string {
  return Buffer.from(
    JSON.stringify({ after_id: row.id, after_ts: row.created_at })
  ).toString('base64')
}
