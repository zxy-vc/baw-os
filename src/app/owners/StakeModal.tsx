'use client'

// BaW OS — StakeModal (Sprint 4 / S4-0)
// Modal para asignar / editar un ownership_stake (% de un building a un owner).

import { useState } from 'react'
import { X } from 'lucide-react'
import type { OwnershipStake, Building } from '@/types'

interface Props {
  stake: OwnershipStake | null
  buildings: Building[]
  ownerName: string
  remainingByBuilding: Record<string, number> // % libre por building (sin contar el stake actual)
  onSave: (data: Partial<OwnershipStake>) => void
  onClose: () => void
}

export default function StakeModal({
  stake,
  buildings,
  ownerName,
  remainingByBuilding,
  onSave,
  onClose,
}: Props) {
  const [form, setForm] = useState({
    building_id: stake?.building_id || (buildings[0]?.id ?? ''),
    percentage: stake?.percentage?.toString() || '100',
    starts_on: stake?.starts_on || '',
    ends_on: stake?.ends_on || '',
    notes: stake?.notes || '',
  })

  const remaining = remainingByBuilding[form.building_id] ?? 100
  const pctNum = Number(form.percentage) || 0
  const exceeds = pctNum > remaining

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (exceeds) return
    onSave({
      building_id: form.building_id,
      percentage: pctNum,
      starts_on: form.starts_on || null,
      ends_on: form.ends_on || null,
      notes: form.notes.trim() || null,
    })
  }

  if (buildings.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800 rounded-xl w-full max-w-md mx-4 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Sin edificios disponibles
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Crea al menos un edificio antes de asignarlo a un propietario.
          </p>
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800 rounded-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {stake ? 'Editar propiedad' : 'Asignar edificio'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Asignando porcentaje de propiedad a{' '}
            <span className="font-medium text-gray-900 dark:text-white">
              {ownerName}
            </span>
            .
          </p>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
              Edificio <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.building_id}
              onChange={(e) => setForm({ ...form, building_id: e.target.value })}
              className="input-field"
              disabled={Boolean(stake)}
            >
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.city ? ` · ${b.city}` : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              {remaining.toFixed(2)}% libre en este edificio.
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
              Porcentaje de propiedad <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                required
                step="0.01"
                min="0.01"
                max="100"
                value={form.percentage}
                onChange={(e) =>
                  setForm({ ...form, percentage: e.target.value })
                }
                className="input-field"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
            {exceeds && (
              <p className="mt-1 text-xs text-red-500">
                Excede el % libre. Máximo permitido: {remaining.toFixed(2)}%.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                Inicio
              </label>
              <input
                type="date"
                value={form.starts_on}
                onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                Fin (opcional)
              </label>
              <input
                type="date"
                value={form.ends_on}
                onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
              Notas
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="input-field"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={exceeds}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {stake ? 'Guardar cambios' : 'Asignar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
