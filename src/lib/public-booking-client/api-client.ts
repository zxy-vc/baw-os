/**
 * Sprint 5B / WS-2 — Cliente tipado de la API pública `/api/public/v1/*`.
 *
 * • Retry simple (3 intentos, backoff 200/600/1500ms) solo en GETs idempotentes.
 * • Devuelve `{ data, error }` para que las pages decidan UI sin try/catch.
 * • Usa los tipos canónicos de `src/lib/public-booking/schemas.ts`.
 */

import type {
  PublicBuilding,
  PublicUnit,
  Quote,
  CheckoutResponse,
  LeadRequestInput,
  LeadResponse,
} from '@/lib/public-booking/schemas'

export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError }

export interface ApiError {
  status: number
  code?: string
  message: string
}

export interface AvailabilityRange {
  /** YYYY-MM-DD inclusive de inicio de un tramo bloqueado */
  from: string
  /** YYYY-MM-DD exclusive (checkout date) */
  to: string
  reason?: 'booked' | 'blocked' | 'maintenance' | string
}

export interface AvailabilityResponse {
  unit_slug: string
  from: string
  to: string
  /** Tramos bloqueados (no disponibles), derivados de blocked_days del endpoint */
  blocked: AvailabilityRange[]
}

/** Shape crudo que devuelve GET /units/[slug]/availability */
interface AvailabilityApiPayload {
  unit_slug: string
  from: string
  to: string
  is_available: boolean
  blocked_days: string[]
}

/** Agrupa días bloqueados consecutivos (YYYY-MM-DD) en rangos [from, to). */
export function blockedDaysToRanges(days: string[]): AvailabilityRange[] {
  const sorted = Array.from(new Set(days)).sort()
  const ranges: AvailabilityRange[] = []
  const nextDay = (d: string) => {
    const dt = new Date(`${d}T00:00:00Z`)
    dt.setUTCDate(dt.getUTCDate() + 1)
    return dt.toISOString().slice(0, 10)
  }
  for (const day of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && last.to === day) {
      last.to = nextDay(day)
    } else {
      ranges.push({ from: day, to: nextDay(day), reason: 'booked' })
    }
  }
  return ranges
}

const BASE = '/api/public/v1'

function joinQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    usp.set(k, String(v))
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

/**
 * Todos los endpoints de /api/public/v1 envuelven la respuesta en `{ data }`.
 * Desenvuelve ese envelope; si un endpoint devolviera el payload plano, lo
 * pasa tal cual (tolerante para no acoplar el cliente al detalle).
 */
function unwrapEnvelope<T>(body: unknown): T {
  if (
    body !== null &&
    typeof body === 'object' &&
    'data' in body &&
    Object.keys(body as object).every((k) => k === 'data')
  ) {
    return (body as { data: T }).data
  }
  return body as T
}

async function parseError(res: Response): Promise<ApiError> {
  let body: any = null
  try {
    body = await res.json()
  } catch {
    /* ignore */
  }
  return {
    status: res.status,
    code: body?.code,
    message: body?.message || body?.error || `HTTP ${res.status}`,
  }
}

async function getJson<T>(path: string, retries = 2): Promise<ApiResult<T>> {
  const backoff = [200, 600, 1500]
  let attempt = 0
  while (true) {
    try {
      const res = await fetch(BASE + path, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          await new Promise((r) => setTimeout(r, backoff[attempt] ?? 1500))
          attempt++
          continue
        }
        return { data: null, error: await parseError(res) }
      }
      const data = unwrapEnvelope<T>(await res.json())
      return { data, error: null }
    } catch (e: any) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, backoff[attempt] ?? 1500))
        attempt++
        continue
      }
      return {
        data: null,
        error: { status: 0, message: e?.message || 'Network error' },
      }
    }
  }
}

async function postJson<T>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { data: null, error: await parseError(res) }
    const data = unwrapEnvelope<T>(await res.json())
    return { data, error: null }
  } catch (e: any) {
    return {
      data: null,
      error: { status: 0, message: e?.message || 'Network error' },
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export async function getBuilding(slug: string): Promise<ApiResult<PublicBuilding>> {
  return getJson<PublicBuilding>(`/buildings/${slug}`)
}

export interface UnitsListParams {
  from?: string
  to?: string
  guests?: number
}

export async function listBuildingUnits(
  slug: string,
  params: UnitsListParams = {}
): Promise<ApiResult<PublicUnit[]>> {
  const q = joinQuery(params as Record<string, string | number | undefined>)
  const res = await getJson<PublicUnit[]>(`/buildings/${slug}/units${q}`)
  if (res.error) return res
  return { data: Array.isArray(res.data) ? res.data : [], error: null }
}

export async function getUnit(slug: string): Promise<ApiResult<PublicUnit>> {
  return getJson<PublicUnit>(`/units/${slug}`)
}

export async function getUnitAvailability(
  slug: string,
  from: string,
  to: string
): Promise<ApiResult<AvailabilityResponse>> {
  const q = joinQuery({ from, to })
  const res = await getJson<AvailabilityApiPayload>(`/units/${slug}/availability${q}`)
  if (res.error) return { data: null, error: res.error }
  return {
    data: {
      unit_slug: res.data.unit_slug,
      from: res.data.from,
      to: res.data.to,
      blocked: blockedDaysToRanges(res.data.blocked_days ?? []),
    },
    error: null,
  }
}

export async function postLead(input: LeadRequestInput): Promise<ApiResult<LeadResponse>> {
  return postJson<LeadResponse>('/leads', input)
}

export interface QuoteInput {
  unit_slug: string
  from: string
  to: string
  guests: number
}

export async function postQuote(input: QuoteInput): Promise<ApiResult<Quote>> {
  return postJson<Quote>('/quotes', input)
}

export interface CheckoutInput {
  unit_slug: string
  from: string
  to: string
  guests: number
  guest: { name: string; email: string; phone?: string }
}

export async function postCheckout(
  input: CheckoutInput,
  idempotencyKey: string
): Promise<ApiResult<CheckoutResponse>> {
  return postJson<CheckoutResponse>('/bookings/checkout', input, {
    'Idempotency-Key': idempotencyKey,
  })
}
