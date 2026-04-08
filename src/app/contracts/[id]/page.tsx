'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, AlertTriangle, Trash2, Check, ExternalLink, RefreshCw, Copy, Send, PenTool, Loader2, CheckCircle2, Clock, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils'
import { useToast } from '@/components/Toast'
import Breadcrumbs from '@/components/Breadcrumbs'
import { SkeletonDashboard } from '@/components/Skeleton'
import type { Contract, Payment } from '@/types'
import { getAlertLevel, getAlertColor, getAlertText } from '@/lib/contract-alerts'
import Link from 'next/link'

export default function ContractDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [contract, setContract] = useState<Contract | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteOccupantTarget, setDeleteOccupantTarget] = useState(false)
  const [saving, setSaving] = useState(false)
  const [markingPaid, setMarkingPaid] = useState<string | null>(null)
  const [driveFolderUrl, setDriveFolderUrl] = useState('')
  const [savingDrive, setSavingDrive] = useState(false)
  const [togglingPortal, setTogglingPortal] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [signatureModal, setSignatureModal] = useState(false)
  const [signerEmail, setSignerEmail] = useState('')
  const [sendingSignature, setSendingSignature] = useState(false)
  const [signatureResult, setSignatureResult] = useState<{ widgetUrl?: string } | null>(null)
  const [signatureSigners, setSignatureSigners] = useState<{ email: string; signed: boolean; signedAt: string | null }[]>([])
  const [loadingSignature, setLoadingSignature] = useState(false)
  const toast = useToast()

  async function fetchData() {
    const contractId = Array.isArray(params.id) ? params.id[0] : params.id
    const [contractRes, paymentsRes] = await Promise.all([
      supabase
        .from('contracts')
        .select('*, portal_token, portal_enabled, mifiel_document_id, signature_status, unit:units(number, floor, type), occupant:occupants(name, phone, email, rfc, razon_social, regimen_fiscal, cp_fiscal, email_factura, requiere_factura)')
        .eq('id', contractId)
        .single(),
      supabase
        .from('payments')
        .select('*')
        .eq('contract_id', contractId)
        .order('due_date', { ascending: false }),
    ])
    setContract(contractRes.data)
    setPayments(paymentsRes.data || [])
    setDriveFolderUrl(contractRes.data?.drive_folder_url || '')
    setLoading(false)
  }

  async function fetchSignatureStatus(docId: string) {
    setLoadingSignature(true)
    try {
      const res = await fetch(`/api/mifiel/status/${docId}`)
      const json = await res.json()
      if (json.success) {
        setSignatureSigners(json.data.signers || [])
      }
    } catch { /* ignore */ }
    setLoadingSignature(false)
  }

  async function handleSendSignature() {
    if (!contract || !signerEmail) return
    setSendingSignature(true)
    try {
      const occupantName = (contract.occupant as { name: string } | null)?.name || 'Firmante'
      const res = await fetch('/api/mifiel/create-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: contract.id,
          signers: [{ name: occupantName, email: signerEmail }],
        }),
      })
      const json = await res.json()
      if (json.success) {
        setSignatureResult({ widgetUrl: json.data.widgetUrl })
        setContract({ ...contract, signature_status: 'pending', mifiel_document_id: json.data.documentId })
        toast.success('Documento enviado para firma')
      } else {
        toast.error(json.error || 'Error al crear documento')
      }
    } catch {
      toast.error('Error de conexión')
    }
    setSendingSignature(false)
  }

  useEffect(() => {
    fetchData()
  }, [params.id])

  useEffect(() => {
    if (contract?.mifiel_document_id && contract.signature_status === 'pending') {
      fetchSignatureStatus(contract.mifiel_document_id)
    }
  }, [contract?.mifiel_document_id])

  async function handleDeleteOccupant() {
    if (!contract) return
    setSaving(true)
    await supabase.from('occupants').delete().eq('id', contract.occupant_id)
    setDeleteOccupantTarget(false)
    setSaving(false)
    router.push('/contracts')
  }

  async function handleMarkPaid(payment: Payment) {
    setMarkingPaid(payment.id)
    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase
      .from('payments')
      .update({
        status: 'paid',
        amount_paid: payment.amount,
        paid_date: today,
      })
      .eq('id', payment.id)
    setMarkingPaid(null)
    if (error) {
      toast.error('Error al guardar — intenta de nuevo')
    } else {
      toast.success('Pago registrado correctamente')
    }
    fetchData()
  }

  async function handleTogglePortal() {
    if (!contract) return
    setTogglingPortal(true)
    const { error } = await supabase
      .from('contracts')
      .update({ portal_enabled: !contract.portal_enabled })
      .eq('id', contract.id)
    setTogglingPortal(false)
    if (error) {
      toast.error('Error al actualizar portal')
    } else {
      setContract({ ...contract, portal_enabled: !contract.portal_enabled })
      toast.success(contract.portal_enabled ? 'Portal desactivado' : 'Portal activado')
    }
  }

  if (loading) return <SkeletonDashboard />
  if (!contract) return <div className="text-gray-400 dark:text-gray-500">Contrato no encontrado.</div>

  const unit = contract.unit as { number: string; floor: number; type: string } | null
  const occupant = contract.occupant as { name: string; phone?: string; email?: string; rfc?: string; razon_social?: string; regimen_fiscal?: string; cp_fiscal?: string; email_factura?: string; requiere_factura?: boolean } | null
  const days = contract.end_date ? daysUntil(contract.end_date) : null
  const alertLevel = ['active', 'en_renovacion'].includes(contract.status)
    ? getAlertLevel(contract.end_date)
    : null
  const isExpiring = days !== null && days <= 30 && days > 0 && contract.status === 'active'

  const statusLabels: Record<string, string> = {
    active: 'Activo',
    expired: 'Vencido',
    terminated: 'Terminado',
    pending: 'Pendiente',
    renewed: 'Renovado',
    en_renovacion: 'En renovación',
  }

  const paymentStatusLabels: Record<string, string> = {
    pending: 'Pendiente',
    paid: 'Pagado',
    late: 'En mora',
    partial: 'Parcial',
    waived: 'Condonado',
  }

  const paymentStatusBadge: Record<string, string> = {
    pending: 'badge-pending',
    paid: 'badge-paid',
    late: 'badge-late',
    partial: 'badge-maintenance',
    waived: 'badge-expired',
  }

  const totalPaid = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.amount_paid || p.amount), 0)
  const totalPending = payments
    .filter((p) => p.status === 'pending' || p.status === 'late')
    .reduce((sum, p) => sum + Number(p.amount), 0)

  return (
    <div className="max-w-3xl space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Contratos', href: '/contracts' },
        { label: occupant?.name || 'Contrato' },
      ]} />
      <div className="flex items-center gap-4">
        <Link
          href="/contracts"
          className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Contrato — {occupant?.name || 'Sin inquilino'}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Unidad {unit?.number || '—'} · {statusLabels[contract.status]}
          </p>
        </div>
      </div>

      {alertLevel && days !== null && (
        <div className={`flex items-center gap-3 p-4 rounded-lg border ${getAlertColor(alertLevel)}`}>
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">
              {getAlertText(alertLevel, days)}
            </p>
            <p className="text-xs opacity-75 mt-0.5">
              Fecha de vencimiento: {formatDate(contract.end_date!)}
            </p>
          </div>
        </div>
      )}

      {contract.status === 'en_renovacion' && (
        <div className="card border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              <p className="text-sm text-yellow-400 font-medium">
                Contrato en renovación — pendiente de renovar
              </p>
            </div>
            <Link
              href="/contracts"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition-colors shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Renovar ahora
            </Link>
          </div>
        </div>
      )}

      {isExpiring && (
        <div className="card border-amber-500/30">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <p className="text-sm text-amber-400">
              Este contrato vence en {days} días ({formatDate(contract.end_date!)}).
              Contactar al inquilino para renovación.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Inquilino
            </h3>
            <button
              onClick={() => setDeleteOccupantTarget(true)}
              title="Eliminar inquilino"
              className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-gray-900 dark:text-white font-medium">{occupant?.name || '—'}</p>
          {occupant?.phone && <p className="text-sm text-gray-500 dark:text-gray-400">{occupant.phone}</p>}
          {occupant?.email && <p className="text-sm text-gray-500 dark:text-gray-400">{occupant.email}</p>}
        </div>
        <div className="card space-y-3">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Unidad
          </h3>
          <p className="text-gray-900 dark:text-white font-medium">
            {unit?.number || '—'} — Piso {unit?.floor ?? '—'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Tipo: {unit?.type || '—'}</p>
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
          Detalles del contrato
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500">Renta mensual</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(contract.monthly_amount)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500">Depósito</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {contract.deposit_amount ? formatCurrency(contract.deposit_amount) : '—'}
            </p>
            {contract.deposit_amount && (
              <p className={`text-xs ${contract.deposit_paid ? 'text-emerald-400' : 'text-amber-400'}`}>
                {contract.deposit_paid ? 'Pagado' : 'Pendiente'}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500">Período</p>
            <p className="text-sm text-gray-900 dark:text-white">{formatDate(contract.start_date)}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {contract.end_date ? formatDate(contract.end_date) : 'Indefinido'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500">Día de pago</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{contract.payment_day}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Carpeta Drive</p>
          {contract.drive_folder_url && (
            <a
              href={contract.drive_folder_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300 mb-2"
            >
              📁 Ver expediente en Drive
            </a>
          )}
          <div className="flex items-center gap-2">
            <input
              type="url"
              placeholder="https://drive.google.com/drive/folders/..."
              value={driveFolderUrl}
              onChange={(e) => setDriveFolderUrl(e.target.value)}
              className="input-field flex-1 text-sm"
            />
            <button
              type="button"
              disabled={savingDrive}
              onClick={async () => {
                setSavingDrive(true)
                const { error } = await supabase
                  .from('contracts')
                  .update({ drive_folder_url: driveFolderUrl || null })
                  .eq('id', contract.id)
                if (!error) {
                  setContract({ ...contract, drive_folder_url: driveFolderUrl || undefined })
                }
                setSavingDrive(false)
              }}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
            >
              {savingDrive ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
        {contract.notes && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Notas</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{contract.notes}</p>
          </div>
        )}
      </div>

      {/* Datos del inquilino */}
      <div className="card">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
          Datos del inquilino
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500">Nombre</p>
            <p className="text-sm text-gray-900 dark:text-white">{occupant?.name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500">Teléfono</p>
            <p className="text-sm text-gray-900 dark:text-white">{occupant?.phone || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500">Email</p>
            <p className="text-sm text-gray-900 dark:text-white">{occupant?.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500">Tipo ID</p>
            <p className="text-sm text-gray-900 dark:text-white">—</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500">Número ID</p>
            <p className="text-sm text-gray-900 dark:text-white">—</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500">CURP</p>
            <p className="text-sm text-gray-900 dark:text-white">{contract.curp_arrendatario || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500">Domicilio</p>
            <p className="text-sm text-gray-900 dark:text-white">{contract.domicilio_arrendatario || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500">Aval</p>
            <p className="text-sm text-gray-900 dark:text-white">{contract.aval || '—'}</p>
          </div>
        </div>
      </div>

      {/* Datos fiscales */}
      {occupant?.rfc && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
            Datos fiscales
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">RFC</p>
              <p className="text-sm text-gray-900 dark:text-white font-mono">{occupant.rfc}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Razón social</p>
              <p className="text-sm text-gray-900 dark:text-white">{occupant.razon_social || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Régimen fiscal</p>
              <p className="text-sm text-gray-900 dark:text-white">{occupant.regimen_fiscal || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">CP fiscal</p>
              <p className="text-sm text-gray-900 dark:text-white">{occupant.cp_fiscal || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Email facturación</p>
              <p className="text-sm text-gray-900 dark:text-white">{occupant.email_factura || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Facturación</p>
              {occupant.requiere_factura ? (
                <span className="badge-pending">Requiere factura</span>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No requiere</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Link contrato Drive */}
      {contract.contract_url && (
        <a
          href={contract.contract_url}
          target="_blank"
          rel="noopener noreferrer"
          className="card flex items-center gap-3 hover:border-indigo-500/50 transition-colors group"
        >
          <ExternalLink className="w-5 h-5 text-indigo-400 group-hover:text-indigo-300" />
          <span className="text-sm font-medium text-indigo-400 group-hover:text-indigo-300">
            Ver contrato en Drive
          </span>
        </a>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Historial de pagos
          </h3>
          <div className="flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span>
              Cobrado: <span className="text-emerald-400 font-medium">{formatCurrency(totalPaid)}</span>
            </span>
            <span>
              Pendiente: <span className={`font-medium ${totalPending > 0 ? 'text-amber-400' : 'text-gray-400'}`}>{formatCurrency(totalPending)}</span>
            </span>
          </div>
        </div>
        {payments.length === 0 ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            No hay pagos registrados para este contrato.{' '}
            <Link href="/payments/new" className="text-indigo-400 hover:text-indigo-300">
              Registrar pago
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase py-2">Mes</th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase py-2">Monto</th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase py-2">Agua</th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase py-2">Pagado</th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase py-2">Fecha pago</th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase py-2">Método</th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase py-2">Estado</th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800/50">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 text-sm text-gray-700 dark:text-gray-300">{formatDate(p.due_date)}</td>
                  <td className="py-2 text-sm text-gray-900 dark:text-white">{formatCurrency(p.amount)}</td>
                  <td className="py-2 text-sm text-blue-400">
                    {p.water_fee ? formatCurrency(p.water_fee) : '—'}
                  </td>
                  <td className="py-2 text-sm text-gray-900 dark:text-white">
                    {p.amount_paid ? formatCurrency(p.amount_paid) : '—'}
                  </td>
                  <td className="py-2 text-sm text-gray-500 dark:text-gray-400">
                    {p.paid_date ? formatDate(p.paid_date) : '—'}
                  </td>
                  <td className="py-2 text-sm text-gray-500 dark:text-gray-400">{p.method || '—'}</td>
                  <td className="py-2">
                    <span className={paymentStatusBadge[p.status] || 'badge-expired'}>
                      {paymentStatusLabels[p.status] || p.status}
                    </span>
                  </td>
                  <td className="py-2">
                    {(p.status === 'pending' || p.status === 'late') && (
                      <button
                        onClick={() => handleMarkPaid(p)}
                        disabled={markingPaid === p.id}
                        title="Marcar como pagado"
                        className="p-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Firma Digital */}
      <div className="card">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
          Firma Digital
        </h3>
        {contract.signature_status === 'signed' ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-medium">
                Contrato firmado digitalmente
              </span>
            </div>
          </div>
        ) : contract.signature_status === 'pending' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-yellow-400" />
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full text-xs font-medium">
                Pendiente de firma
              </span>
            </div>
            {loadingSignature ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Consultando estado...
              </div>
            ) : signatureSigners.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 dark:text-gray-500">Firmantes:</p>
                {signatureSigners.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {s.signed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-yellow-400" />
                    )}
                    <span className="text-gray-700 dark:text-gray-300">{s.email}</span>
                    {s.signed && s.signedAt && (
                      <span className="text-xs text-gray-400">
                        — {new Date(s.signedAt).toLocaleDateString('es-MX')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            <button
              onClick={() => {
                setSignerEmail(occupant?.email || '')
                setSignatureResult(null)
                setSignatureModal(true)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <PenTool className="w-4 h-4" />
              Enviar para firma digital
            </button>
          </div>
        )}
      </div>

      {/* Signature Modal */}
      {signatureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4 relative">
            <button
              onClick={() => setSignatureModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              Firma digital — Mifiel
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Se enviará un email al firmante con el link para firmar el contrato.
            </p>
            {signatureResult?.widgetUrl ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-medium">Documento creado</span>
                </div>
                <p className="text-sm text-gray-400">
                  El firmante recibirá un email con instrucciones. También puedes compartir el link del widget:
                </p>
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                  <p className="text-xs text-gray-300 font-mono break-all">{signatureResult.widgetUrl}</p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(signatureResult.widgetUrl!)
                    toast.success('Link copiado')
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar link
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Email del firmante
                  </label>
                  <input
                    type="email"
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                    className="input-field w-full"
                    placeholder="inquilino@email.com"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setSignatureModal(false)}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSendSignature}
                    disabled={sendingSignature || !signerEmail}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {sendingSignature ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <PenTool className="w-4 h-4" />
                    )}
                    Enviar para firma
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Portal Inquilino */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Portal Inquilino
          </h3>
          <button
            onClick={handleTogglePortal}
            disabled={togglingPortal}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              contract.portal_enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                contract.portal_enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        {contract.portal_enabled && contract.portal_token && (
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Link del portal</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 font-mono break-all">
                baw-os.vercel.app/portal/{contract.portal_token}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `https://baw-os.vercel.app/portal/${contract.portal_token}`
                  )
                  setCopiedLink(true)
                  setTimeout(() => setCopiedLink(false), 2000)
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedLink ? 'Copiado!' : 'Copiar link'}
              </button>
              <button
                onClick={() => {
                  const msg = encodeURIComponent(
                    `Hola! Aquí está tu portal de inquilino BaW: https://baw-os.vercel.app/portal/${contract.portal_token}`
                  )
                  window.open(`https://wa.me/?text=${msg}`, '_blank')
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar por WhatsApp
              </button>
            </div>
          </div>
        )}
        {!contract.portal_enabled && (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Activa el portal para generar un link de acceso para el inquilino.
          </p>
        )}
      </div>

      {/* Delete Occupant Confirmation */}
      {deleteOccupantTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Eliminar inquilino</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              ¿Eliminar a <strong className="text-gray-900 dark:text-white">{occupant?.name || '—'}</strong>? Esta acción no se puede deshacer y también eliminará contratos asociados.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteOccupantTarget(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteOccupant}
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
