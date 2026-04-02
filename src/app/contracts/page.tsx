'use client'

import { useEffect, useState } from 'react'
import { Plus, FileText, AlertTriangle, Pencil, Trash2, X, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils'
import type { Contract, ContractStatus } from '@/types'
import Link from 'next/link'

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [editForm, setEditForm] = useState({
    monthly_amount: 0,
    payment_day: 1,
    status: 'active' as ContractStatus,
    notes: '',
    end_date: '',
    drive_link: '',
    aval: '',
    curp_arrendatario: '',
    domicilio_arrendatario: '',
  })
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null)
  const [saving, setSaving] = useState(false)

  async function fetchContracts() {
    setLoading(true)
    let query = supabase
      .from('contracts')
      .select('*, unit:units(number, floor, type), occupant:occupants(name, phone, email)')
      .order('created_at', { ascending: false })

    if (filterStatus !== 'all') query = query.eq('status', filterStatus)

    const { data } = await query
    setContracts(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchContracts()
  }, [filterStatus])

  function openEdit(contract: Contract) {
    setEditingContract(contract)
    const existingLink = contract.contract_url || contract.notes?.match(/📎 (https?:\/\/\S+)/)?.[1] || ''
    setEditForm({
      monthly_amount: contract.monthly_amount,
      payment_day: contract.payment_day,
      status: contract.status,
      notes: contract.notes?.replace(/\n?📎 https?:\/\/\S+/, '').trim() || '',
      end_date: contract.end_date || '',
      drive_link: existingLink,
      aval: contract.aval || '',
      curp_arrendatario: contract.curp_arrendatario || '',
      domicilio_arrendatario: contract.domicilio_arrendatario || '',
    })
  }

  async function handleSaveEdit() {
    if (!editingContract) return
    setSaving(true)
    let notesValue = editForm.notes || ''
    if (editForm.drive_link) {
      notesValue = notesValue ? `${notesValue}\n📎 ${editForm.drive_link}` : `📎 ${editForm.drive_link}`
    }
    await supabase
      .from('contracts')
      .update({
        monthly_amount: editForm.monthly_amount,
        payment_day: editForm.payment_day,
        status: editForm.status,
        notes: notesValue || null,
        end_date: editForm.end_date || null,
        aval: editForm.aval || null,
        curp_arrendatario: editForm.curp_arrendatario || null,
        domicilio_arrendatario: editForm.domicilio_arrendatario || null,
        contract_url: editForm.drive_link || null,
      })
      .eq('id', editingContract.id)
    setEditingContract(null)
    setSaving(false)
    fetchContracts()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    await supabase.from('contracts').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    setSaving(false)
    fetchContracts()
  }

  const statusLabels: Record<string, string> = {
    active: 'Activo',
    expired: 'Vencido',
    terminated: 'Terminado',
    pending: 'Pendiente',
    renewed: 'Renovado',
    en_renovacion: 'En renovación',
  }

  const statusBadge: Record<string, string> = {
    active: 'badge-active',
    expired: 'badge-expired',
    terminated: 'badge-late',
    pending: 'badge-pending',
    renewed: 'badge-occupied',
    en_renovacion: 'badge-pending',
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Contratos LTR / MTR</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {contracts.length} contrato(s) registrado(s)
          </p>
        </div>
        <Link
          href="/contracts/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nuevo contrato
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">Todos los estados</option>
          {Object.entries(statusLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-gray-400 dark:text-gray-500">Cargando contratos...</div>
      ) : contracts.length === 0 ? (
        <div className="card text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No hay contratos registrados</p>
          <Link
            href="/contracts/new"
            className="mt-4 inline-block text-indigo-400 hover:text-indigo-300 text-sm font-medium"
          >
            Crear primer contrato
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((contract) => {
            const days = contract.end_date ? daysUntil(contract.end_date) : null
            const isExpiring = days !== null && days <= 30 && days > 0 && contract.status === 'active'
            const isExpired = days !== null && days <= 0 && contract.status === 'active'
            const occupantName = (contract.occupant as { name: string } | null)?.name || 'Sin inquilino'

            return (
              <div
                key={contract.id}
                className="card hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <Link href={`/contracts/${contract.id}`} className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {occupantName}
                      </h3>
                      <span className={statusBadge[contract.status] || 'badge-expired'}>
                        {statusLabels[contract.status] || contract.status}
                      </span>
                      {isExpiring && (
                        <span className="badge-pending flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Vence en {days} días
                        </span>
                      )}
                      {isExpired && (
                        <span className="badge-late flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Vencido
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                      <span>
                        Unidad {(contract.unit as { number: string } | null)?.number || '—'}
                      </span>
                      <span>
                        {formatDate(contract.start_date)} — {contract.end_date ? formatDate(contract.end_date) : 'Indefinido'}
                      </span>
                      <span>Día de pago: {contract.payment_day}</span>
                    </div>
                  </Link>
                  <div className="flex items-start gap-3 shrink-0">
                    <div className="text-left sm:text-right">
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(contract.monthly_amount)}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">/ mes</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(contract)}
                        title="Editar contrato"
                        className="p-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(contract)}
                        title="Eliminar contrato"
                        className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editingContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-lg mx-4 relative">
            <button
              onClick={() => setEditingContract(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Editar contrato — {(editingContract.occupant as { name: string } | null)?.name || 'Sin inquilino'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Renta mensual</label>
                <input
                  type="number"
                  value={editForm.monthly_amount}
                  onChange={(e) => setEditForm({ ...editForm, monthly_amount: Number(e.target.value) })}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Día de pago</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={editForm.payment_day}
                  onChange={(e) => setEditForm({ ...editForm, payment_day: Number(e.target.value) })}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Estado</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ContractStatus })}
                  className="input-field w-full"
                >
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Fecha fin</label>
                <input
                  type="date"
                  value={editForm.end_date}
                  onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Notas</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="input-field w-full"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Link de Drive</label>
                <input
                  type="url"
                  value={editForm.drive_link}
                  onChange={(e) => setEditForm({ ...editForm, drive_link: e.target.value })}
                  className="input-field w-full"
                  placeholder="https://drive.google.com/..."
                />
              </div>

              {/* Datos Legales */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Datos Legales</h3>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Aval (nombre del garante)</label>
                  <input
                    type="text"
                    value={editForm.aval}
                    onChange={(e) => setEditForm({ ...editForm, aval: e.target.value })}
                    className="input-field w-full"
                    placeholder="Nombre completo del aval"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">CURP arrendatario</label>
                  <input
                    type="text"
                    value={editForm.curp_arrendatario}
                    onChange={(e) => setEditForm({ ...editForm, curp_arrendatario: e.target.value })}
                    className="input-field w-full"
                    placeholder="CURP de 18 caracteres"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Domicilio arrendatario</label>
                  <input
                    type="text"
                    value={editForm.domicilio_arrendatario}
                    onChange={(e) => setEditForm({ ...editForm, domicilio_arrendatario: e.target.value })}
                    className="input-field w-full"
                    placeholder="Calle, número, colonia, CP, ciudad"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setEditingContract(null)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
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
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Eliminar contrato</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              ¿Eliminar contrato de <strong className="text-gray-900 dark:text-white">{(deleteTarget.occupant as { name: string } | null)?.name || 'Sin inquilino'}</strong>? Esta acción no se puede deshacer.
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
