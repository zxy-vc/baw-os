'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
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

  if (checking && pathname !== '/login') {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Cargando...</div>
      </div>
    )
  }

  return <>{children}</>
}
