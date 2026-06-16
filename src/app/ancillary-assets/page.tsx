'use client'

import { useEffect, useState } from 'react'
import { Megaphone, Plus, Pencil, Trash2, X, Save, Package, RadioTower, Tag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrgContext } from '@/hooks/useOrgContext'
import { useToast } from '@/components/Toast'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import type { AncillaryOwnership, AncillaryStatus } from '@/types'

// Los activos discretos (parking es un pool del edificio, no un activo)
type AssetKind = 'billboard' | 'storage' | 'antenna' | 'other'
const ASSET_KINDS: AssetKind[] = ['billboard', 'storage', 'antenna', 'other']

const KIND_LABELS: Record<AssetKind, string> = {
  billboard: 'Espectacular',
  storage: 'Bodega',
  antenna: 'Antena',
  other: 'Otro',
}

const KIND_COLORS: Record<AssetKind, string> = {
  billboard: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  storage: 'bg-orange-500/15 text-orange-500 border-orange-500/20',
  antenna: 'bg-teal-500/15 text-teal-500 border-teal-500/20',
  other: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
}

const KIND_ICONS: Record<AssetKind, React.ComponentType<{ className?: string }>> = {
  billboard: Megaphone,
  storage: Package,
  antenna: RadioTower,
  other: Tag,
}

const OWNERSHIP_LABELS: Record<AncillaryOwnership, string> = {
  ours: 'Nuestra (estructura propia)',
  third_party: 'De terceros',
}

const STATUS_LABELS: Record<AncillaryStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  ended: 'Terminado',
}

interface AssetRow {
  id: string
  building_id: string | null
  kind: AssetKind
  label: string
  ownership: AncillaryOwnership
  status: AncillaryStatus
  notes: string | null
  created_at: string
  building?: { name: string } | null
}

interface BuildingOption {
  id: string
  name: string
}

const emptyForm = {
  label: '',
  kind: 'billboard' as AssetKind,
  building_id: '' as string,
  ownership: 'ours' as AncillaryOwnership,
  status: 'active' as AncillaryStatus,
  notes: '',
}

export default function AncillaryAssetsPage() {
  const toast = useToast()
  const { orgId } = useOrgContext()
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [buildings, setBuildings] = useState<BuildingOption[]>([])
  const [loading, setLoading] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AssetRow | null>(null)

  async function fetchAssets() {
    setLoading(true)
    const { data } = await supabase
      .from('ancillary_assets')
      .select('*, building:buildings(name)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    setAssets((data || []) as unknown as AssetRow[])
    setLoading(false)
  }

  async function fetchBuildings() {
    const { data } = await supabase
      .from('buildings')
      .select('id, name')
      .order('name')
    setBuildings((data || []) as unknown as BuildingOption[])
  }

  useEffect(() => {
    if (!orgId) return
    fetchBuildings()
    fetchAssets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  function openNew() {
    setEditingId(null)
    setForm({ ...emptyForm })
    setShowModal(true)
  }

  function openEdit(asset: AssetRow) {
    setEditingId(asset.id)
    setForm({
      label: asset.label,
      kind: asset.kind,
      building_id: asset.building_id || '',
      ownership: asset.ownership,
      status: asset.status,
      notes: asset.notes || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      org_id: orgId,
      label: form.label,
      kind: form.kind,
      building_id: form.building_id || null,
      ownership: form.ownership,
      status: form.status,
      notes: form.notes || null,
    }

    let error = null
    if (editingId) {
      const res = await supabase.from('ancillary_assets').update(payload).eq('id', editingId)
      error = res.error
    } else {
      const res = await supabase.from('ancillary_assets').insert(payload)
      error = res.error
    }

    setShowModal(false)
    setSaving(false)
    if (error) {
      toast.error('Error al guardar — intenta de nuevo')
    } else {
      toast.success('Activo guardado')
    }
    fetchAssets()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      const res = await fetch(`/api/ancillary-assets?id=${deleteTarget.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) {
        toast.error('Error al eliminar activo — intenta de nuevo')
      } else {
        toast.success('Activo eliminado')
      }
    } catch {
      toast.error('Error al eliminar activo — intenta de nuevo')
    }
    setDeleteTarget(null)
    setSaving(false)
    fetchAssets()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Megaphone className="w-6 h-6 text-purple-500" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Activos publicitarios</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Espectaculares, bodegas y antenas. El cobro se liga a un contrato en Cargos adicionales.
            </p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo activo
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable />
      ) : assets.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No hay activos registrados"
          description="Registra espectaculares (ej. el 809 o los del 2020), bodegas o antenas"
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Etiqueta</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Edificio</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Propiedad</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => {
                const Icon = KIND_ICONS[asset.kind]
                return (
                  <tr key={asset.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${KIND_COLORS[asset.kind]}`}>
                        <Icon className="w-3 h-3" />
                        {KIND_LABELS[asset.kind]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {asset.label}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {asset.building?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {OWNERSHIP_LABELS[asset.ownership]}
                    </td>
                    <td className="px-4 py-3">
                      <span className={asset.status === 'active' ? 'text-green-500' : 'text-gray-400'}>
                        {STATUS_LABELS[asset.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEdit(asset)}
                          title="Editar"
                          className="p-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(asset)}
                          title="Eliminar"
                          className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-lg mx-4 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {editingId ? 'Editar activo' : 'Nuevo activo'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Etiqueta</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className="input-field w-full"
                  placeholder='Ej. "Espectacular 809" o "Azotea 2020 #3"'
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
                  <select
                    value={form.kind}
                    onChange={(e) => setForm({ ...form, kind: e.target.value as AssetKind })}
                    className="input-field w-full"
                  >
                    {ASSET_KINDS.map((k) => (
                      <option key={k} value={k}>{KIND_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Propiedad</label>
                  <select
                    value={form.ownership}
                    onChange={(e) => setForm({ ...form, ownership: e.target.value as AncillaryOwnership })}
                    className="input-field w-full"
                  >
                    <option value="ours">Nuestra (estructura propia)</option>
                    <option value="third_party">De terceros</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Edificio</label>
                <select
                  value={form.building_id}
                  onChange={(e) => setForm({ ...form, building_id: e.target.value })}
                  className="input-field w-full"
                >
                  <option value="">Sin edificio</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Estado</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as AncillaryStatus })}
                  className="input-field w-full"
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                  <option value="ended">Terminado</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="input-field w-full"
                  rows={2}
                  placeholder="Opcional"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.label}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Eliminar activo</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              ¿Eliminar <strong className="text-gray-900 dark:text-white">{deleteTarget.label}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
