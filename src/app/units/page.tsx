'use client'

import { useEffect, useState } from 'react'
import { Plus, Building2, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Unit, UnitType, UnitStatus } from '@/types'
import { cn } from '@/lib/utils'
import UnitModal from './UnitModal'

const statusLabels: Record<UnitStatus, string> = {
  available: 'Disponible',
  occupied: 'Ocupado',
  maintenance: 'Mantenimiento',
  reserved: 'Reservado',
  inactive: 'Inactivo',
}

const typeLabels: Record<UnitType, string> = {
  STR: 'Corta estancia',
  MTR: 'Media estancia',
  LTR: 'Larga estancia',
  OFFICE: 'Oficina',
  COMMON: 'Área común',
}

const statusBadgeClass: Record<UnitStatus, string> = {
  available: 'badge-available',
  occupied: 'badge-occupied',
  maintenance: 'badge-maintenance',
  reserved: 'badge-reserved',
  inactive: 'badge-expired',
}

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<UnitType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<UnitStatus | 'all'>('all')
  const [filterFloor, setFilterFloor] = useState<number | 'all'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)

  async function fetchUnits() {
    setLoading(true)
    let query = supabase.from('units').select('*').order('floor').order('number')

    if (filterType !== 'all') query = query.eq('type', filterType)
    if (filterStatus !== 'all') query = query.eq('status', filterStatus)
    if (filterFloor !== 'all') query = query.eq('floor', filterFloor)

    const { data } = await query
    setUnits(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchUnits()
  }, [filterType, filterStatus, filterFloor])

  const floors = Array.from(new Set(units.map((u) => u.floor).filter((f): f is number => f !== null && f !== undefined))).sort()

  function handleEdit(unit: Unit) {
    setEditingUnit(unit)
    setModalOpen(true)
  }

  function handleNew() {
    setEditingUnit(null)
    setModalOpen(true)
  }

  async function handleSave(unit: Partial<Unit>) {
    if (editingUnit) {
      await supabase.from('units').update(unit).eq('id', editingUnit.id)
    } else {
      await supabase.from('units').insert(unit)
    }
    setModalOpen(false)
    setEditingUnit(null)
    fetchUnits()
  }

  async function handleStatusChange(unitId: string, status: UnitStatus) {
    await supabase.from('units').update({ status }).eq('id', unitId)
    fetchUnits()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Registro de Unidades</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {units.length} unidades · ALM809P
          </p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva unidad
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as UnitType | 'all')}
          className="input-field w-auto"
        >
          <option value="all">Todos los tipos</option>
          {(Object.keys(typeLabels) as UnitType[]).map((t) => (
            <option key={t} value={t}>{typeLabels[t]}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as UnitStatus | 'all')}
          className="input-field w-auto"
        >
          <option value="all">Todos los estados</option>
          {(Object.keys(statusLabels) as UnitStatus[]).map((s) => (
            <option key={s} value={s}>{statusLabels[s]}</option>
          ))}
        </select>
        {floors.length > 0 && (
          <select
            value={filterFloor}
            onChange={(e) =>
              setFilterFloor(e.target.value === 'all' ? 'all' : Number(e.target.value))
            }
            className="input-field w-auto"
          >
            <option value="all">Todos los pisos</option>
            {floors.map((f) => (
              <option key={f} value={f}>Piso {f}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="text-gray-400 dark:text-gray-500">Cargando unidades...</div>
      ) : units.length === 0 ? (
        <div className="card text-center py-12">
          <Building2 className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No hay unidades registradas</p>
          <button
            onClick={handleNew}
            className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm font-medium"
          >
            Crear primera unidad
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Unidad
                </th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Piso
                </th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Tipo
                </th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Estado
                </th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Detalles
                </th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800/50">
              {units.map((unit) => (
                <tr key={unit.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-medium text-gray-900 dark:text-white">{unit.number}</span>
                  </td>
                  <td className="py-3 px-4 text-gray-500 dark:text-gray-400">
                    {unit.floor ?? '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{unit.type}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={statusBadgeClass[unit.status]}>
                      {statusLabels[unit.status]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                    {[
                      unit.bedrooms && `${unit.bedrooms} rec`,
                      unit.bathrooms && `${unit.bathrooms} baño(s)`,
                      unit.area_m2 && `${unit.area_m2} m²`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(unit)}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        Editar
                      </button>
                      <select
                        value={unit.status}
                        onChange={(e) =>
                          handleStatusChange(unit.id, e.target.value as UnitStatus)
                        }
                        className="bg-gray-100 border border-gray-300 text-gray-700 text-xs rounded px-2 py-1 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
                      >
                        {(Object.keys(statusLabels) as UnitStatus[]).map((s) => (
                          <option key={s} value={s}>{statusLabels[s]}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <UnitModal
          unit={editingUnit}
          onSave={handleSave}
          onClose={() => {
            setModalOpen(false)
            setEditingUnit(null)
          }}
        />
      )}
    </div>
  )
}
