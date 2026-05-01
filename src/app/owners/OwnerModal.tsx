'use client'

// BaW OS — OwnerModal (Sprint 4 / S4-0)
// Modal de creación / edición de Property Owners (clientes del PM).

import { useState } from 'react'
import { X } from 'lucide-react'
import type { PropertyOwner } from '@/types'

interface Props {
  owner: PropertyOwner | null
  onSave: (data: Partial<PropertyOwner>) => void
  onDelete?: () => void
  onClose: () => void
}

export default function OwnerModal({ owner, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState({
    full_name: owner?.full_name || '',
    email: owner?.email || '',
    phone: owner?.phone || '',
    rfc: owner?.rfc || '',
    notes: owner?.notes || '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      rfc: form.rfc.trim().toUpperCase() || null,
      notes: form.notes.trim() || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800 rounded-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {owner ? 'Editar propietario' : 'Nuevo propietario'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
              Nombre / Razón social <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="input-field"
              placeholder="Ej: María López, Inmobiliaria Sur SA de CV"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input-field"
                placeholder="propietario@ejemplo.com"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                Teléfono
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input-field"
                placeholder="+52 55 1234 5678"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
              RFC
            </label>
            <input
              type="text"
              value={form.rfc}
              onChange={(e) =>
                setForm({ ...form, rfc: e.target.value.toUpperCase() })
              }
              className="input-field"
              placeholder="Para emisión de facturas"
              maxLength={13}
            />
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
              placeholder="Datos bancarios, preferencias de contacto…"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            {owner && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="mr-auto px-4 py-2 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
              >
                Eliminar
              </button>
            )}
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
              {owner ? 'Guardar cambios' : 'Crear propietario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
