'use client'

// BaW OS — Página de Property Owners (Sprint 4 / S4-0)
// CRUD de owners + asignación de stakes (% de buildings).
// Filtra por org_id activo. Expansión por fila para ver y editar stakes.

import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Users,
  Pencil,
  ChevronDown,
  ChevronRight,
  Trash2,
  Building2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { PropertyOwner, OwnershipStake, Building } from '@/types'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import OwnerModal from './OwnerModal'
import StakeModal from './StakeModal'
import { useActiveContext } from '@/lib/useActiveContext'

interface OwnerWithStakes extends PropertyOwner {
  stakes?: OwnershipStake[]
}

export default function OwnersPage() {
  const { activeOrgId, orgs, loading: ctxLoading } = useActiveContext()

  const [owners, setOwners] = useState<OwnerWithStakes[]>([])
  const [buildings, setBuildings] = useState<Building[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [ownerModalOpen, setOwnerModalOpen] = useState(false)
  const [editingOwner, setEditingOwner] = useState<PropertyOwner | null>(null)

  const [stakeModalOpen, setStakeModalOpen] = useState(false)
  const [editingStake, setEditingStake] = useState<OwnershipStake | null>(null)
  const [stakeOwnerId, setStakeOwnerId] = useState<string | null>(null)

  const activeOrg = useMemo(
    () => orgs.find((o) => o.id === activeOrgId) || null,
    [orgs, activeOrgId],
  )

  async function fetchData() {
    if (!activeOrgId) {
      setOwners([])
      setBuildings([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const [ownersRes, buildingsRes, stakesRes] = await Promise.all([
      supabase
        .from('property_owners')
        .select('*')
        .eq('org_id', activeOrgId)
        .order('full_name', { ascending: true }),
      supabase
        .from('buildings')
        .select('*')
        .eq('org_id', activeOrgId)
        .order('name', { ascending: true }),
      supabase
        .from('ownership_stakes')
        .select('*')
        .eq('org_id', activeOrgId),
    ])

    if (ownersRes.error) {
      setError(ownersRes.error.message)
      setLoading(false)
      return
    }

    const stakesByOwner = new Map<string, OwnershipStake[]>()
    for (const s of (stakesRes.data as OwnershipStake[]) || []) {
      const list = stakesByOwner.get(s.property_owner_id) || []
      list.push(s)
      stakesByOwner.set(s.property_owner_id, list)
    }

    const ownersList: OwnerWithStakes[] = (
      (ownersRes.data as PropertyOwner[]) || []
    ).map((o) => ({
      ...o,
      stakes: stakesByOwner.get(o.id) || [],
    }))

    setOwners(ownersList)
    setBuildings((buildingsRes.data as Building[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    if (ctxLoading) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxLoading, activeOrgId])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSaveOwner(data: Partial<PropertyOwner>) {
    if (!activeOrgId) return
    setError(null)
    if (editingOwner) {
      const { error: upErr } = await supabase
        .from('property_owners')
        .update(data)
        .eq('id', editingOwner.id)
        .eq('org_id', activeOrgId)
      if (upErr) {
        setError(upErr.message)
        return
      }
    } else {
      const { error: insErr } = await supabase
        .from('property_owners')
        .insert({ ...data, org_id: activeOrgId })
      if (insErr) {
        setError(insErr.message)
        return
      }
    }
    setOwnerModalOpen(false)
    setEditingOwner(null)
    fetchData()
  }

  async function handleSaveStake(data: Partial<OwnershipStake>) {
    if (!activeOrgId || !stakeOwnerId) return
    setError(null)
    if (editingStake) {
      const { error: upErr } = await supabase
        .from('ownership_stakes')
        .update(data)
        .eq('id', editingStake.id)
        .eq('org_id', activeOrgId)
      if (upErr) {
        setError(upErr.message)
        return
      }
    } else {
      const { error: insErr } = await supabase.from('ownership_stakes').insert({
        ...data,
        org_id: activeOrgId,
        property_owner_id: stakeOwnerId,
      })
      if (insErr) {
        setError(insErr.message)
        return
      }
    }
    setStakeModalOpen(false)
    setEditingStake(null)
    setStakeOwnerId(null)
    fetchData()
  }

  async function handleDeleteStake(stakeId: string) {
    if (!activeOrgId) return
    if (!confirm('¿Quitar la propiedad de este edificio para este propietario?'))
      return
    const { error: delErr } = await supabase
      .from('ownership_stakes')
      .delete()
      .eq('id', stakeId)
      .eq('org_id', activeOrgId)
    if (delErr) {
      setError(delErr.message)
      return
    }
    fetchData()
  }

  // % libre por building (excluyendo el stake actualmente en edición)
  function remainingByBuilding(excludeStakeId?: string): Record<string, number> {
    const used: Record<string, number> = {}
    for (const o of owners) {
      for (const s of o.stakes || []) {
        if (excludeStakeId && s.id === excludeStakeId) continue
        used[s.building_id] = (used[s.building_id] || 0) + Number(s.percentage)
      }
    }
    const out: Record<string, number> = {}
    for (const b of buildings) {
      out[b.id] = Math.max(0, 100 - (used[b.id] || 0))
    }
    return out
  }

  const buildingById = useMemo(() => {
    const map = new Map<string, Building>()
    for (const b of buildings) map.set(b.id, b)
    return map
  }, [buildings])

  if (!ctxLoading && !activeOrgId) {
    return (
      <div className="p-8">
        <EmptyState
          icon={Users}
          title="Sin organización activa"
          description="Termina el onboarding para crear tu primera PM Company."
          actionLabel="Ir al onboarding"
          actionHref="/onboarding"
        />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Propietarios
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {activeOrg?.name || 'PM Company'} · {owners.length}{' '}
            {owners.length === 1 ? 'propietario' : 'propietarios'} ·{' '}
            {buildings.length}{' '}
            {buildings.length === 1 ? 'edificio' : 'edificios'}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingOwner(null)
            setOwnerModalOpen(true)
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo propietario
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable />
      ) : owners.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aún no tienes propietarios"
          description="Agrega los dueños cuyos edificios y unidades administras."
          actionLabel="Nuevo propietario"
          actionHref="#"
        />
      ) : (
        <>
        {/* Mobile: cards apiladas con expand. Sprint 4 / S4-0 fix responsive. */}
        <div className="md:hidden space-y-2">
          {owners.map((o) => {
            const isOpen = expanded.has(o.id)
            const stakes = o.stakes || []
            return (
              <div key={o.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleExpand(o.id)}
                    className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mt-0.5 shrink-0"
                    aria-label={isOpen ? 'Colapsar' : 'Expandir'}
                  >
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {o.full_name}
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {o.email && <div className="truncate">{o.email}</div>}
                      {o.phone && <div>{o.phone}</div>}
                      {o.rfc && <div className="tabular-nums">RFC {o.rfc}</div>}
                    </div>
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                      <span className="tabular-nums font-medium">{stakes.length}</span>{' '}
                      {stakes.length === 1 ? 'edificio' : 'edificios'}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setEditingOwner(o)
                      setOwnerModalOpen(true)
                    }}
                    className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Propiedades
                      </h3>
                      <button
                        onClick={() => {
                          setStakeOwnerId(o.id)
                          setEditingStake(null)
                          setStakeModalOpen(true)
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Asignar
                      </button>
                    </div>
                    {stakes.length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 py-1">
                        Sin edificios asignados.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {stakes.map((s) => {
                          const b = buildingById.get(s.building_id)
                          return (
                            <div
                              key={s.id}
                              className="flex items-center justify-between gap-2 py-1.5 border-t border-gray-100 dark:border-gray-800/60"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-sm">
                                  <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                  <span className="truncate text-gray-900 dark:text-white">
                                    {b?.name || '—'}
                                  </span>
                                </div>
                                {(s.starts_on || s.ends_on) && (
                                  <div className="text-[11px] text-gray-500 mt-0.5">
                                    {s.starts_on || '—'}
                                    {s.ends_on ? ` → ${s.ends_on}` : ''}
                                  </div>
                                )}
                              </div>
                              <div className="text-right tabular-nums text-sm font-medium text-gray-900 dark:text-white shrink-0">
                                {Number(s.percentage).toFixed(2)}%
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => {
                                    setStakeOwnerId(o.id)
                                    setEditingStake(s)
                                    setStakeModalOpen(true)
                                  }}
                                  className="text-gray-400 hover:text-indigo-600 p-1"
                                  title="Editar"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteStake(s.id)}
                                  className="text-gray-400 hover:text-red-600 p-1"
                                  title="Quitar"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="hidden md:block card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-800">
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3">Propietario</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">RFC</th>
                <th className="px-4 py-3 text-right">Edificios</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {owners.map((o) => {
                const isOpen = expanded.has(o.id)
                const stakes = o.stakes || []
                return (
                  <>
                    <tr
                      key={o.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 align-top">
                        <button
                          onClick={() => toggleExpand(o.id)}
                          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                          aria-label={
                            isOpen ? 'Colapsar' : 'Expandir'
                          }
                        >
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {o.full_name}
                        </div>
                        {o.notes && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                            {o.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {o.email && <div>{o.email}</div>}
                        {o.phone && (
                          <div className="text-xs text-gray-500">{o.phone}</div>
                        )}
                        {!o.email && !o.phone && (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 tabular-nums">
                        {o.rfc || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-900 dark:text-white">
                        {stakes.length}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setEditingOwner(o)
                            setOwnerModalOpen(true)
                          }}
                          className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${o.id}-detail`}>
                        <td
                          colSpan={6}
                          className="px-4 py-3 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-200 dark:border-gray-800"
                        >
                          <div className="pl-8 pr-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                Propiedades de {o.full_name}
                              </h3>
                              <button
                                onClick={() => {
                                  setStakeOwnerId(o.id)
                                  setEditingStake(null)
                                  setStakeModalOpen(true)
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Asignar edificio
                              </button>
                            </div>
                            {stakes.length === 0 ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400 py-2">
                                Aún no tiene edificios asignados.
                              </p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    <th className="py-2">Edificio</th>
                                    <th className="py-2">Vigencia</th>
                                    <th className="py-2 text-right">%</th>
                                    <th className="py-2 w-20"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {stakes.map((s) => {
                                    const b = buildingById.get(s.building_id)
                                    return (
                                      <tr
                                        key={s.id}
                                        className="border-t border-gray-200 dark:border-gray-700"
                                      >
                                        <td className="py-2">
                                          <div className="flex items-center gap-2">
                                            <Building2 className="w-3.5 h-3.5 text-gray-400" />
                                            <span className="text-gray-900 dark:text-white">
                                              {b?.name || '—'}
                                            </span>
                                            {b?.city && (
                                              <span className="text-xs text-gray-500">
                                                · {b.city}
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-2 text-xs text-gray-500">
                                          {s.starts_on || '—'}
                                          {s.ends_on ? ` → ${s.ends_on}` : ''}
                                        </td>
                                        <td className="py-2 text-right tabular-nums text-gray-900 dark:text-white">
                                          {Number(s.percentage).toFixed(2)}%
                                        </td>
                                        <td className="py-2 text-right">
                                          <div className="inline-flex gap-2">
                                            <button
                                              onClick={() => {
                                                setStakeOwnerId(o.id)
                                                setEditingStake(s)
                                                setStakeModalOpen(true)
                                              }}
                                              className="text-gray-400 hover:text-indigo-600"
                                              title="Editar"
                                            >
                                              <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              onClick={() =>
                                                handleDeleteStake(s.id)
                                              }
                                              className="text-gray-400 hover:text-red-600"
                                              title="Quitar"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {ownerModalOpen && (
        <OwnerModal
          owner={editingOwner}
          onSave={handleSaveOwner}
          onClose={() => {
            setOwnerModalOpen(false)
            setEditingOwner(null)
          }}
        />
      )}

      {stakeModalOpen && (
        <StakeModal
          stake={editingStake}
          buildings={buildings}
          ownerName={
            owners.find((o) => o.id === stakeOwnerId)?.full_name || ''
          }
          remainingByBuilding={remainingByBuilding(editingStake?.id)}
          onSave={handleSaveStake}
          onClose={() => {
            setStakeModalOpen(false)
            setEditingStake(null)
            setStakeOwnerId(null)
          }}
        />
      )}
    </div>
  )
}
