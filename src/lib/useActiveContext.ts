'use client'

// BaW OS — useActiveContext (Sprint 3 / S4)
// Hook compartido que mantiene la PM Company y el Building activos.
// Persiste la selección en localStorage. Se hidrata desde Supabase la primera
// vez que se monta tras login. Lee `org_members` para saber a qué orgs
// pertenece el usuario y `buildings` para listarlos por org.

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const STORAGE_KEY_ORG = 'baw:active_org_id'
const STORAGE_KEY_BUILDING = 'baw:active_building_id'

export interface OrgOption {
  id: string
  name: string
  slug: string
}

export interface BuildingOption {
  id: string
  org_id: string
  name: string
  city: string | null
}

export interface ActiveContext {
  loading: boolean
  userId: string | null
  userEmail: string | null
  orgs: OrgOption[]
  buildings: BuildingOption[]
  activeOrgId: string | null
  activeBuildingId: string | null
  setActiveOrgId: (id: string) => void
  setActiveBuildingId: (id: string) => void
  refresh: () => Promise<void>
}

export function useActiveContext(): ActiveContext {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [buildings, setBuildings] = useState<BuildingOption[]>([])
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null)
  const [activeBuildingId, setActiveBuildingIdState] = useState<string | null>(
    null,
  )

  const setActiveOrgId = useCallback((id: string) => {
    setActiveOrgIdState(id)
    try {
      localStorage.setItem(STORAGE_KEY_ORG, id)
    } catch {
      // ignore
    }
  }, [])

  const setActiveBuildingId = useCallback((id: string) => {
    setActiveBuildingIdState(id)
    try {
      localStorage.setItem(STORAGE_KEY_BUILDING, id)
    } catch {
      // ignore
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session) {
        setUserId(null)
        setUserEmail(null)
        setOrgs([])
        setBuildings([])
        return
      }
      setUserId(session.user.id)
      setUserEmail(session.user.email ?? null)

      // S9 hotfix: hacer el lookup en dos pasos para no depender del join.
      // Antes: si RLS bloqueaba `organizations`, todo el join devolvía null y
      // el usuario quedaba sin orgs aun teniendo membresía válida.
      const { data: members, error: memberErr } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', session.user.id)

      if (memberErr) {
        // eslint-disable-next-line no-console
        console.error('useActiveContext: error leyendo org_members', memberErr)
      }

      const orgIds = (members || [])
        .map((m: any) => m.org_id)
        .filter(Boolean) as string[]

      let orgList: OrgOption[] = []
      if (orgIds.length > 0) {
        const { data: orgsData, error: orgErr } = await supabase
          .from('organizations')
          .select('id, name, slug')
          .in('id', orgIds)

        if (orgErr) {
          // eslint-disable-next-line no-console
          console.error('useActiveContext: error leyendo organizations', orgErr)
        }

        orgList = (orgsData || []).map((o: any) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
        }))
      }

      setOrgs(orgList)

      // Determinar org activa
      let nextActiveOrg: string | null = null
      try {
        const stored = localStorage.getItem(STORAGE_KEY_ORG)
        if (stored && orgList.some((o) => o.id === stored)) {
          nextActiveOrg = stored
        }
      } catch {
        // ignore
      }
      if (!nextActiveOrg && orgList.length > 0) {
        nextActiveOrg = orgList[0].id
      }
      setActiveOrgIdState(nextActiveOrg)

      // Buildings de todas las orgs del usuario
      if (orgList.length > 0) {
        const { data: bldgs } = await supabase
          .from('buildings')
          .select('id, org_id, name, city')
          .in(
            'org_id',
            orgList.map((o) => o.id),
          )
          .order('name', { ascending: true })

        const bldList: BuildingOption[] = (bldgs as any[]) || []
        setBuildings(bldList)

        let nextActiveBld: string | null = null
        try {
          const stored = localStorage.getItem(STORAGE_KEY_BUILDING)
          if (
            stored &&
            bldList.some(
              (b) => b.id === stored && b.org_id === nextActiveOrg,
            )
          ) {
            nextActiveBld = stored
          }
        } catch {
          // ignore
        }
        if (!nextActiveBld && nextActiveOrg) {
          const first = bldList.find((b) => b.org_id === nextActiveOrg)
          nextActiveBld = first?.id ?? null
        }
        setActiveBuildingIdState(nextActiveBld)
      } else {
        setBuildings([])
        setActiveBuildingIdState(null)
      }
    } catch (e) {
      // soft-fail: el componente que consume el hook decide qué mostrar
      // eslint-disable-next-line no-console
      console.error('useActiveContext refresh error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Si cambia la org activa, ajustar el building activo si pertenece a otra org
  useEffect(() => {
    if (!activeOrgId) return
    if (activeBuildingId) {
      const current = buildings.find((b) => b.id === activeBuildingId)
      if (current && current.org_id === activeOrgId) return
    }
    const first = buildings.find((b) => b.org_id === activeOrgId)
    setActiveBuildingIdState(first?.id ?? null)
    if (first) {
      try {
        localStorage.setItem(STORAGE_KEY_BUILDING, first.id)
      } catch {
        // ignore
      }
    }
  }, [activeOrgId, activeBuildingId, buildings])

  return {
    loading,
    userId,
    userEmail,
    orgs,
    buildings,
    activeOrgId,
    activeBuildingId,
    setActiveOrgId,
    setActiveBuildingId,
    refresh,
  }
}
