'use client'

import { useEffect, useState } from 'react'
import { Coins, Plus, Pencil, Trash2, X, Save, Car, Megaphone, Package, RadioTower, Tag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrgContext } from '@/hooks/useOrgContext'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import type { AncillaryKind, AncillaryCadence, AncillaryStatus } from '@/types'

const KINDS: AncillaryKind[] = ['parking', 'billboard', 'storage', 'antenna', 'other']

const KIND_LABELS: Record<AncillaryKind, string> = {
  parking: 'Estacionamiento',
  billboard: 'Espectacular',
  storage: 'Bodega',
  antenna: 'Antena',
  other: 'Otro',
}

const KIND_COLORS: Record<AncillaryKind, string> = {
  parking: 'bg-blue-500/15 text-blue-500 border-blue-500/20',
  billboard: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  storage: 'bg-orange-500/15 text-orange-500 border-orange-500/20',
  antenna: 'bg-teal-500/15 text-teal-500 border-teal-500/20',
  other: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
}

const KIND_ICONS: Record<AncillaryKind, React.ComponentType<{ className?: string }>> = {
  parking: Car,
  billboard: Megaphone,
  storage: Package,
  antenna: RadioTower,
  other: Tag,
}

const CADENCE_LABELS: Record<AncillaryCadence, string> = {
  monthly: 'Mensual',
  annual: 'Anual',
}

const STATUS_LABELS: Record<AncillaryStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  ended: 'Terminado',
}

interface ChargeRow {
  id: string
  contract_id: string
  asset_id: string | null
  kind: AncillaryKind
  description: string | null
  amount: number
  cadence: AncillaryCadence
  billing_day: number
  quantity: number
  effective_from: string
  effective_to: string | null
  status: AncillaryStatus
  notes: string | null
  created_at: string
  contract?: { id: string; unit?: { number: string } | null; occupant?: { name: string } | null } | null
  asset?: { label: string } | null
}

interface ContractOption {
  id: string
  unit?: { number: string } | null
  occupant?: { name: string } | null
}

function contractLabel(c?: ContractOption | ChargeRow['contract']): string {
  if (!c) return 'Contrato eliminado'
  const who = c.occupant?.name ?? 'Sin ocupante'
  const where = c.unit?.number ? `Depto ${c.unit.number}` : 'Independiente'
  return `${who} — ${where}`
}

const emptyForm = {
  contract_id: '',
  kind: 'parking' as AncillaryKind,
  description: '',
  amount: 0,
  cadence: 'monthly' as AncillaryCadence,
  billing_day: 1,
  quantity: 1,
  effective_from: new Date().toISOString().split('T')[0],
  effective_to: '',
  status: 'active' as AncillaryStatus,
  notes: '',
}

export default function AncillaryChargesPage() {
  const toast = useToast()
  const { orgId } = useOrgContext()
  const [charges, setCharges] = useState<ChargeRow[]>([])
  const [contracts, setContracts] = useState<ContractOption[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ChargeRow | null>(null)

  async function fetchCharges() {
    setLoading(true)
    const { data } = await supabase
      .from('ancillary_charges')
      .select('*, contract:contracts(id, unit:units(number), occupant:occupants(name)), asset:ancillary_assets(label)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    setCharges((data || []) as unknown as ChargeRow[])
    setLoading(false)
  }

  async function fetchContracts() {
    const { data } = await supabase
      .from('contracts')
      .select('id, unit:units(number), occupant:occupants(name)')
      .order('created_at', { ascending: false })
    setContracts((data || []) as unknown as ContractOption[])
  }

  useEffect(() => {
    if (!orgId) return
    fetchContracts()
    fetchCharges()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  function openNew() {
    setEditingId(null)
    setForm({ ...emptyForm })
    setShowModal(true)
  }

  function openEdit(charge: ChargeRow) {
    setEditingId(charge.id)
    setForm({
      contract_id: charge.contract_id,
      kind: charge.kind,
      description: charge.description || '',
      amount: Number(charge.amount),
      cadence: charge.cadence,
      billing_day: charge.billing_day,
      quantity: charge.quantity,
      effective_from: charge.effective_from,
      effective_to: charge.effective_to || '',
      status: charge.status,
      notes: charge.notes || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      org_id: orgId,
      contract_id: form.contract_id,
      kind: form.kind,
      description: form.description || null,
      amount: form.amount,
      cadence: form.cadence,
      billing_day: form.billing_day,
      quantity: form.quantity,
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      status: form.status,
      notes: form.notes || null,
    }

    let error = null
    if (editingId) {
      const res = await supabase.from('ancillary_charges').update(payload).eq('id', editingId)
      error = res.error
    } else {
      const res = await supabase.from('ancillary_charges').insert(payload)
      error = res.error
    }

    setShowModal(false)
    setSaving(false)
    if (error) {
      toast.error('Error al guardar — intenta de nuevo')
    } else {
      toast.success('Cargo guardado')
    }
    fetchCharges()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      const res = await fetch(`/api/ancillary-charges?id=${deleteTarget.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) {
        toast.error('Error al eliminar cargo — intenta de nuevo')
      } else {
        toast.success('Cargo eliminado')
      }
    } catch {
      toast.error('Error al eliminar cargo — intenta de nuevo')
    }
    setDeleteTarget(null)
    setSaving(false)
    fetchCharges()
  }

  // Totales de ingresos recurrentes activos (monto × cantidad)
  const periodTotal = (c: ChargeRow) => Number(c.amount) * (c.quantity || 1)
  const monthlyRecurring = charges
    .filter((c) => c.status === 'active' && c.cadence === 'monthly')
    .reduce((s, c) => s + periodTotal(c), 0)
  const annualRecurring = charges
    .filter((c) => c.status === 'active' && c.cadence === 'annual')
    .reduce((s, c) => s + periodTotal(c), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Coins className="w-6 h-6 text-indigo-500" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Cargos adicionales</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Estacionamiento extra y espectaculares, ligados a un contrato
            </p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo cargo
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="text-xs text-gray-500 dark:text-gray-400">Ingreso mensual recurrente</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(monthlyRecurring)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 dark:text-gray-400">Ingreso anual</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(annualRecurring)}</p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable />
      ) : charges.length === 0 ? (
        <EmptyState
          icon={Coins}
          title="No hay cargos adicionales"
          description="Registra cajones extra o espectaculares ligados a un contrato"
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Contrato</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Descripción</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Monto c/u</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Cant.</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Cadencia</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Día</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {charges.map((charge) => {
                const Icon = KIND_ICONS[charge.kind]
                return (
                  <tr key={charge.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${KIND_COLORS[charge.kind]}`}>
                        <Icon className="w-3 h-3" />
                        {KIND_LABELS[charge.kind]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {contractLabel(charge.contract)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
                      {charge.description || charge.asset?.label || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(Number(charge.amount))}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">
                      {charge.quantity}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {CADENCE_LABELS[charge.cadence]}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">
                      {charge.billing_day}
                    </td>
                    <td className="px-4 py-3">
                      <span className={charge.status === 'active' ? 'text-green-500' : 'text-gray-400'}>
                        {STATUS_LABELS[charge.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEdit(charge)}
                          title="Editar"
                          className="p-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(charge)}
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
              {editingId ? 'Editar cargo' : 'Nuevo cargo'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Contrato</label>
                <select
                  value={form.contract_id}
                  onChange={(e) => setForm({ ...form, contract_id: e.target.value })}
                  className="input-field w-full"
                >
                  <option value="">Seleccionar contrato...</option>
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>{contractLabel(c)}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Todo cargo cuelga de un contrato (puede ser independiente).</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
                  <select
                    value={form.kind}
                    onChange={(e) => setForm({ ...form, kind: e.target.value as AncillaryKind })}
                    className="input-field w-full"
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>{KIND_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Cadencia</label>
                  <select
                    value={form.cadence}
                    onChange={(e) => setForm({ ...form, cadence: e.target.value as AncillaryCadence })}
                    className="input-field w-full"
                  >
                    <option value="monthly">Mensual</option>
                    <option value="annual">Anual</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Descripción</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="input-field w-full"
                  placeholder='Ej. "2 cajones extra" o "Espectacular azotea"'
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Monto c/u</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                    className="input-field w-full"
                    min={0}
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Cantidad</label>
                  <input
                    type="number"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: Math.max(1, Number(e.target.value)) })}
                    className="input-field w-full"
                    min={1}
                    step="1"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Día cobro</label>
                  <input
                    type="number"
                    value={form.billing_day}
                    onChange={(e) => setForm({ ...form, billing_day: Math.min(28, Math.max(1, Number(e.target.value))) })}
                    className="input-field w-full"
                    min={1}
                    max={28}
                    step="1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Vigente desde</label>
                  <input
                    type="date"
                    value={form.effective_from}
                    onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Vigente hasta</label>
                  <input
                    type="date"
                    value={form.effective_to}
                    onChange={(e) => setForm({ ...form, effective_to: e.target.value })}
                    className="input-field w-full"
                    placeholder="Indefinido"
                  />
                </div>
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
                  disabled={saving || !form.contract_id || !form.amount}
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
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Eliminar cargo</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              ¿Eliminar el cargo de <strong className="text-gray-900 dark:text-white">{formatCurrency(Number(deleteTarget.amount))}</strong> ({KIND_LABELS[deleteTarget.kind]})? Esta acción no se puede deshacer.
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
