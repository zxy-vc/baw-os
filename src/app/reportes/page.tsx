'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Download, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'

const ORG_ID = 'ed4308c7-2bdb-46f2-be69-7c59674838e2'

interface PaymentRow {
  id: string
  amount: number
  amount_paid: number | null
  rent_amount: number | null
  water_fee: number | null
  due_date: string
  paid_date: string | null
  status: string
  method: string | null
  reference: string | null
  contract: {
    monthly_amount: number
    unit: { number: string } | null
    occupant: { name: string } | null
  } | null
}

export default function ReportesPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [monthsBack, setMonthsBack] = useState(3)

  async function fetchPayments() {
    setLoading(true)
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1)
    const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`

    const { data } = await supabase
      .from('payments')
      .select('id, amount, amount_paid, rent_amount, water_fee, due_date, paid_date, status, method, reference, contract:contracts(monthly_amount, unit:units(number), occupant:occupants(name))')
      .gte('due_date', startStr)
      .order('due_date', { ascending: false })

    setPayments((data || []) as unknown as PaymentRow[])
    setLoading(false)
  }

  useEffect(() => {
    fetchPayments()
  }, [monthsBack])

  const filtered = filterStatus === 'all'
    ? payments
    : payments.filter((p) => {
        if (filterStatus === 'paid') return p.status === 'paid'
        if (filterStatus === 'pending') return p.status === 'pending'
        if (filterStatus === 'late') return p.status === 'late'
        return true
      })

  const totalExpected = filtered.reduce((s, p) => s + Number(p.amount || 0), 0)
  const totalCollected = filtered.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount_paid || p.amount || 0), 0)
  const totalPending = totalExpected - totalCollected
  const pctCollected = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0

  function exportCSV() {
    const header = ['Depto', 'Inquilino', 'Mes', 'Renta', 'Agua', 'Total', 'Status', 'Fecha pago', 'Método']
    const rows = filtered.map((p) => [
      p.contract?.unit?.number || '',
      p.contract?.occupant?.name || '',
      formatDate(p.due_date),
      String(p.rent_amount || p.amount || 0),
      String(p.water_fee || 0),
      String(p.amount || 0),
      p.status,
      p.paid_date ? formatDate(p.paid_date) : '',
      p.method || '',
    ])
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte_pagos_${monthsBack}m.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const statusLabels: Record<string, string> = {
    pending: 'Pendiente',
    paid: 'Pagado',
    late: 'Atrasado',
    partial: 'Parcial',
    waived: 'Condonado',
  }

  const statusBadge: Record<string, string> = {
    paid: 'bg-green-500/15 text-green-600 dark:text-green-400',
    late: 'bg-red-500/15 text-red-500',
    pending: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
    partial: 'bg-orange-500/15 text-orange-500',
    waived: 'bg-gray-500/15 text-gray-500',
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-indigo-500" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Reportes</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Historial de pagos — todas las unidades
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={monthsBack}
            onChange={(e) => setMonthsBack(Number(e.target.value))}
            className="input-field w-auto"
          >
            <option value={1}>Último mes</option>
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Último año</option>
          </select>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors no-print"
          >
            <Printer className="w-4 h-4" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: 'all', label: 'Todos' },
          { key: 'paid', label: 'Pagados' },
          { key: 'pending', label: 'Pendientes' },
          { key: 'late', label: 'Atrasados' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">% Cobranza</p>
          <p className={`text-2xl font-bold ${pctCollected >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {pctCollected}%
          </p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No hay pagos en este período"
          description="Selecciona otro rango de fechas o registra pagos"
        />
      ) : (
        <div id="print-area" className="card overflow-x-auto p-0">
          <h2 className="hidden print:block text-lg font-bold p-4">BaW OS — Reporte de pagos</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Depto</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Inquilino</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Mes</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Renta</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Agua</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Total</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Fecha pago</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Método</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    {p.contract?.unit?.number || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {p.contract?.occupant?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {formatDate(p.due_date)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                    {formatCurrency(p.rent_amount || p.amount || 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                    {p.water_fee ? formatCurrency(p.water_fee) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                    {formatCurrency(p.amount || 0)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge[p.status] || 'bg-gray-500/15 text-gray-500'}`}>
                      {statusLabels[p.status] || p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {p.paid_date ? formatDate(p.paid_date) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
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
