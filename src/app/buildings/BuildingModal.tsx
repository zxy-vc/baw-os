'use client'

// BaW OS — BuildingModal (Sprint 4 / S4-0)
// Modal de creación / edición de edificios. Patrón clonado de UnitModal.

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Building } from '@/types'

interface Props {
  building: Building | null
  onSave: (data: Partial<Building>) => void
  onDelete?: () => void
  onClose: () => void
}

export default function BuildingModal({
  building,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [form, setForm] = useState({
    name: building?.name || '',
    address: building?.address || '',
    city: building?.city || '',
    state: building?.state || '',
    country: building?.country || 'MX',
    postal_code: building?.postal_code || '',
    notes: building?.notes || '',
    slug: building?.slug || '',
    public_name: building?.public_name || '',
    public_description: building?.public_description || '',
    is_public_listed: Boolean(building?.is_public_listed),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      name: form.name.trim(),
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      country: form.country.trim() || 'MX',
      postal_code: form.postal_code.trim() || null,
      notes: form.notes.trim() || null,
      slug: form.slug.trim() || null,
      public_name: form.public_name.trim() || null,
      public_description: form.public_description.trim() || null,
      // Sin slug no hay URL pública — el flag no puede quedar prendido.
      is_public_listed: form.is_public_listed && Boolean(form.slug.trim()),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800 rounded-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {building ? 'Editar edificio' : 'Nuevo edificio'}
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
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
              placeholder="Ej: Mateos 809, Reforma 250, Torre Norte..."
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
              Dirección
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="input-field"
              placeholder="Calle y número"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                Ciudad
              </label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="input-field"
                placeholder="CDMX, Guadalajara…"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                Estado
              </label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                País
              </label>
              <input
                type="text"
                required
                value={form.country}
                onChange={(e) =>
                  setForm({ ...form, country: e.target.value.toUpperCase() })
                }
                className="input-field"
                maxLength={2}
                placeholder="MX"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                Código postal
              </label>
              <input
                type="text"
                value={form.postal_code}
                onChange={(e) =>
                  setForm({ ...form, postal_code: e.target.value })
                }
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
              placeholder="Tipo de operación, particularidades del edificio…"
            />
          </div>

          {/* Publicación — listing público (/edificios/[slug]) */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-4">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Publicación (sitio público)
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                  Slug (URL)
                </label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                    })
                  }
                  className="input-field"
                  placeholder="mateos-809"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                  Nombre público
                </label>
                <input
                  type="text"
                  value={form.public_name}
                  onChange={(e) => setForm({ ...form, public_name: e.target.value })}
                  className="input-field"
                  placeholder="Como aparece a huéspedes"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                Descripción pública
              </label>
              <textarea
                value={form.public_description}
                onChange={(e) =>
                  setForm({ ...form, public_description: e.target.value })
                }
                rows={2}
                className="input-field"
                placeholder="Texto que ve el huésped en la landing del edificio"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_public_listed}
                onChange={(e) =>
                  setForm({ ...form, is_public_listed: e.target.checked })
                }
                disabled={!form.slug.trim()}
              />
              Listado públicamente en /edificios/{form.slug || '…'}
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            {building && onDelete && (
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
              {building ? 'Guardar cambios' : 'Crear edificio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
