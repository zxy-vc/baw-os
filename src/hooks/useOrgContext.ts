// BaW OS — useOrgContext hook (Sprint 4 / S4-1)
// Hook para client components que necesitan el org_id activo del usuario logueado.
// Reemplaza el patrón legacy: const ORG_ID = 'ed4308c7-2bdb-46f2-be69-7c59674838e2'

'use client'

import { useEffect, useState } from 'react'

export interface OrgContext {
  orgId: string | null
  userId: string | null
  role: string | null
  loading: boolean
  error: string | null
}

let cachedContext: Omit<OrgContext, 'loading' | 'error'> | null = null
let cachedAt = 0
const CACHE_TTL_MS = 60_000

async function fetchOrgContext() {
  const res = await fetch('/api/me/org', { credentials: 'include' })
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to resolve org')
  }
  return {
    orgId: json.data.org_id as string,
    userId: json.data.user_id as string,
    role: json.data.role as string,
  }
}

export function useOrgContext(): OrgContext {
  const [state, setState] = useState<OrgContext>(() => {
    if (cachedContext && Date.now() - cachedAt < CACHE_TTL_MS) {
      return { ...cachedContext, loading: false, error: null }
    }
    return { orgId: null, userId: null, role: null, loading: true, error: null }
  })

  useEffect(() => {
    let cancelled = false

    if (cachedContext && Date.now() - cachedAt < CACHE_TTL_MS) {
      setState({ ...cachedContext, loading: false, error: null })
      return
    }

    fetchOrgContext()
      .then((ctx) => {
        cachedContext = ctx
        cachedAt = Date.now()
        if (!cancelled) {
          setState({ ...ctx, loading: false, error: null })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            orgId: null,
            userId: null,
            role: null,
            loading: false,
            error: err.message,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export function clearOrgContextCache() {
  cachedContext = null
  cachedAt = 0
}
