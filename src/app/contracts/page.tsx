'use client'

import { useEffect, useState } from 'react'
import { Plus, FileText, AlertTriangle, Pencil, Trash2, X, Save, RefreshCw, ChevronDown, ChevronUp, PenTool, CheckCircle2, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils'
import { useToast } from '@/components/Toast'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import type { Contract, ContractStatus } from '@/types'
import { getAlertLevel, getAlertColor, getAlertText } from '@/lib/contract-alerts'
import Link from 'next/link'

export default function ContractsPage() {
  const toast = useToast()
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
  const [renewTarget, setRenewTarget] = useState<Contract | null>(null)
  const [renewForm, setRenewForm] = useState({
    monthly_amount: 0,
    payment_day: 5,
    start_date: '',
    end_date: '',
    deposit_amount: 0,
    deposit_paid: false,
  })
  const [alertsOpen, setAlertsOpen] = useState(true)

  const [allContracts, setAllContracts] = useState<Contract[]>([])

  async function fetchContracts() {
    setLoading(true)
    // Always fetch all for alerts computation
    const { data: all } = await supabase
      .from('contracts')
      .select('*, signature_status, mifiel_document_id, unit:units(number, floor, type), occupant:occupants(name, phone, email)')
      .order('created_at', { ascending: false })

    setAllContracts(all || [])

    if (filterStatus !== 'all') {
      setContracts((all || []).filter(c => c.status === filterStatus))
    } else {
      setContracts(all || [])
    }
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
    try {
      const res = await fetch(`/api/contracts?id=${deleteTarget.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) {
        toast.error('Error al eliminar contrato — intenta de nuevo')
      } else {
        toast.success('Contrato eliminado')
      }
    } catch {
      toast.error('Error al eliminar contrato — intenta de nuevo')
    }
    setDeleteTarget(null)
    setSaving(false)
    fetchContracts()
  }

  function openRenew(contract: Contract) {
    const today = new Date().toISOString().split('T')[0]
    const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
    setRenewTarget(contract)
    setRenewForm({
      monthly_amount: contract.monthly_amount,
      payment_day: contract.payment_day || 5,
      start_date: today,
      end_date: nextYear,
      deposit_amount: contract.deposit_amount || 0,
      deposit_paid: false,
    })
  }

  async function handleRenew() {
    if (!renewTarget) return
    setSaving(true)
    // Insert new contract
    const { error } = await supabase.from('contracts').insert({
      org_id: renewTarget.org_id,
      unit_id: renewTarget.unit_id,
      occupant_id: renewTarget.occupant_id,
      monthly_amount: renewForm.monthly_amount,
      payment_day: renewForm.payment_day,
      start_date: renewForm.start_date,
      end_date: renewForm.end_date,
      deposit_amount: renewForm.deposit_amount || null,
      deposit_paid: renewForm.deposit_paid,
      status: 'active',
    })
    if (!error) {
      // Update old contract status to renewed
      await supabase.from('contracts').update({ status: 'renewed' }).eq('id', renewTarget.id)
      toast.success('Contrato renovado correctamente')
    } else {
      toast.error('Error al guardar — intenta de nuevo')
    }
    setRenewTarget(null)
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

  // Compute alert groups from all active/en_renovacion contracts
  const alertContracts = allContracts
    .filter(c => ['active', 'en_renovacion'].includes(c.status) && c.end_date)
    .map(c => {
      const days = daysUntil(c.end_date!)
      const level = getAlertLevel(c.end_date)
      return { contract: c, days, level }
    })
    .filter(a => a.level !== null)
    .sort((a, b) => a.days - b.days)

  const expiredCount = alertContracts.filter(a => a.level === 'expired').length
  const criticalCount = alertContracts.filter(a => a.level === 'critical').length
  const warningCount = alertContracts.filter(a => a.level === 'warning').length
  const infoCount = alertContracts.filter(a => a.level === 'info').length
  const totalAlerts = alertContracts.length

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
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nuevo contrato
        </Link>
      </div>

      {/* Expiry Alerts Banner */}
      {totalAlerts > 0 && (
        <div className="card border-l-4 border-l-red-500 !p-0 overflow-hidden">
          <button
            onClick={() => setAlertsOpen(!alertsOpen)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Alertas de vencimiento
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {expiredCount > 0 && <span className="text-red-500 font-semibold">{expiredCount} vencido(s)</span>}
                {expiredCount > 0 && (criticalCount + warningCount + infoCount > 0) && ' · '}
                {criticalCount > 0 && <span className="text-red-400 font-semibold">{criticalCount} crítico(s)</span>}
                {criticalCount > 0 && (warningCount + infoCount > 0) && ' · '}
                {warningCount > 0 && <span className="text-orange-500 font-semibold">{warningCount} atención</span>}
                {warningCount > 0 && infoCount > 0 && ' · '}
                {infoCount > 0 && <span className="text-yellow-500 font-semibold">{infoCount} próximo(s)</span>}
              </span>
            </div>
            {alertsOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {alertsOpen && (
            <div className="border-t border-gray-200 dark:border-gray-700">
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {alertContracts.map(({ contract, days, level }) => {
                  const occupantName = (contract.occupant as { name: string } | null)?.name || 'Sin inquilino'
                  const unitNumber = (contract.unit as { number: string } | null)?.number || '—'
                  const unitFloor = (contract.unit as { floor: number } | null)?.floor
                  return (
                    <div key={contract.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                          {unitNumber}
                        </span>
                        <div className="min-w-0">
                          <span className="font-medium text-gray-900 dark:text-white">{occupantName}</span>
                          {unitFloor != null && (
                            <span className="text-gray-400 dark:text-gray-500 ml-2 text-xs">Piso {unitFloor}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                          {contract.end_date ? formatDate(contract.end_date) : '—'}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getAlertColor(level!)}`}>
                          {level === 'expired' ? '🔴' : level === 'critical' ? '🔴' : level === 'warning' ? '🟠' : '🟡'}
                          {level === 'expired' ? 'VENCIDO' : `${days}d`}
                        </span>
                        <button
                          onClick={() => openRenew(contract)}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Renovar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
        <SkeletonTable />
      ) : contracts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No hay contratos registrados"
          description="Registra el primer contrato LTR o MTR"
          actionLabel="Crear primer contrato"
          actionHref="/contracts/new"
        />
      ) : (
        <div className="space-y-3">
          {contracts.map((contract) => {
            const days = contract.end_date ? daysUntil(contract.end_date) : null
            const alertLevel = ['active', 'en_renovacion'].includes(contract.status)
              ? getAlertLevel(contract.end_date)
              : null
            const occupantName = (contract.occupant as { name: string } | null)?.name || 'Sin inquilino'
            const unitNumber = (contract.unit as { number: string } | null)?.number || '—'

            return (
              <div
                key={contract.id}
                className={`card hover:border-gray-300 dark:hover:border-gray-700 transition-all hover:shadow-sm ${
                  alertLevel === 'expired' || alertLevel === 'critical'
                    ? 'border-l-4 border-l-red-500'
                    : alertLevel === 'warning'
                    ? 'border-l-4 border-l-yellow-500'
                    : alertLevel === 'info'
                    ? 'border-l-4 border-l-blue-500'
                    : ''
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <Link href={`/contracts/${contract.id}`} className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-300 shrink-0">
                        {unitNumber}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {occupantName}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span className={statusBadge[contract.status] || 'badge-expired'}>
                            {statusLabels[contract.status] || contract.status}
                          </span>
                          {alertLevel && days !== null && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getAlertColor(alertLevel)}`}>
                              <AlertTriangle className="w-3 h-3" />
                              {getAlertText(alertLevel, days)}
                            </span>
                          )}
                          {contract.signature_status === 'signed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              Firmado
                            </span>
                          ) : contract.signature_status === 'pending' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                              <Clock className="w-3 h-3" />
                              En proceso
                            </span>
                          ) : (
                            <Link
                              href={`/contracts/${contract.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-500 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <PenTool className="w-3 h-3" />
                              Firmar
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400 pl-0 sm:pl-12">
                      <span>
                        {formatDate(contract.start_date)} — {contract.end_date ? formatDate(contract.end_date) : (<span className="text-gray-400">Indefinido</span>)}
                      </span>
                      <span>Día de pago: {contract.payment_day}</span>
                    </div>
                  </Link>
                  <div className="flex items-start gap-3 shrink-0">
                    <div className="text-left sm:text-right">
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {formatCurrency(contract.monthly_amount)}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">/ mes</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {contract.status === 'en_renovacion' && (
                        <button
                          onClick={() => openRenew(contract)}
                          title="Renovar contrato"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Renovar
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(contract)}
                        title="Editar contrato"
                        className="p-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-black dark:text-gray-400 transition-colors"
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
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
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

      {/* Renew Modal */}
      {renewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-lg mx-4 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setRenewTarget(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              Renovar contrato
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {(renewTarget.occupant as { name: string } | null)?.name || 'Sin inquilino'} — Unidad {(renewTarget.unit as { number: string } | null)?.number || '—'}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Renta mensual</label>
                <input
                  type="number"
                  value={renewForm.monthly_amount}
                  onChange={(e) => setRenewForm({ ...renewForm, monthly_amount: Number(e.target.value) })}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Día de pago</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={renewForm.payment_day}
                  onChange={(e) => setRenewForm({ ...renewForm, payment_day: Number(e.target.value) })}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Fecha inicio</label>
                <input
                  type="date"
                  value={renewForm.start_date}
                  onChange={(e) => setRenewForm({ ...renewForm, start_date: e.target.value })}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Fecha fin</label>
                <input
                  type="date"
                  value={renewForm.end_date}
                  onChange={(e) => setRenewForm({ ...renewForm, end_date: e.target.value })}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Depósito</label>
                <input
                  type="number"
                  value={renewForm.deposit_amount}
                  onChange={(e) => setRenewForm({ ...renewForm, deposit_amount: Number(e.target.value) })}
                  className="input-field w-full"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="deposit_paid"
                  checked={renewForm.deposit_paid}
                  onChange={(e) => setRenewForm({ ...renewForm, deposit_paid: e.target.checked })}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <label htmlFor="deposit_paid" className="text-sm text-gray-500 dark:text-gray-400">Depósito pagado</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setRenewTarget(null)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRenew}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  Renovar contrato
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
