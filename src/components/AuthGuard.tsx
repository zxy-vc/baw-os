'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { pushSessionToServer } from '@/lib/sync-session'
import type { Session } from '@supabase/supabase-js'

const PUBLIC_PATHS = ['/portal', '/tenant', '/owner', '/conserje', '/onboarding', '/apply', '/login']

// Multi-tenant conserje: /<orgSlug>/conserje. Match por segundo segmento.
function isMultiTenantConserje(pathname: string): boolean {
  const parts = pathname.split('/').filter(Boolean)
  return parts.length >= 2 && parts[1] === 'conserje'
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p)) || isMultiTenantConserje(pathname)

  useEffect(() => {
    if (isPublic) { setChecking(false); return }

    // Honor ?next= when leaving /login with a valid session (prevents redirect loops
    // when a Server Component bounced the user here from a protected route).
    const getNext = (): string => {
      if (typeof window === 'undefined') return '/'
      const param = new URLSearchParams(window.location.search).get('next')
      if (param && param.startsWith('/') && !param.startsWith('//')) return param
      return '/'
    }

    const buildLoginUrl = (): string => {
      if (typeof window === 'undefined') return '/login'
      const current = pathname + window.location.search
      const safe = current && current.startsWith('/') && !current.startsWith('//') ? current : '/'
      return `/login?next=${encodeURIComponent(safe)}`
    }

    // Si llegamos a /login con sesión viva, casi siempre es porque una página
    // del servidor (p.ej. /me) nos rebotó al ver su cookie vieja. Antes de
    // regresar al destino, resincronizamos la cookie del servidor con la sesión
    // del navegador: así la página del servidor ya la ve fresca y no hay loop.
    const goToNextHealed = async (session: Session) => {
      await pushSessionToServer(session)
      router.replace(getNext())
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && pathname !== '/login') {
        router.replace(buildLoginUrl())
      } else if (session && pathname === '/login') {
        void goToNextHealed(session)
      } else {
        setChecking(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (isPublic) return
      if (!session && pathname !== '/login') {
        router.replace(buildLoginUrl())
      } else if (session && pathname === '/login') {
        void goToNextHealed(session)
      } else {
        setChecking(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [pathname, router])

  if (checking && pathname !== '/login' && !isPublic) {
    return (
      <div className="fixed inset-0 bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 dark:text-gray-500 text-sm">Cargando...</div>
      </div>
    )
  }

  return <>{children}</>
}
