'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'

interface ReportRow {
  id: string
  amount: number
  rent_amount: number | null
  water_fee: number | null
  amount_paid: number | null
  due_date: string
  paid_date: string | null
  status: string
  contract: {
    monthly_amount: number
    occupant: { name: string } | null
    unit: { number: string; type: string } | null
  } | null
}

export default function ReportsPage() {
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  async function fetchData() {
    setLoading(true)
    const [year, month] = selectedMonth.split('-').map(Number)
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    const { data } = await supabase
      .from('payments')
      .select('*, contract:contracts(monthly_amount, occupant:occupants(name), unit:units(number, type))')
      .gte('due_date', startDate)
      .lte('due_date', endDate)
      .order('due_date', { ascending: true })

    setRows((data as ReportRow[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [selectedMonth])

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

  const totalExpected = rows.reduce((sum, r) => sum + Number(r.amount), 0)
  const totalPaid = rows
    .filter((r) => r.status === 'paid' || r.status === 'partial')
    .reduce((sum, r) => sum + Number(r.amount_paid || 0), 0)
  const totalPending = totalExpected - totalPaid

  const monthName = new Date(Number(selectedMonth.split('-')[0]), Number(selectedMonth.split('-')[1]) - 1)
    .toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  function exportCSV() {
    const [year, month] = selectedMonth.split('-')
    const header = ['Depto', 'Inquilino', 'Renta', 'Agua', 'Total Esperado', 'Pagado', 'Status', 'Fecha Pago']
    const csvRows = [header.join(',')]

    for (const r of rows) {
      const unit = (r.contract?.unit as { number: string } | null)?.number || ''
      const name = (r.contract?.occupant as { name: string } | null)?.name || ''
      const rent = r.rent_amount ?? ''
      const water = r.water_fee ?? ''
      const total = r.amount
      const paid = r.amount_paid ?? ''
      const status = statusLabels[r.status] || r.status
      const paidDate = r.paid_date ? formatDate(r.paid_date) : ''

      csvRows.push(
        [unit, `"${name}"`, rent, water, total, paid, status, paidDate].join(',')
      )
    }

    // Summary row
    csvRows.push('')
    csvRows.push(['', '', '', '', totalExpected, totalPaid, `Pendiente: ${totalPending}`, ''].join(','))

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `BaW_Cobros_${year}-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Reportes</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 capitalize">{monthName}</p>
        </div>
        <button
          onClick={exportCSV}
          disabled={rows.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Esperado</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(totalExpected)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Cobrado</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Pendiente</p>
          <p className={`text-xl font-bold mt-1 ${totalPending > 0 ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'}`}>
            {formatCurrency(totalPending)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="input-field w-auto"
        />
      </div>

      {loading ? (
        <div className="text-gray-400 dark:text-gray-500">Cargando reporte...</div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-12">
          <BarChart3 className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No hay datos para este período</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Depto</th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Inquilino</th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Renta</th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Agua</th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Total Esperado</th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Pagado</th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Status</th>
                <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Fecha Pago</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800/50">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                  <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                    {(r.contract?.unit as { number: string } | null)?.number || '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                    {(r.contract?.occupant as { name: string } | null)?.name || '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                    {r.rent_amount ? formatCurrency(r.rent_amount) : '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-blue-400">
                    {r.water_fee ? formatCurrency(r.water_fee) : '—'}
                  </td>
                  <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                    {formatCurrency(r.amount)}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                    {r.amount_paid ? formatCurrency(r.amount_paid) : '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span className={statusBadge[r.status] || 'badge-expired'}>
                      {statusLabels[r.status] || r.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                    {r.paid_date ? formatDate(r.paid_date) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 dark:border-gray-700 font-semibold">
                <td className="py-3 px-4 text-sm text-gray-900 dark:text-white" colSpan={2}>Totales</td>
                <td className="py-3 px-4 text-sm text-gray-900 dark:text-white"></td>
                <td className="py-3 px-4 text-sm text-gray-900 dark:text-white"></td>
                <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">{formatCurrency(totalExpected)}</td>
                <td className="py-3 px-4 text-sm text-emerald-400">{formatCurrency(totalPaid)}</td>
                <td className="py-3 px-4 text-sm text-amber-400" colSpan={2}>
                  Pendiente: {formatCurrency(totalPending)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
