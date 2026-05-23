// Simple in-memory rate limiter keyed by "<route>:<ip>".
// Sufficient for v1. Replace with Upstash Ratelimit for multi-instance deploys.

interface RateLimitEntry {
  count: number
  resetAt: number // epoch ms
}

const store = new Map<string, RateLimitEntry>()

// Cleanup stale entries every 2 minutes to avoid unbounded memory growth.
let lastCleanup = Date.now()

function maybeCleanup() {
  const now = Date.now()
  if (now - lastCleanup < 120_000) return
  lastCleanup = now
  store.forEach((entry, key) => {
    if (entry.resetAt < now) store.delete(key)
  })
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number // epoch ms
}

/**
 * Check (and increment) the rate limit for a given key.
 * @param key        Unique string, e.g. "availability:/api/...:<ip>"
 * @param limit      Max requests per window
 * @param windowMs   Window duration in milliseconds (default 60 000 = 1 min)
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
): RateLimitResult {
  maybeCleanup()

  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    // New or expired window
    const resetAt = now + windowMs
    store.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: limit - 1, resetAt }
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt }
}

/**
 * Convenience: rate-limit by route + IP.
 * @param routeId  Short identifier, e.g. "buildings-slug"
 * @param ip       Client IP string
 * @param limit    Max requests per minute
 */
export function rateLimitByIp(
  routeId: string,
  ip: string,
  limit: number,
): RateLimitResult {
  const key = `${routeId}:${ip}`
  return checkRateLimit(key, limit)
}
