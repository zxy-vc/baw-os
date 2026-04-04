'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { FileText, ArrowLeft, Download, XCircle, Loader2, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useToast } from '@/components/Toast'
import ConfirmModal from '@/components/ConfirmModal'

interface InvoiceDetail {
  id: string
  folio_number: number | null
  series: string
  status: string
  cfdi_use: string
  tax_regime: string
  subtotal: number
  tax: number
  total: number
  customer_rfc: string
  customer_name: string
  customer_email: string | null
  facturapi_id: string | null
  pdf_url: string | null
  xml_url: string | null
  notes: string | null
  created_at: string
  created_by: string | null
  mock_mode: boolean
  contract?: {
    id: string
    unit?: { number: string; type: string } | null
    occupant?: { name: string } | null
  } | null
  payment?: {
    id: string
    amount: number
    paid_date: string | null
    method: string | null
  } | null
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const toast = useToast()
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  async function fetchInvoice() {
    setLoading(true)
    try {
      const res = await fetch(`/api/invoices/${params.id}`)
      const json = await res.json()
      if (json.success) setInvoice(json.data)
    } catch {
      toast.error('Error cargando factura')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (params.id) fetchInvoice()
  }, [params.id])

  async function handleCancel() {
    if (!invoice) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        toast.success('Factura cancelada')
        fetchInvoice()
      } else {
        toast.error(json.error || 'Error cancelando factura')
      }
    } catch {
      toast.error('Error de conexión')
    }
    setCancelling(false)
    setShowCancelConfirm(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-48 animate-pulse" />
        <div className="card space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Factura no encontrada</p>
        <button onClick={() => router.push('/invoices')} className="mt-4 text-indigo-500 hover:text-indigo-400 text-sm">
          Volver a facturas
        </button>
      </div>
    )
  }

  const isMock = invoice.mock_mode || invoice.facturapi_id?.startsWith('mock_')
  const isCancelled = invoice.status === 'cancelled'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/invoices')} className="text-gray-400 hover:text-gray-200">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <FileText className="w-6 h-6 text-indigo-500" />
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            Factura {invoice.series}-{invoice.folio_number || '—'}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-sm">
            {formatDate(invoice.created_at)}
          </p>
        </div>
        <div className="ml-auto">
          {invoice.status === 'valid' && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Timbrada
            </span>
          )}
          {invoice.status === 'cancelled' && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30">
              Cancelada
            </span>
          )}
          {invoice.status === 'draft' && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/30">
              Borrador
            </span>
          )}
        </div>
      </div>

      {/* Mock banner */}
      {isMock && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-500">
            Factura en modo prueba — no timbrada ante el SAT
          </p>
        </div>
      )}

      {/* Fiscal data */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Datos Fiscales
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">RFC</span>
              <span className="font-mono text-gray-900 dark:text-white">{invoice.customer_rfc}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Razón Social</span>
              <span className="text-gray-900 dark:text-white">{invoice.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Email</span>
              <span className="text-gray-900 dark:text-white">{invoice.customer_email || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Régimen Fiscal</span>
              <span className="text-gray-900 dark:text-white">{invoice.tax_regime}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Uso CFDI</span>
              <span className="text-gray-900 dark:text-white">{invoice.cfdi_use}</span>
            </div>
          </div>
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Importes
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
              <span className="text-gray-900 dark:text-white">{formatCurrency(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">IVA</span>
              <span className="text-gray-900 dark:text-white">{formatCurrency(invoice.tax)}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-gray-900 dark:text-white">Total</span>
              <span className="text-gray-900 dark:text-white">{formatCurrency(invoice.total)}</span>
            </div>
          </div>

          {invoice.contract && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Unidad</span>
                <span className="text-gray-900 dark:text-white">{invoice.contract.unit?.number || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Inquilino</span>
                <span className="text-gray-900 dark:text-white">{invoice.contract.occupant?.name || '—'}</span>
              </div>
            </div>
          )}

          {invoice.payment && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Pago</span>
                <span className="text-gray-900 dark:text-white">{formatCurrency(invoice.payment.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Fecha pago</span>
                <span className="text-gray-900 dark:text-white">{formatDate(invoice.payment.paid_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Método</span>
                <span className="text-gray-900 dark:text-white">{invoice.payment.method || '—'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Notas</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300">{invoice.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          disabled={isMock || isCancelled}
          onClick={() => {
            if (invoice.pdf_url) window.open(invoice.pdf_url, '_blank')
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          title={isMock ? 'No disponible en modo prueba' : undefined}
        >
          <Download className="w-4 h-4" />
          Descargar PDF
        </button>
        <button
          disabled={isMock || isCancelled}
          onClick={() => {
            if (invoice.xml_url) window.open(invoice.xml_url, '_blank')
          }}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
          title={isMock ? 'No disponible en modo prueba' : undefined}
        >
          <Download className="w-4 h-4" />
          Descargar XML
        </button>
        {!isCancelled && (
          <button
            onClick={() => setShowCancelConfirm(true)}
            disabled={cancelling}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-500 rounded-lg text-sm font-medium transition-colors ml-auto"
          >
            {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Cancelar Factura
          </button>
        )}
      </div>

      {/* Cancel confirmation */}
      {showCancelConfirm && (
        <ConfirmModal
          isOpen={true}
          title="Cancelar Factura"
          description={`¿Estás seguro de cancelar la factura ${invoice.series}-${invoice.folio_number}? Esta acción no se puede deshacer.`}
          confirmText="Sí, cancelar"
          variant="danger"
          onConfirm={handleCancel}
          onClose={() => setShowCancelConfirm(false)}
        />
      )}
    </div>
  )
}
