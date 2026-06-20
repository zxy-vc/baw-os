'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BawGrid from '@/components/BawGrid'

// Sprint 4 / S4-2: useSearchParams requiere Suspense boundary en Next.js 14
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  // Sprint 4 / S4-2: respetar ?next= para deep-link
  const nextPath = searchParams.get('next') || '/'
  const role = searchParams.get('role')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Sprint 5.5 fix: clear any stale split-session (localStorage tokens
    // without matching sb-* cookies) before signing in. Otherwise the
    // browser keeps a UI-only session while middleware sees no cookies
    // and redirects every protected route back to /login.
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // Best-effort cleanup; proceed regardless.
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const session = data.session ?? (await supabase.auth.getSession()).data.session

    if (session?.access_token && session?.refresh_token) {
      const sync = await fetch('/api/auth/sync-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
      })

      if (!sync.ok) {
        setError('No se pudo sincronizar la sesión. Intenta de nuevo.')
        setLoading(false)
        return
      }

      // Sprint 6 followup #2 fix: infinite login loop con ?next=/admin.
      //
      // Causa raíz: hacíamos `window.location.href = '/admin'` inmediatamente
      // tras el sync-session response. El browser no garantiza que el
      // Set-Cookie del response esté commiteado antes del navigate, sobre
      // todo cuando hay redirect HTTP en cadena. Si la cookie aún no está
      // sincronizada al GET /admin, el guard server-side ve `getUser()===null`
      // y redirige a /login?next=/admin → el form ve session en localStorage
      // y vuelve a redirigir → loop infinito.
      //
      // Fix: hacer un round-trip server explícito (`/api/me`) para CONFIRMAR
      // que la cookie está viva antes de navegar. Si la cookie aún no
      // commitea, retry hasta 3 veces con backoff. Si tras eso falla,
      // mostramos error claro — no entramos al loop.
      // Probe up to 6 times with 200ms backoff (~1.2s max). The probe is
      // best-effort: if the cookie is committed, great — we navigate fast.
      // If after 6 tries we still see 401, we navigate ANYWAY because the
      // sync-session call returned 200 OK and the middleware will refresh
      // tokens on the next request. A logged-in user should not be blocked
      // by a flaky probe — the worst case becomes a normal redirect, not a
      // hard error message.
      let cookieReady = false
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const probe = await fetch('/api/me/whoami', {
            credentials: 'include',
            cache: 'no-store',
          })
          if (probe.ok) {
            const j = await probe.json().catch(() => ({}))
            if (j?.email) {
              cookieReady = true
              break
            }
          }
        } catch {
          // network blip; retry
        }
        await new Promise((r) => setTimeout(r, 200))
      }
      if (!cookieReady && process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('[login] cookie probe never confirmed, navigating anyway')
      }
    }

    // Full reload so middleware and Server Components pick up the session cookie.
    const safeNext = nextPath.startsWith('/') && !nextPath.startsWith('//')
      ? nextPath
      : '/'
    window.location.href = safeNext
  }

  const subtitle = role === 'owner' ? 'Portal Propietario' : 'Property Management'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[--baw-bg]">
      {/* Subtle grid background — comunica precisión técnica de la marca.
          Sprint 6 followup: migrado al componente reutilizable BawGrid para
          que /login y AppShell usen exactamente la misma retícula. */}
      <BawGrid position="absolute" />

      <div className="relative w-full max-w-sm mx-auto px-6">
        {/* Mark + wordmark */}
        <div className="flex flex-col items-center mb-12">
          <div className="text-[--baw-text] mb-5">
            {/* Mark · B — Alineado a cubo (3 placas apiladas sobre eje vertical) */}
            {/* design/baw-design/references/Wordmark Explorations v2.html */}
            <svg
              viewBox="0 0 120 120"
              width="56"
              height="56"
              fill="none"
              aria-label="BaW"
              className="block"
            >
              <path d="M10 82 L60 100 L110 82 L60 64 Z" fill="currentColor" />
              <path d="M16 58 L66 76 L116 58 L66 40 Z" fill="currentColor" opacity="0.7" />
              <path d="M4 34 L54 52 L104 34 L54 16 Z" fill="currentColor" opacity="0.5" />
            </svg>
          </div>

          {/* Wordmark — IBM Plex Mono Medium, espaciado tight */}
          <h1
            style={{ fontFamily: 'var(--font-mono)' }}
            className="text-[28px] font-medium text-[--baw-text] tracking-tight leading-none"
          >
            BaW
            <span className="text-[--baw-muted] ml-2 text-[14px] font-normal tracking-wide">
              / OS
            </span>
          </h1>

          <p
            style={{ fontFamily: 'var(--font-mono)' }}
            className="text-[11px] uppercase tracking-[0.18em] text-[--baw-muted] mt-3"
          >
            {subtitle}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              style={{ fontFamily: 'var(--font-mono)' }}
              className="block text-[11px] uppercase tracking-wider text-[--baw-muted] mb-2"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2.5 bg-[--baw-surface] border border-[--baw-border] rounded-md text-[--baw-text] text-sm
                         placeholder:text-[--baw-faint] focus:outline-none focus:ring-2 focus:ring-[--baw-info-bg-soft] focus:border-[--baw-info-fg]
                         transition-colors"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{ fontFamily: 'var(--font-mono)' }}
              className="block text-[11px] uppercase tracking-wider text-[--baw-muted] mb-2"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-[--baw-surface] border border-[--baw-border] rounded-md text-[--baw-text] text-sm
                         placeholder:text-[--baw-faint] focus:outline-none focus:ring-2 focus:ring-[--baw-info-bg-soft] focus:border-[--baw-info-fg]
                         transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-sm text-[--baw-danger-fg] bg-[--baw-danger-bg-soft] border border-[--baw-danger-border] rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[--baw-text] text-[--baw-bg] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed
                       rounded-md text-sm font-medium transition-opacity"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {/* Footer */}
        <p
          style={{ fontFamily: 'var(--font-mono)' }}
          className="text-center text-[10px] uppercase tracking-[0.2em] text-[--baw-faint] mt-10"
        >
          Built by ZXY Ventures
        </p>
      </div>
    </div>
  )
}
