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
          BaW Design Lab · ZXY Ventures
        </p>
      </div>
    </div>
  )
}
