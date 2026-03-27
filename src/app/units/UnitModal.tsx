'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Unit, UnitType, UnitStatus } from '@/types'

interface Props {
  unit: Unit | null
  onSave: (data: Partial<Unit>) => void
  onClose: () => void
}

export default function UnitModal({ unit, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    number: unit?.number || '',
    floor: unit?.floor?.toString() || '',
    type: unit?.type || 'LTR' as UnitType,
    status: unit?.status || 'available' as UnitStatus,
    area_m2: unit?.area_m2?.toString() || '',
    bedrooms: unit?.bedrooms?.toString() || '',
    bathrooms: unit?.bathrooms?.toString() || '',
    notes: unit?.notes || '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      number: form.number,
      floor: form.floor ? Number(form.floor) : undefined,
      type: form.type,
      status: form.status,
      area_m2: form.area_m2 ? Number(form.area_m2) : undefined,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
      bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
      notes: form.notes || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800 rounded-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {unit ? 'Editar unidad' : 'Nueva unidad'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Número</label>
              <input
                type="text"
                required
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                className="input-field"
                placeholder="Ej: 101"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Piso</label>
              <input
                type="number"
                value={form.floor}
                onChange={(e) => setForm({ ...form, floor: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as UnitType })}
                className="input-field"
              >
                <option value="LTR">Larga estancia (LTR)</option>
                <option value="MTR">Media estancia (MTR)</option>
                <option value="STR">Corta estancia (STR)</option>
                <option value="OFFICE">Oficina</option>
                <option value="COMMON">Área común</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Estado</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as UnitStatus })}
                className="input-field"
              >
                <option value="available">Disponible</option>
                <option value="occupied">Ocupado</option>
                <option value="maintenance">Mantenimiento</option>
                <option value="reserved">Reservado</option>
                <option value="inactive">Inactivo</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Área (m²)</label>
              <input
                type="number"
                step="0.01"
                value={form.area_m2}
                onChange={(e) => setForm({ ...form, area_m2: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Recámaras</label>
              <input
                type="number"
                value={form.bedrooms}
                onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Baños</label>
              <select
                value={form.bathrooms}
                onChange={(e) => setForm({ ...form, bathrooms: e.target.value })}
                className="input-field"
              >
                <option value="">—</option>
                <option value="1">1 baño</option>
                <option value="1.5">1.5 baños</option>
                <option value="2">2 baños</option>
                <option value="2.5">2.5 baños</option>
                <option value="3">3 baños</option>
                <option value="3.5">3.5 baños</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Notas</label>
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
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {unit ? 'Guardar cambios' : 'Crear unidad'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
