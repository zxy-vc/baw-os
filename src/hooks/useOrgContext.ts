// BaW OS — useOrgContext hook
// Hook para client components que necesitan el org_id activo del usuario logueado.
//
// 2026-06: reescrito para derivar del MISMO origen confiable que el switcher del
// sidebar (useActiveContext, client-side) en vez de pegarle a /api/me/org. Ese
// endpoint resolvía la org en el servidor (auth.getUser + cookie) y devolvía
// null para algunas sesiones, dejando páginas enteras (contactos, clientes,
// cobros, etc.) atascadas en loading. Ahora hay una sola fuente de verdad de la
// org activa en el cliente.

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useActiveContext } from '@/lib/useActiveContext'

export interface OrgContext {
  orgId: string | null
  userId: string | null
  role: string | null
  loading: boolean
  error: string | null
}

export function useOrgContext(): OrgContext {
  const { activeOrgId, userId, loading } = useActiveContext()
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    if (!activeOrgId || !userId) {
      setRole(null)
      return
    }
    let cancelled = false
    supabase
      .from('org_members')
      .select('role')
      .eq('user_id', userId)
      .eq('org_id', activeOrgId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setRole((data?.role as string | undefined) ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [activeOrgId, userId])

  return {
    orgId: activeOrgId,
    userId,
    role,
    loading,
    error: null,
  }
}

// Compat: el cache vivía en este módulo. Ya no hay cache propio (useActiveContext
// gestiona su estado). Se conserva el export como no-op por si algo lo importa.
export function clearOrgContextCache() {
  /* no-op */
}
