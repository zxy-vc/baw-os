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

  // Override default body with the email confirmation while keeping cookies.
  const ok = NextResponse.json({ email: data.user?.email ?? null })
  // Copy Set-Cookie headers from `response` to `ok` so the browser receives them.
  response.cookies.getAll().forEach((c) => {
    ok.cookies.set(c.name, c.value, c)
  })

  return ok
}
