'use client'

import { useEffect, useState } from 'react'
import { Receipt, X, Save, Check, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import InvoiceModal from '@/components/InvoiceModal'

interface ContractRow {
  id: string
  unit_id: string
  occupant_id: string
  monthly_amount: number
  payment_day: number
  status: string
  unit: { number: string } | null
  occupant: { name: string } | null
}

interface PaymentRow {
  id: string
  contract_id: string
  status: string
  due_date: string
  paid_date: string | null
  amount: number
  rent_amount: number | null
  water_fee: number | null
  method: string | null
  reference: string | null
  confirmed_by: string | null
}

type BillingStatus = 'pagado' | 'pendiente' | 'vencido' | 'mora' | 'verbal'

interface BillingRow {
  contract: ContractRow
  payment: PaymentRow | null
  status: BillingStatus
  moraAmount: number
}

const ORG_ID = 'ed4308c7-2bdb-46f2-be69-7c59674838e2'

export default function CobrosPage() {
  const toast = useToast()
  const [rows, setRows] = useState<BillingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // Modal state
  const [payingContract, setPayingContract] = useState<ContractRow | null>(null)
  const [payForm, setPayForm] = useState({
    rent_amount: 0,
    water_fee: 250,
    method: 'Transferencia',
    reference: '',
    paid_date: new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)
  const [confirmedBy, setConfirmedBy] = useState('alicia')
  const [chronicDebtors, setChronicDebtors] = useState<{ name: string; count: number }[]>([])
  const [invoicingRow, setInvoicingRow] = useState<BillingRow | null>(null)

  async function fetchBilling() {
    setLoading(true)
    const [year, month] = selectedMonth.split('-').map(Number)
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`

    const [contractsRes, paymentsRes, latePaymentsRes] = await Promise.all([
      supabase
        .from('contracts')
        .select('id, unit_id, occupant_id, monthly_amount, payment_day, status, unit:units(number), occupant:occupants(name)')
        .in('status', ['active', 'en_renovacion'])
        .eq('org_id', ORG_ID),
      supabase
        .from('payments')
        .select('id, contract_id, status, due_date, paid_date, amount, rent_amount, water_fee, method, reference, confirmed_by')
        .eq('status', 'paid')
        .gte('due_date', monthStart)
        .lt('due_date', nextMonth),
      supabase
        .from('payments')
        .select('contract_id, status, contract:contracts(occupant:occupants(name))')
        .eq('status', 'late')
        .lt('due_date', monthStart),
    ])

    const contracts = (contractsRes.data || []) as unknown as ContractRow[]
    const payments = (paymentsRes.data || []) as PaymentRow[]

    const paymentByContract = new Map<string, PaymentRow>()
    for (const p of payments) {
      paymentByContract.set(p.contract_id, p)
    }

    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonth = today.getMonth() + 1
    const isCurrentMonth = year === currentYear && month === currentMonth
    const todayDay = today.getDate()

    const billingRows: BillingRow[] = contracts.map((c) => {
      const payment = paymentByContract.get(c.id) || null

      let status: BillingStatus = 'pendiente'
      let moraAmount = 0

      if (!c.payment_day) {
        // No fixed payment day — verbal agreement
        status = payment ? 'pagado' : 'verbal'
      } else if (payment) {
        status = 'pagado'
      } else if (isCurrentMonth) {
        if (todayDay >= 10) {
          status = 'mora'
          moraAmount = Math.round(c.monthly_amount * 0.03 * 100) / 100
        } else if (todayDay >= c.payment_day) {
          status = 'vencido'
        } else {
          status = 'pendiente'
        }
      } else {
        // Past months without payment
        const selectedDate = new Date(year, month - 1, 1)
        if (selectedDate < new Date(currentYear, currentMonth - 1, 1)) {
          status = 'vencido'
        }
      }

      return { contract: c, payment, status, moraAmount }
    })

    // Sort by unit number
    billingRows.sort((a, b) => {
      const aNum = a.contract.unit?.number || ''
      const bNum = b.contract.unit?.number || ''
      return aNum.localeCompare(bNum)
    })

    // Chronic debtors: contracts with late payments from previous months
    const latePayments = (latePaymentsRes.data || []) as unknown as { contract_id: string; status: string; contract: { occupant: { name: string } | null } | null }[]
    const debtorMap = new Map<string, { name: string; count: number }>()
    for (const lp of latePayments) {
      const name = lp.contract?.occupant?.name || 'Sin nombre'
      const existing = debtorMap.get(lp.contract_id)
      if (existing) {
        existing.count++
      } else {
        debtorMap.set(lp.contract_id, { name, count: 1 })
      }
    }
    setChronicDebtors(Array.from(debtorMap.values()).sort((a, b) => b.count - a.count))

    setRows(billingRows)
    setLoading(false)
  }

  useEffect(() => {
    fetchBilling()
  }, [selectedMonth])

  function openPayModal(contract: ContractRow) {
    setPayingContract(contract)
    setPayForm({
      rent_amount: contract.monthly_amount,
      water_fee: 250,
      method: 'Transferencia',
      reference: '',
      paid_date: new Date().toISOString().split('T')[0],
    })
  }

  async function handleMarkPaid() {
    if (!payingContract) return
    setSaving(true)

    const [year, month] = selectedMonth.split('-').map(Number)
    const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(payingContract.payment_day).padStart(2, '0')}`
    const totalAmount = payForm.rent_amount + payForm.water_fee

    const { data: paymentData, error } = await supabase.from('payments').insert({
      org_id: ORG_ID,
      contract_id: payingContract.id,
      amount: totalAmount,
      rent_amount: payForm.rent_amount,
      water_fee: payForm.water_fee,
      due_date: dueDate,
      paid_date: payForm.paid_date,
      status: 'paid',
      method: payForm.method,
      reference: payForm.reference || null,
      confirmed_by: confirmedBy,
      confirmed_at: new Date().toISOString(),
      payment_method: payForm.method.toLowerCase() === 'transferencia' ? 'transferencia' : payForm.method.toLowerCase() === 'efectivo' ? 'efectivo' : 'otro',
    }).select().single()

    // Also create ledger entry
    if (paymentData && !error) {
      await supabase.from('payment_ledger').insert({
        org_id: ORG_ID,
        payment_id: paymentData.id,
        contract_id: payingContract.id,
        unit_id: payingContract.unit_id,
        tenant_name: payingContract.occupant?.name || null,
        amount: payForm.rent_amount,
        water_fee: payForm.water_fee,
        total: totalAmount,
        payment_method: payForm.method.toLowerCase() === 'transferencia' ? 'transferencia' : payForm.method.toLowerCase() === 'efectivo' ? 'efectivo' : 'otro',
        confirmed_by: confirmedBy,
        notes: payForm.reference || null,
      })
    }

    setPayingContract(null)
    setSaving(false)
    if (error) {
      toast.error('Error al guardar — intenta de nuevo')
    } else {
      toast.success('Pago registrado correctamente')
    }
    fetchBilling()
  }

  const filtered = filter === 'all'
    ? rows
    : rows.filter((r) => {
        if (filter === 'pendientes') return r.status === 'pendiente'
        if (filter === 'vencidos') return r.status === 'vencido' || r.status === 'mora'
        if (filter === 'pagados') return r.status === 'pagado'
        return true
      })

  // Total expected = rent + water ($250) per contract
  const totalExpected = rows.reduce((s, r) => s + r.contract.monthly_amount + 250, 0)
  const totalCollected = rows.filter((r) => r.status === 'pagado').reduce((s, r) => s + (r.payment?.amount || r.contract.monthly_amount + 250), 0)
  const totalPending = totalExpected - totalCollected

  const statusBadge = (status: BillingStatus, moraAmount: number) => {
    switch (status) {
      case 'pagado':
        return <span className="badge-available">Pagado</span>
      case 'pendiente':
        return <span className="badge-pending">Pendiente</span>
      case 'vencido':
        return <span className="badge-late">Vencido</span>
      case 'mora':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border-2 border-red-500/40">
            Mora activa · +{formatCurrency(moraAmount)}
          </span>
        )
      case 'verbal':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30">
            Acuerdo verbal
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Receipt className="w-6 h-6 text-gray-400" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Cobros</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Estado de pagos mensuales — Contratos LTR / MTR
            </p>
          </div>
        </div>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="input-field w-auto"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: 'all', label: 'Todos' },
          { key: 'pendientes', label: 'Pendientes' },
          { key: 'vencidos', label: 'Vencidos' },
          { key: 'pagados', label: 'Pagados' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total esperado</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalExpected)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total cobrado</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalCollected)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Pendiente</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(totalPending)}</p>
        </div>
      </div>

      {/* Deudores crónicos */}
      {chronicDebtors.length > 0 && (
        <div className="card border-red-500/30">
          <h3 className="text-sm font-semibold text-red-400 mb-2">
            Deudores crónicos — {chronicDebtors.length} inquilino(s) con pagos atrasados de meses anteriores
          </h3>
          <div className="flex flex-wrap gap-2">
            {chronicDebtors.map((d, i) => (
              <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                {d.name} ({d.count} pago{d.count > 1 ? 's' : ''})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <SkeletonTable />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No hay contratos activos para este mes"
          description="Los cobros se generan automáticamente para contratos activos"
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Depto</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Inquilino</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Renta</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Agua</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Total</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Día cobro</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Confirmó</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const waterFee = row.payment?.water_fee ?? 250
                const rentAmt = row.payment?.rent_amount ?? row.contract.monthly_amount
                const total = row.payment ? row.payment.amount : row.contract.monthly_amount + 250

                return (
                  <tr key={row.contract.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {row.contract.unit?.number || '—'}
                      {row.contract.status === 'en_renovacion' && (
                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/15 text-yellow-500 border border-yellow-500/20" title="Contrato en renovación">
                          &#9888;
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {row.contract.occupant?.name || 'Sin inquilino'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {formatCurrency(rentAmt)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {formatCurrency(waterFee)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(total)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">
                      {row.contract.payment_day}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {statusBadge(row.status, row.moraAmount)}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {row.payment?.confirmed_by || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.status !== 'pagado' ? (
                        <button
                          onClick={() => openPayModal(row.contract)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          <Check className="w-3 h-3" />
                          Marcar pagado
                        </button>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          {row.payment?.method === 'stripe' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                              Pagado por Stripe
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {row.payment?.method || '—'}
                            </span>
                          )}
                          {row.payment && (
                            <button
                              onClick={() => setInvoicingRow(row)}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-gray-400 rounded text-[11px] font-medium transition-colors"
                              title="Generar factura CFDI"
                            >
                              <FileText className="w-3 h-3" />
                              Facturar
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice Modal */}
      {invoicingRow && invoicingRow.payment && (
        <InvoiceModal
          paymentId={invoicingRow.payment.id}
          paymentAmount={invoicingRow.payment.amount}
          unitNumber={invoicingRow.contract.unit?.number}
          tenantName={invoicingRow.contract.occupant?.name}
          onClose={() => setInvoicingRow(null)}
          onCreated={() => fetchBilling()}
        />
      )}

      {/* Pay Modal */}
      {payingContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4 relative">
            <button
              onClick={() => setPayingContract(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Registrar pago — {payingContract.unit?.number || ''}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {payingContract.occupant?.name || 'Sin inquilino'}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Renta</label>
                <input
                  type="number"
                  value={payForm.rent_amount}
                  onChange={(e) => setPayForm({ ...payForm, rent_amount: Number(e.target.value) })}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Agua</label>
                <input
                  type="number"
                  value={payForm.water_fee}
                  onChange={(e) => setPayForm({ ...payForm, water_fee: Number(e.target.value) })}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Total</label>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(payForm.rent_amount + payForm.water_fee)}
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Método</label>
                <select
                  value={payForm.method}
                  onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
                  className="input-field w-full"
                >
                  <option value="Transferencia">Transferencia</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Deposito">Depósito</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Referencia</label>
                <input
                  type="text"
                  value={payForm.reference}
                  onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                  className="input-field w-full"
                  placeholder="Número de referencia"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Confirmado por</label>
                <select
                  value={confirmedBy}
                  onChange={(e) => setConfirmedBy(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="alicia">Alicia</option>
                  <option value="enrique">Enrique</option>
                  <option value="fran">Fran</option>
                  <option value="system">Sistema</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Fecha de pago</label>
                <input
                  type="date"
                  value={payForm.paid_date}
                  onChange={(e) => setPayForm({ ...payForm, paid_date: e.target.value })}
                  className="input-field w-full"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setPayingContract(null)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleMarkPaid}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  Guardar pago
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
