'use client'

import { useEffect, useState } from 'react'
import { Plus, CreditCard, AlertTriangle, Check, X, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import InvoiceModal from '@/components/InvoiceModal'
import { useToast } from '@/components/Toast'
import Link from 'next/link'

interface ContractOption {
  id: string
  monthly_amount: number
  unit: { number: string } | null
  occupant: { name: string } | null
}

interface PaymentWithContract {
  id: string
  amount: number
  rent_amount: number | null
  water_fee: number | null
  amount_paid: number | null
  due_date: string
  paid_date: string | null
  status: string
  method: string | null
  reference: string | null
  notes: string | null
  contract: {
    monthly_amount: number
    occupant: { name: string } | null
    unit: { number: string; type: string } | null
  } | null
}

export default function PaymentsPage() {
  const toast = useToast()
  const [payments, setPayments] = useState<PaymentWithContract[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [markingPaid, setMarkingPaid] = useState<string | null>(null)
  const [invoicedPaymentIds, setInvoicedPaymentIds] = useState<Set<string>>(new Set())
  const [invoiceTarget, setInvoiceTarget] = useState<PaymentWithContract | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [hasDataCurrentMonth, setHasDataCurrentMonth] = useState(true)
  const [showPayModal, setShowPayModal] = useState(false)
  const [contracts, setContracts] = useState<ContractOption[]>([])
  const [savingPayment, setSavingPayment] = useState(false)
  const [payForm, setPayForm] = useState({
    contract_id: '',
    month: '2026-01',
    rent_amount: '',
    water_fee: '250',
    paid_date: new Date().toISOString().split('T')[0],
    method: 'Transferencia',
    reference: '',
  })

  const monthOptions = [
    { value: '2026-01', label: 'Enero 2026' },
    { value: '2026-02', label: 'Febrero 2026' },
    { value: '2026-03', label: 'Marzo 2026' },
    { value: '2026-04', label: 'Abril 2026' },
    { value: '2026-05', label: 'Mayo 2026' },
    { value: '2026-06', label: 'Junio 2026' },
    { value: '2026-07', label: 'Julio 2026' },
    { value: '2026-08', label: 'Agosto 2026' },
    { value: '2026-09', label: 'Septiembre 2026' },
    { value: '2026-10', label: 'Octubre 2026' },
    { value: '2026-11', label: 'Noviembre 2026' },
    { value: '2026-12', label: 'Diciembre 2026' },
  ]

  async function fetchContracts() {
    const { data } = await supabase
      .from('contracts')
      .select('id, monthly_amount, unit:units(number), occupant:occupants(name)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    setContracts((data as unknown as ContractOption[]) || [])
  }

  function openPayModal() {
    const now = new Date()
    setPayForm({
      contract_id: '',
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      rent_amount: '',
      water_fee: '250',
      paid_date: now.toISOString().split('T')[0],
      method: 'Transferencia',
      reference: '',
    })
    fetchContracts()
    setShowPayModal(true)
  }

  function handlePayContractChange(contractId: string) {
    const contract = contracts.find((c) => c.id === contractId)
    setPayForm({
      ...payForm,
      contract_id: contractId,
      rent_amount: contract ? String(contract.monthly_amount) : '',
    })
  }

  async function handlePaySubmit(e: React.FormEvent) {
    e.preventDefault()
    setSavingPayment(true)
    const rentAmount = Number(payForm.rent_amount) || 0
    const waterFee = Number(payForm.water_fee) || 0
    const totalAmount = rentAmount + waterFee
    const [year, month] = payForm.month.split('-').map(Number)
    const dueDate = `${year}-${String(month).padStart(2, '0')}-01`

    await supabase.from('payments').insert({
      org_id: 'ed4308c7-2bdb-46f2-be69-7c59674838e2',
      contract_id: payForm.contract_id,
      amount: totalAmount,
      rent_amount: rentAmount,
      water_fee: waterFee,
      amount_paid: totalAmount,
      due_date: dueDate,
      paid_date: payForm.paid_date,
      status: 'paid',
      method: payForm.method,
      reference: payForm.reference || null,
    })
    setSavingPayment(false)
    setShowPayModal(false)
    fetchPayments()
  }

  const payTotal = (Number(payForm.rent_amount) || 0) + (Number(payForm.water_fee) || 0)

  async function fetchPayments() {
    setLoading(true)
    const [year, month] = selectedMonth.split('-').map(Number)
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    let query = supabase
      .from('payments')
      .select('*, contract:contracts(monthly_amount, occupant:occupants(name), unit:units(number, type))')
      .gte('due_date', startDate)
      .lte('due_date', endDate)
      .order('due_date', { ascending: true })

    if (filterStatus !== 'all') query = query.eq('status', filterStatus)

    const { data } = await query
    const results = (data as PaymentWithContract[]) || []
    setPayments(results)
    setHasDataCurrentMonth(results.length > 0)

    // If no data for current month, auto-switch to most recent month with data
    if (results.length === 0 && filterStatus === 'all') {
      const { data: latestData } = await supabase
        .from('payments')
        .select('due_date')
        .order('due_date', { ascending: false })
        .limit(1)
      if (latestData && latestData.length > 0) {
        const latestDate = new Date(latestData[0].due_date)
        const latestMonth = `${latestDate.getFullYear()}-${String(latestDate.getMonth() + 1).padStart(2, '0')}`
        if (latestMonth !== selectedMonth) {
          setSelectedMonth(latestMonth)
          return
        }
      }
    }
    setLoading(false)
  }

  async function fetchInvoicedIds() {
    try {
      const res = await fetch(`/api/invoices?month=${selectedMonth}`)
      if (res.ok) {
        const json = await res.json()
        const ids = new Set<string>(
          (json.invoices || [])
            .filter((inv: { payment_id: string }) => inv.payment_id)
            .map((inv: { payment_id: string }) => inv.payment_id)
        )
        setInvoicedPaymentIds(ids)
      }
    } catch { /* silent */ }
  }

  useEffect(() => {
    fetchPayments()
    fetchInvoicedIds()
  }, [filterStatus, selectedMonth])

  async function handleMarkPaid(payment: PaymentWithContract) {
    setMarkingPaid(payment.id)
    const today = new Date().toISOString().split('T')[0]
    await supabase
      .from('payments')
      .update({
        status: 'paid',
        amount_paid: payment.amount,
        paid_date: today,
      })
      .eq('id', payment.id)
    setMarkingPaid(null)
    fetchPayments()
  }

  const statusLabels: Record<string, string> = {
    pending: 'Pendiente',
    paid: 'Pagado',
    late: 'En mora',
    partial: 'Parcial',
    waived: 'Condonado',
  }

  const statusBadge: Record<string, string> = {
    pending: 'badge-pending',
    paid: 'badge-paid',
    late: 'badge-late',
    partial: 'badge-maintenance',
    waived: 'badge-expired',
  }

  const totalExpected = payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const totalReceived = payments
    .filter((p) => p.status === 'paid' || p.status === 'partial')
    .reduce((sum, p) => sum + Number(p.amount_paid || 0), 0)
  const lateCount = payments.filter((p) => p.status === 'late').length
  const pendingCount = payments.filter((p) => p.status === 'pending').length

  const monthName = new Date(Number(selectedMonth.split('-')[0]), Number(selectedMonth.split('-')[1]) - 1)
    .toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  // Group by type
  const byType: Record<string, number> = {}
  payments
    .filter((p) => p.status === 'paid' || p.status === 'partial')
    .forEach((p) => {
      const type = (p.contract?.unit as { type: string } | null)?.type || 'Otro'
      byType[type] = (byType[type] || 0) + Number(p.amount_paid || 0)
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Pagos</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 capitalize">{monthName}</p>
        </div>
        <button
          onClick={openPayModal}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Registrar pago
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Esperado</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(totalExpected)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Recibido</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{formatCurrency(totalReceived)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Pendientes</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{pendingCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">En mora</p>
          <p className={`text-xl font-bold mt-1 ${lateCount > 0 ? 'text-red-400' : 'text-gray-300 dark:text-gray-600'}`}>
            {lateCount}
          </p>
        </div>
      </div>

      {Object.keys(byType).length > 0 && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Ingresos por tipo
          </h3>
          <div className="flex flex-wrap gap-4 sm:gap-6">
            {Object.entries(byType).map(([type, amount]) => (
              <div key={type}>
                <p className="text-xs text-gray-400 dark:text-gray-500">{type}</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {lateCount > 0 && (
        <div className="card border-red-500/30">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <p className="text-sm text-red-400">
              {lateCount} pago(s) con más de 3 días de retraso este mes.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="input-field w-auto"
        />
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
      ) : payments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No hay pagos para este período"
          description="Registra un pago recibido o pendiente"
          actionLabel="Registrar pago"
          actionHref="/payments/new"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Inquilino
                </th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Unidad
                </th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Vencimiento
                </th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Renta
                </th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Agua
                </th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Total
                </th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Pagado
                </th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Estado
                </th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Método
                </th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800/50">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                    {(p.contract?.occupant as { name: string } | null)?.name || '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                    {(p.contract?.unit as { number: string } | null)?.number || '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                    {formatDate(p.due_date)}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                    {p.rent_amount ? formatCurrency(p.rent_amount) : '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-blue-400">
                    {p.water_fee ? formatCurrency(p.water_fee) : '—'}
                  </td>
                  <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                    {formatCurrency(p.amount)}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                    {p.amount_paid ? formatCurrency(p.amount_paid) : '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span className={statusBadge[p.status] || 'badge-expired'}>
                      {statusLabels[p.status] || p.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                    {p.method || '—'}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {(p.status === 'pending' || p.status === 'late') && (
                        <button
                          onClick={() => handleMarkPaid(p)}
                          disabled={markingPaid === p.id}
                          title="Marcar como pagado"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Pagado
                        </button>
                      )}
                      {p.status === 'paid' && invoicedPaymentIds.has(p.id) && (
                        <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                          <Check className="w-3.5 h-3.5" />
                          Facturada
                        </span>
                      )}
                      {p.status === 'paid' && !invoicedPaymentIds.has(p.id) && (
                        <button
                          onClick={() => setInvoiceTarget(p)}
                          title="Generar factura CFDI"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/10 text-black dark:text-gray-400 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Facturar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Facturar */}
      {invoiceTarget && (
        <InvoiceModal
          paymentId={invoiceTarget.id}
          paymentAmount={invoiceTarget.amount}
          unitType={(invoiceTarget.contract?.unit as { type: string } | null)?.type}
          unitNumber={(invoiceTarget.contract?.unit as { number: string } | null)?.number}
          tenantName={(invoiceTarget.contract?.occupant as { name: string } | null)?.name}
          onClose={() => setInvoiceTarget(null)}
          onCreated={() => {
            fetchInvoicedIds()
            toast.success('CFDI generado')
          }}
        />
      )}

      {/* Registrar Pago Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-lg mx-4 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowPayModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Registrar pago</h2>
            <form onSubmit={handlePaySubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Contrato</label>
                <select
                  required
                  value={payForm.contract_id}
                  onChange={(e) => handlePayContractChange(e.target.value)}
                  className="input-field"
                >
                  <option value="">Seleccionar contrato...</option>
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.occupant as { name: string } | null)?.name || 'Sin nombre'} — Unidad{' '}
                      {(c.unit as { number: string } | null)?.number || '—'} ({formatCurrency(c.monthly_amount)}/mes)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Mes</label>
                <select
                  value={payForm.month}
                  onChange={(e) => setPayForm({ ...payForm, month: e.target.value })}
                  className="input-field"
                >
                  {monthOptions.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Renta</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={payForm.rent_amount}
                    onChange={(e) => setPayForm({ ...payForm, rent_amount: e.target.value })}
                    className="input-field"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Agua</label>
                  <input
                    type="number"
                    step="0.01"
                    value={payForm.water_fee}
                    onChange={(e) => setPayForm({ ...payForm, water_fee: e.target.value })}
                    className="input-field"
                    placeholder="250"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Total</label>
                  <div className="input-field bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white font-semibold flex items-center">
                    {formatCurrency(payTotal)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Fecha de pago</label>
                  <input
                    type="date"
                    required
                    value={payForm.paid_date}
                    onChange={(e) => setPayForm({ ...payForm, paid_date: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Método</label>
                  <select
                    value={payForm.method}
                    onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
                    className="input-field"
                  >
                    <option value="Transferencia">Transferencia</option>
                    <option value="Efectivo">Efectivo</option>
                    <option value="Depósito">Depósito</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Referencia / notas</label>
                <input
                  type="text"
                  value={payForm.reference}
                  onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                  className="input-field"
                  placeholder="No. de transferencia, folio, etc."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPayment}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  {savingPayment ? 'Guardando...' : 'Registrar pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
