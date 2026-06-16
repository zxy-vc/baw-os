'use client'

import { useEffect, useState } from 'react'
import { Car, Save, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrgContext } from '@/hooks/useOrgContext'
import { useToast } from '@/components/Toast'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'

interface BuildingPool {
  id: string
  name: string
  parking_total: number
  included: number // suma de cajones incluidos por unidades del edificio
  extra: number // cajones extra cobrados (cargos activos)
}

export default function ParkingPage() {
  const toast = useToast()
  const { orgId } = useOrgContext()
  const [pools, setPools] = useState<BuildingPool[]>([])
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState<Record<string, number>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  async function fetchPools() {
    setLoading(true)

    const [{ data: buildings }, { data: units }, { data: charges }] = await Promise.all([
      supabase.from('buildings').select('id, name, parking_total').eq('org_id', orgId).order('name'),
      supabase.from('units').select('building_id, parking_included').eq('org_id', orgId),
      supabase
        .from('ancillary_charges')
        .select('quantity, contract:contracts(unit:units(building_id))')
        .eq('org_id', orgId)
        .eq('kind', 'parking')
        .eq('status', 'active'),
    ])

    // Sumar cajones incluidos por edificio
    const includedByBuilding: Record<string, number> = {}
    for (const u of (units || []) as unknown as { building_id: string | null; parking_included: number | null }[]) {
      if (!u.building_id) continue
      includedByBuilding[u.building_id] = (includedByBuilding[u.building_id] || 0) + (u.parking_included || 0)
    }

    // Sumar cajones extra cobrados por edificio (vía contrato → unidad → edificio)
    const extraByBuilding: Record<string, number> = {}
    for (const c of (charges || []) as unknown as { quantity: number; contract?: { unit?: { building_id: string | null } | null } | null }[]) {
      const bId = c.contract?.unit?.building_id
      if (!bId) continue
      extraByBuilding[bId] = (extraByBuilding[bId] || 0) + (c.quantity || 0)
    }

    const result: BuildingPool[] = ((buildings || []) as unknown as { id: string; name: string; parking_total: number | null }[]).map((b) => ({
      id: b.id,
      name: b.name,
      parking_total: b.parking_total || 0,
      included: includedByBuilding[b.id] || 0,
      extra: extraByBuilding[b.id] || 0,
    }))

    setPools(result)
    setLoading(false)
  }

  useEffect(() => {
    if (!orgId) return
    fetchPools()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  async function saveTotal(buildingId: string) {
    const value = edits[buildingId]
    if (value === undefined) return
    setSavingId(buildingId)
    const { error } = await supabase.from('buildings').update({ parking_total: value }).eq('id', buildingId)
    setSavingId(null)
    if (error) {
      toast.error('Error al guardar el total — intenta de nuevo')
    } else {
      toast.success('Total de cajones actualizado')
      setEdits((prev) => {
        const next = { ...prev }
        delete next[buildingId]
        return next
      })
      fetchPools()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Car className="w-6 h-6 text-blue-500" />
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Estacionamiento</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Pool de cajones por edificio. Los cajones extra se cobran en Cargos adicionales.
          </p>
        </div>
      </div>

      {loading ? (
        <SkeletonTable />
      ) : pools.length === 0 ? (
        <EmptyState
          icon={Car}
          title="No hay edificios"
          description="Registra edificios para administrar su pool de estacionamiento"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pools.map((p) => {
            const pending = edits[p.id] !== undefined ? edits[p.id] : p.parking_total
            const available = pending - p.included - p.extra
            return (
              <div key={p.id} className="card space-y-4">
                <h2 className="font-bold text-gray-900 dark:text-white">{p.name}</h2>

                {/* Total editable */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Total de cajones</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={pending}
                      onChange={(e) => setEdits({ ...edits, [p.id]: Math.max(0, Number(e.target.value)) })}
                      className="input-field w-24"
                    />
                    {edits[p.id] !== undefined && edits[p.id] !== p.parking_total && (
                      <button
                        onClick={() => saveTotal(p.id)}
                        disabled={savingId === p.id}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Guardar
                      </button>
                    )}
                  </div>
                </div>

                {/* Desglose */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Incluidos en unidades</span>
                    <span className="text-gray-700 dark:text-gray-300">{p.included}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Extra cobrados</span>
                    <span className="text-gray-700 dark:text-gray-300">{p.extra}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 dark:border-gray-800 pt-1.5">
                    <span className="font-medium text-gray-900 dark:text-white">Disponibles</span>
                    <span className={`font-bold ${available < 0 ? 'text-red-500' : available === 0 ? 'text-gray-400' : 'text-green-500'}`}>
                      {available}
                    </span>
                  </div>
                </div>

                {available < 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-red-500">
                    Asignados más cajones de los que existen — revisa el total.
                  </p>
                )}
                {available >= 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Check className="w-3.5 h-3.5" />
                    {available} cajón{available === 1 ? '' : 'es'} libre{available === 1 ? '' : 's'} para rentar
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
