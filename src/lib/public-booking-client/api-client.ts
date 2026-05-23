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
  /** Tramos bloqueados (no disponibles) */
  blocked: AvailabilityRange[]
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
      const data = (await res.json()) as T
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
    const data = (await res.json()) as T
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

export async function getBuilding(slug = 'mateos-809'): Promise<ApiResult<PublicBuilding>> {
  return getJson<PublicBuilding>(`/buildings/${slug}`)
}

export interface UnitsListParams {
  from?: string
  to?: string
  guests?: number
}

export async function listBuildingUnits(
  slug = 'mateos-809',
  params: UnitsListParams = {}
): Promise<ApiResult<PublicUnit[]>> {
  const q = joinQuery(params as Record<string, string | number | undefined>)
  // El endpoint puede devolver `{ units: [...] }` o un array — normalizamos.
  const res = await getJson<PublicUnit[] | { units: PublicUnit[] }>(
    `/buildings/${slug}/units${q}`
  )
  if (res.error) return res as ApiResult<PublicUnit[]>
  const raw = res.data as unknown
  const arr = Array.isArray(raw) ? raw : (raw as { units?: PublicUnit[] })?.units ?? []
  return { data: arr, error: null }
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
  return getJson<AvailabilityResponse>(`/units/${slug}/availability${q}`)
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
