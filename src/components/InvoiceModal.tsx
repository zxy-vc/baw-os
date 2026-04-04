'use client'

import { useState } from 'react'
import { X, FileText, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/components/Toast'

interface InvoiceModalProps {
  paymentId: string
  paymentAmount: number
  unitType?: string       // LTR | STR | MTR
  unitNumber?: string
  tenantName?: string
  // Pre-filled fiscal data from occupant
  defaultRfc?: string
  defaultLegalName?: string
  defaultZip?: string
  defaultEmail?: string
  defaultTaxSystem?: string
  onClose: () => void
  onCreated?: () => void
}

export default function InvoiceModal({
  paymentId,
  paymentAmount,
  unitType = 'LTR',
  unitNumber,
  tenantName,
  defaultRfc = '',
  defaultLegalName = '',
  defaultZip = '37340',
  defaultEmail = '',
  defaultTaxSystem = '616',
  onClose,
  onCreated,
}: InvoiceModalProps) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    rfc: defaultRfc,
    legal_name: defaultLegalName,
    zip: defaultZip,
    email: defaultEmail,
    tax_system: defaultTaxSystem,
    payment_form: '03',
    notes: '',
  })

  const isLTR = unitType === 'LTR'
  const taxRate = isLTR ? 0 : 0.16
  const subtotal = paymentAmount
  const tax = Math.round(subtotal * taxRate * 100) / 100
  const total = subtotal + tax

  async function handleSubmit() {
    if (!form.rfc || !form.legal_name) {
      toast.error('RFC y Razón Social son requeridos')
      return
    }
    setSaving(true)

    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: paymentId,
          rfc: form.rfc,
          legal_name: form.legal_name,
          zip: form.zip || '37340',
          email: form.email || undefined,
          tax_system: form.tax_system,
          payment_form: form.payment_form,
          notes: form.notes || undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Error generando factura')
        return
      }

      const isMock = json.data?.mock_mode
      toast.success(isMock ? 'Factura simulada creada' : 'CFDI generado correctamente')
      onCreated?.()
      onClose()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-lg mx-4 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Generar Factura CFDI
          </h2>
        </div>

        {unitNumber && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            Unidad {unitNumber} {tenantName ? `— ${tenantName}` : ''}
          </p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          Uso CFDI: {isLTR ? 'S01 (Sin obligación fiscal — Arrendamiento)' : 'G03 (Gastos en general — Hospedaje)'}
          {' · '}IVA: {isLTR ? '0%' : '16%'}
        </p>

        <div className="space-y-4">
          {/* RFC */}
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
              RFC <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.rfc}
              onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
              className="input-field w-full"
              placeholder="XAXX010101000"
              maxLength={13}
            />
          </div>

          {/* Razón Social */}
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
              Razón Social <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.legal_name}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
              className="input-field w-full"
              placeholder="Nombre o razón social"
            />
          </div>

          {/* CP */}
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
              Código Postal
            </label>
            <input
              type="text"
              value={form.zip}
              onChange={(e) => setForm({ ...form, zip: e.target.value })}
              className="input-field w-full"
              placeholder="37340"
              maxLength={5}
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
              Email (envío de factura)
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-field w-full"
              placeholder="correo@ejemplo.com"
            />
          </div>

          {/* Régimen Fiscal */}
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
              Régimen Fiscal
            </label>
            <select
              value={form.tax_system}
              onChange={(e) => setForm({ ...form, tax_system: e.target.value })}
              className="input-field w-full"
            >
              <option value="616">616 — Sin obligaciones fiscales</option>
              <option value="601">601 — General de Ley Personas Morales</option>
              <option value="612">612 — Personas Físicas con Actividades Empresariales</option>
              <option value="621">621 — Incorporación Fiscal</option>
              <option value="626">626 — Régimen Simplificado de Confianza</option>
            </select>
          </div>

          {/* Forma de Pago */}
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
              Forma de Pago
            </label>
            <select
              value={form.payment_form}
              onChange={(e) => setForm({ ...form, payment_form: e.target.value })}
              className="input-field w-full"
            >
              <option value="03">03 — Transferencia electrónica</option>
              <option value="01">01 — Efectivo</option>
              <option value="04">04 — Tarjeta de crédito</option>
              <option value="28">28 — Tarjeta de débito</option>
              <option value="02">02 — Cheque nominativo</option>
            </select>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
              Notas
            </label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input-field w-full"
              placeholder="Opcional"
            />
          </div>

          {/* Preview importe */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-1">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>IVA ({isLTR ? '0%' : '16%'})</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white pt-1 border-t border-gray-200 dark:border-gray-700">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              Generar CFDI
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
