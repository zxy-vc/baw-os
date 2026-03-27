'use client'

import { useEffect, useState } from 'react'
import { Plus, CreditCard, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'

interface PaymentWithContract {
  id: string
  amount: number
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
  const [payments, setPayments] = useState<PaymentWithContract[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

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
    setPayments((data as PaymentWithContract[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchPayments()
  }, [filterStatus, selectedMonth])

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
          <h1 className="text-xl sm:text-2xl font-bold text-white">Pagos</h1>
          <p className="text-gray-400 mt-1 capitalize">{monthName}</p>
        </div>
        <Link
          href="/payments/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Registrar pago
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-gray-400">Esperado</p>
          <p className="text-xl font-bold text-white mt-1">{formatCurrency(totalExpected)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-400">Recibido</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{formatCurrency(totalReceived)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-400">Pendientes</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{pendingCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-400">En mora</p>
          <p className={`text-xl font-bold mt-1 ${lateCount > 0 ? 'text-red-400' : 'text-gray-600'}`}>
            {lateCount}
          </p>
        </div>
      </div>

      {Object.keys(byType).length > 0 && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            Ingresos por tipo
          </h3>
          <div className="flex flex-wrap gap-4 sm:gap-6">
            {Object.entries(byType).map(([type, amount]) => (
              <div key={type}>
                <p className="text-xs text-gray-500">{type}</p>
                <p className="text-lg font-semibold text-white">{formatCurrency(amount)}</p>
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
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2"
        >
          <option value="all">Todos los estados</option>
          {Object.entries(statusLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-gray-500">Cargando pagos...</div>
      ) : payments.length === 0 ? (
        <div className="card text-center py-12">
          <CreditCard className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No hay pagos para este período</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                  Inquilino
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                  Unidad
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                  Vencimiento
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                  Monto
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                  Pagado
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                  Estado
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                  Método
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-gray-900/50 transition-colors">
                  <td className="py-3 px-4 text-sm text-white">
                    {(p.contract?.occupant as { name: string } | null)?.name || '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-400">
                    {(p.contract?.unit as { number: string } | null)?.number || '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-300">
                    {formatDate(p.due_date)}
                  </td>
                  <td className="py-3 px-4 text-sm text-white">
                    {formatCurrency(p.amount)}
                  </td>
                  <td className="py-3 px-4 text-sm text-white">
                    {p.amount_paid ? formatCurrency(p.amount_paid) : '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span className={statusBadge[p.status] || 'badge-expired'}>
                      {statusLabels[p.status] || p.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-400">
                    {p.method || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
