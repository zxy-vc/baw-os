import { NextResponse } from 'next/server'

/**
 * Returns the validated CORS origin or null if not allowed.
 * Allowed origins are read from PUBLIC_BOOKING_ALLOWED_ORIGINS (comma-separated).
 * Falls back to an open allowlist in development.
 */
export function getAllowedOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null

  const raw = process.env.PUBLIC_BOOKING_ALLOWED_ORIGINS ?? ''
  const allowed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // In development, always allow localhost and vercel previews
  if (process.env.NODE_ENV === 'development') {
    if (
      requestOrigin.startsWith('http://localhost') ||
      requestOrigin.startsWith('http://127.0.0.1') ||
      requestOrigin.endsWith('.vercel.app')
    ) {
      return requestOrigin
    }
  }

  if (allowed.includes(requestOrigin)) return requestOrigin
  return null
}

/**
 * Adds CORS headers to a NextResponse.
 * If origin is not allowed, returns a 403 response instead.
 */
export function withCors(
  response: NextResponse,
  requestOrigin: string | null,
): NextResponse {
  const allowed = getAllowedOrigin(requestOrigin)
  if (allowed) {
    response.headers.set('Access-Control-Allow-Origin', allowed)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Idempotency-Key',
    )
    response.headers.set('Access-Control-Max-Age', '86400')
    response.headers.set('Vary', 'Origin')
  }
  return response
}

/**
 * Handle preflight OPTIONS requests.
 * Returns 204 with CORS headers if origin is allowed, else 403.
 */
export function handlePreflight(requestOrigin: string | null): NextResponse {
  const allowed = getAllowedOrigin(requestOrigin)
  if (!allowed) {
    return NextResponse.json(
      { error: { code: 'CORS_FORBIDDEN', message: 'Origin not allowed' } },
      { status: 403 },
    )
  }
  const res = new NextResponse(null, { status: 204 })
  res.headers.set('Access-Control-Allow-Origin', allowed)
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key')
  res.headers.set('Access-Control-Max-Age', '86400')
  res.headers.set('Vary', 'Origin')
  return res
}

/** Standard 404 when feature flag is off */
export function featureDisabled(): NextResponse {
  return NextResponse.json(
    { error: { code: 'NOT_FOUND', message: 'Not found' } },
    { status: 404 },
  )
}

/** Standard rate-limit 429 */
export function rateLimitExceeded(): NextResponse {
  return NextResponse.json(
    { error: { code: 'RATE_LIMITED', message: 'Too many requests. Slow down.' } },
    { status: 429 },
  )
}

/** Typed error response */
export function errorResponse(
  code: string,
  message: string,
  status = 400,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}
