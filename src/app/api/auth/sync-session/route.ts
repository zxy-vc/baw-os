// BaW OS — Sync browser session into HTTP cookies (SSR-safe)
// Sprint 5.5 fix: route handlers can write cookies via NextResponse,
// but Supabase SSR's setSession needs cookies to round-trip back to the
// response. Build a NextResponse and pass it explicitly to the cookie
// adapter so Set-Cookie headers actually ship.

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // Audit 2026-06-12: mitigación CSRF — solo aceptamos POSTs same-origin.
  // (Los browsers mandan Origin en POSTs cross-site; si difiere del host,
  // rechazamos. Requests sin Origin (curl, SSR interno) pasan.)
  const origin = request.headers.get('origin')
  if (origin) {
    const host = request.headers.get('host')
    let originHost: string | null = null
    try {
      originHost = new URL(origin).host
    } catch {
      originHost = null
    }
    if (!host || originHost !== host) {
      return NextResponse.json({ error: 'Cross-origin not allowed' }, { status: 403 })
    }
  }

  const { access_token, refresh_token } = await request
    .json()
    .catch(() => ({}))

  if (!access_token || !refresh_token) {
    return NextResponse.json(
      { error: 'Missing session tokens' },
      { status: 400 },
    )
  }

  // Prepare the response so the cookie adapter can write Set-Cookie on it.
  const response = NextResponse.json({ ok: true })

  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(
          cookiesToSet: {
            name: string
            value: string
            options?: Record<string, unknown>
          }[],
        ) {
          // Ship cookies on BOTH the request cookie store (so subsequent
          // calls in this handler see them) and the response (so the
          // browser actually receives them).
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options)
            } catch {
              // Server Component context — ignore, response handles it.
            }
            response.cookies.set(
              name,
              value,
              options as Parameters<typeof response.cookies.set>[2],
            )
          })
        },
      },
    },
  )

  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  // CRITICAL: do NOT create a new NextResponse and try to copy cookies onto it.
  // The previous version did `ok.cookies.set(c.name, c.value, c)` where `c`
  // was the ResponseCookie returned by getAll() — its shape is NOT a valid
  // CookieOptions (it has `name`, `value`, plus Set-Cookie attributes), and
  // the third arg ended up half-discarded. Result: the browser sometimes
  // received cookies missing `path`, `httpOnly`, `sameSite`, etc., or did
  // not commit them at all → race with the subsequent navigate to /admin.
  //
  // Fix: mutate the body of the original `response` (which already has the
  // correct Set-Cookie headers from the cookie adapter above) and ship it.
  return NextResponse.json(
    { ok: true, email: data.user?.email ?? null },
    { headers: response.headers },
  )
}
