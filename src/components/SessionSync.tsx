'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { pushSessionToServer } from '@/lib/sync-session'

// Mantiene la cookie de sesión del servidor SIEMPRE alineada con la sesión viva
// del navegador. Sin esto, el browser rota el access token cada hora pero nada
// vuelve a actualizar la copia del servidor (solo se escribe una vez, al login),
// así que con el tiempo se desincronizan: los guardias server-side (/me, /admin)
// y el PDF del estado de cuenta ven "sin sesión" aunque el usuario siga dentro
// → loop de login / Unauthorized. Aquí, en cada refresco/entrada de sesión,
// empujamos los tokens frescos a la cookie. Render nulo: solo efecto.
export default function SessionSync() {
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        if (session) void pushSessionToServer(session)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return null
}
