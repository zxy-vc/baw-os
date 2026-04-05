'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PUBLIC_PATHS = ['/portal', '/tenant', '/owner', '/conserje', '/onboarding', '/apply', '/login']

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  useEffect(() => {
    if (isPublic) { setChecking(false); return }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && pathname !== '/login') {
        router.replace('/login')
      } else if (session && pathname === '/login') {
        router.replace('/')
      } else {
        setChecking(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (isPublic) return
      if (!session && pathname !== '/login') {
        router.replace('/login')
      } else if (session && pathname === '/login') {
        router.replace('/')
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
