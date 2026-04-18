'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, Download, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'

interface Invoice {
  id: string
  folio_number: number | null
  series: string
  status: string
  cfdi_use: string
  subtotal: number
  tax: number
  total: number
  customer_rfc: string
  customer_name: string
  customer_email: string | null
  facturapi_id: string | null
  created_at: string
  contract_id: string | null
  payment_id: string | null
  notes: string | null
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [mockMode, setMockMode] = useState(false)
  const [filter, setFilter] = useState('all')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  async function fetchInvoices() {
    setLoading(true)
    try {
      const res = await fetch(`/api/invoices?month=${selectedMonth}${filter !== 'all' ? `&status=${filter}` : ''}`)
      const json = await res.json()
      if (json.success) {
        setInvoices(json.data.invoices || [])
        setMockMode(json.data.mock_mode || false)
      }
    } catch {
      // fallback: direct supabase query
      const [year, mon] = selectedMonth.split('-').map(Number)
      const start = `${year}-${String(mon).padStart(2, '0')}-01T00:00:00`
      const endMonth = mon === 12 ? 1 : mon + 1
      const endYear = mon === 12 ? year + 1 : year
      const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01T00:00:00`

      let query = supabase
        .from('invoices')
        .select('*')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false })

      if (filter !== 'all') query = query.eq('status', filter)

      const { data } = await query
      setInvoices((data || []) as Invoice[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchInvoices()
  }, [selectedMonth, filter])

  const statusBadge = (status: string) => {
    switch (status) {
      case 'valid':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Timbrada</span>
      case 'cancelled':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30">Cancelada</span>
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/30">Borrador</span>
    }
  }

  function exportCSV() {
    const headers = ['Folio', 'RFC', 'Razón Social', 'Uso CFDI', 'Subtotal', 'IVA', 'Total', 'Status', 'Fecha']
    const rows = invoices.map((inv) => [
      inv.folio_number || '',
      inv.customer_rfc,
      inv.customer_name,
      inv.cfdi_use,
      inv.subtotal,
      inv.tax,
      inv.total,
      inv.status,
      inv.created_at?.split('T')[0] || '',
    ])

    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `facturas_${selectedMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-gray-400" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Facturas</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">CFDI — Facturación electrónica</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input-field w-auto"
          />
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
        </div>
      </div>

      {/* Mock mode banner */}
      {mockMode && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-500">
            Modo Prueba activo — las facturas no se timbran ante el SAT. Configura <code className="bg-amber-500/10 px-1 rounded">FACTURAPI_SECRET_KEY</code> para activar facturación real.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: 'all', label: 'Todas' },
          { key: 'valid', label: 'Timbradas' },
          { key: 'draft', label: 'Borrador' },
          { key: 'cancelled', label: 'Canceladas' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-zinc-900 text-white border border-zinc-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No hay facturas para este periodo"
          description="Las facturas se generan desde Cobros o desde el detalle de un contrato"
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Folio</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Razón Social</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">RFC</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Monto</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Uso CFDI</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Fecha</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    {inv.series}-{inv.folio_number || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {inv.customer_name}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">
                    {inv.customer_rfc}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                    {formatCurrency(inv.total)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-700 text-zinc-300">
                      {inv.cfdi_use}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {statusBadge(inv.status)}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400 text-xs">
                    {formatDate(inv.created_at)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="text-gray-400 hover:text-white text-xs font-medium"
                    >
                      Ver detalle
                    </Link>
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

