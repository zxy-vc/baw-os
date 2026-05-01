'use client'

// BaW OS — Página de Edificios (Sprint 4 / S4-0)
// CRUD de buildings: list + create + edit. Filtra por org_id activo.
// Cuenta unidades por building via relación inversa.

import { useEffect, useMemo, useState } from 'react'
import { Plus, Building2, Pencil, MapPin, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Building } from '@/types'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import BuildingModal from './BuildingModal'
import { useActiveContext } from '@/lib/useActiveContext'

interface BuildingWithCounts extends Building {
  units_count?: number
  owners_count?: number
}

export default function BuildingsPage() {
  const { activeOrgId, orgs, loading: ctxLoading, refresh } = useActiveContext()

  const [buildings, setBuildings] = useState<BuildingWithCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Building | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeOrg = useMemo(
    () => orgs.find((o) => o.id === activeOrgId) || null,
    [orgs, activeOrgId],
  )

  async function fetchBuildings() {
    if (!activeOrgId) {
      setBuildings([])
      setLoading(false)
      return
    }
    setLoading(true)

    const { data: bldgs, error: bErr } = await supabase
      .from('buildings')
      .select('*')
      .eq('org_id', activeOrgId)
      .order('name', { ascending: true })

    if (bErr) {
      setError(bErr.message)
      setLoading(false)
      return
    }

    const list: BuildingWithCounts[] = (bldgs as Building[]) || []
    if (list.length === 0) {
      setBuildings([])
      setLoading(false)
      return
    }

    // Conteos en paralelo: units por building y owners únicos via stakes
    const ids = list.map((b) => b.id)
    const [unitsRes, stakesRes] = await Promise.all([
      supabase
        .from('units')
        .select('id, building_id')
        .eq('org_id', activeOrgId)
        .in('building_id', ids),
      supabase
        .from('ownership_stakes')
        .select('building_id, property_owner_id')
        .eq('org_id', activeOrgId)
        .in('building_id', ids),
    ])

    const unitsByBuilding = new Map<string, number>()
    for (const u of (unitsRes.data as any[]) || []) {
      unitsByBuilding.set(
        u.building_id,
        (unitsByBuilding.get(u.building_id) || 0) + 1,
      )
    }

    const ownersByBuilding = new Map<string, Set<string>>()
    for (const s of (stakesRes.data as any[]) || []) {
      const set = ownersByBuilding.get(s.building_id) || new Set<string>()
      set.add(s.property_owner_id)
      ownersByBuilding.set(s.building_id, set)
    }

    setBuildings(
      list.map((b) => ({
        ...b,
        units_count: unitsByBuilding.get(b.id) || 0,
        owners_count: ownersByBuilding.get(b.id)?.size || 0,
      })),
    )
    setLoading(false)
  }

  useEffect(() => {
    if (ctxLoading) return
    fetchBuildings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxLoading, activeOrgId])

  async function handleSave(data: Partial<Building>) {
    if (!activeOrgId) return
    setError(null)
    if (editing) {
      const { error: upErr } = await supabase
        .from('buildings')
        .update(data)
        .eq('id', editing.id)
        .eq('org_id', activeOrgId)
      if (upErr) {
        setError(upErr.message)
        return
      }
    } else {
      const { error: insErr } = await supabase
        .from('buildings')
        .insert({ ...data, org_id: activeOrgId })
      if (insErr) {
        setError(insErr.message)
        return
      }
    }
    setModalOpen(false)
    setEditing(null)
    await fetchBuildings()
    // El switcher global lee buildings; refrescamos el contexto.
    refresh()
  }

  async function deleteBuilding(building: Building) {
    if (!activeOrgId) return
    const current = buildings.find((item) => item.id === building.id)
    const unitsCount = current?.units_count ?? 0

    if (unitsCount > 0) {
      setError(
        `No se puede eliminar "${building.name}" porque todavía tiene ${unitsCount} unidades ligadas.`,
      )
      return
    }

    if (!confirm(`¿Eliminar el edificio "${building.name}"?`)) return

    setError(null)

    const { error: stakesErr } = await supabase
      .from('ownership_stakes')
      .delete()
      .eq('org_id', activeOrgId)
      .eq('building_id', building.id)

    if (stakesErr) {
      setError(stakesErr.message)
      return
    }

    const { error: deleteErr } = await supabase
      .from('buildings')
      .delete()
      .eq('org_id', activeOrgId)
      .eq('id', building.id)

    if (deleteErr) {
      setError(deleteErr.message)
      return
    }

    if (editing?.id === building.id) {
      setModalOpen(false)
      setEditing(null)
    }

    await fetchBuildings()
    refresh()
  }

  const totalUnits = useMemo(
    () => buildings.reduce((acc, b) => acc + (b.units_count || 0), 0),
    [buildings],
  )

  // Sin sesión / sin org
  if (!ctxLoading && !activeOrgId) {
    return (
      <div className="p-8">
        <EmptyState
          icon={Building2}
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
            Edificios
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {activeOrg?.name || 'PM Company'} ·{' '}
            {buildings.length}{' '}
            {buildings.length === 1 ? 'edificio' : 'edificios'} · {totalUnits}{' '}
            unidades
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo edificio
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable />
      ) : buildings.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aún no tienes edificios"
          description="Agrega el primero para empezar a registrar unidades, contratos y cobros."
          actionLabel="Ir al onboarding"
          actionHref="/onboarding"
        />
      ) : (
        <>
          {/* Mobile: cards apiladas. Desktop: tabla. Sprint 4 / S4-0 fix responsive. */}
          <div className="md:hidden space-y-2">
            {buildings.map((b) => (
              <div
                key={b.id}
                className="w-full card p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 dark:text-white truncate">
                      {b.name}
                    </div>
                    {(b.address || b.city) && (
                      <div className="mt-1 flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                        <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                        <span className="truncate">
                          {[b.address, b.city, b.state]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <span className="text-gray-600 dark:text-gray-300">
                        <span className="tabular-nums font-medium">{b.units_count ?? 0}</span>{' '}
                        unidades
                      </span>
                      <span className="text-gray-600 dark:text-gray-300">
                        <span className="tabular-nums font-medium">{b.owners_count ?? 0}</span>{' '}
                        propietarios
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setEditing(b)
                        setModalOpen(true)
                      }}
                      className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteBuilding(b)}
                      className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block card overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-800">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3">Edificio</th>
                  <th className="px-4 py-3">Ubicación</th>
                  <th className="px-4 py-3 text-right">Unidades</th>
                  <th className="px-4 py-3 text-right">Propietarios</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {buildings.map((b) => (
                  <tr
                    key={b.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {b.name}
                      </div>
                      {b.notes && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                          {b.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {b.address || b.city ? (
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                          <div>
                            {b.address && <div>{b.address}</div>}
                            <div className="text-xs text-gray-500">
                              {[b.city, b.state, b.country]
                                .filter(Boolean)
                                .join(', ')}
                              {b.postal_code ? ` · CP ${b.postal_code}` : ''}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-900 dark:text-white">
                      {b.units_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-900 dark:text-white">
                      {b.owners_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditing(b)
                            setModalOpen(true)
                          }}
                          className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteBuilding(b)}
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalOpen && (
        <BuildingModal
          building={editing}
          onSave={handleSave}
          onDelete={editing ? () => deleteBuilding(editing) : undefined}
          onClose={() => {
            setModalOpen(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
