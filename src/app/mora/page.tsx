'use client'

import { useEffect, useState } from 'react'
import { AlertOctagon, Download, Bell, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { getMoraColor, getMoraLabel, getMoraLevelOrder, type MoraStatus, type MoraLevel } from '@/lib/mora-engine'

export default function MoraPage() {
  const [moraList, setMoraList] = useState<MoraStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [notifying, setNotifying] = useState(false)
  const [notifyResult, setNotifyResult] = useState<string | null>(null)

  useEffect(() => {
    fetchMora()
  }, [])

  async function fetchMora() {
    try {
      const res = await fetch('/api/mora')
      const data = await res.json()
      if (data.success) {
        // Sort by level (legal first), then by days DESC
        const sorted = (data.data as MoraStatus[]).sort((a, b) => {
          const levelDiff = getMoraLevelOrder(a.level) - getMoraLevelOrder(b.level)
          if (levelDiff !== 0) return levelDiff
          return b.daysPastDue - a.daysPastDue
        })
        setMoraList(sorted)
      }
    } catch (err) {
      console.error('Error fetching mora:', err)
    } finally {
      setLoading(false)
    }
  }

  async function notifyAll() {
    setNotifying(true)
    setNotifyResult(null)
    try {
      const res = await fetch('/api/mora/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.success) {
        setNotifyResult(`${data.data.notified} notificaciones registradas en audit log`)
      } else {
        setNotifyResult('Error al notificar')
      }
    } catch {
      setNotifyResult('Error de conexión')
    } finally {
      setNotifying(false)
    }
  }

  async function notifySingle(contractId: string) {
    try {
      const res = await fetch('/api/mora/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractIds: [contractId] }),
      })
      const data = await res.json()
      if (data.success) {
        setNotifyResult(`Notificación registrada para contrato`)
      }
    } catch {
      setNotifyResult('Error de conexión')
    }
  }

  function exportCSV() {
    if (moraList.length === 0) return

    const headers = ['Unidad', 'Inquilino', 'Días de mora', 'Nivel', 'Monto vencido', 'Pagos vencidos']
    const rows = moraList.map((m) => [
      m.unitNumber,
      m.tenantName,
      m.daysPastDue.toString(),
      m.level,
      m.totalOverdue.toFixed(2),
      m.payments.length.toString(),
    ])

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mora_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Stats
  const totalMora = moraList.length
  const criticalCount = moraList.filter((m) => m.level === 'critical' || m.level === 'legal').length
  const warningCount = moraList.filter((m) => m.level === 'warning').length
  const totalAmount = moraList.reduce((sum, m) => sum + m.totalOverdue, 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-24 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
        <div className="card h-64 animate-pulse bg-gray-100 dark:bg-gray-800" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <AlertOctagon className="w-6 h-6 text-red-500" />
            Motor de Morosidad
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Detección automática de mora y escalamiento
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total en mora</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{totalMora}</p>
          <p className="text-xs text-gray-400 mt-1">contratos con mora {'>'} 5 días</p>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Mora crítica</p>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">{criticalCount}</p>
          <p className="text-xs text-gray-400 mt-1">{'>'} 15 días de mora</p>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Warning</p>
          <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-1">{warningCount}</p>
          <p className="text-xs text-gray-400 mt-1">5–15 días de mora</p>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Monto total vencido</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white mt-1 leading-tight break-all">{formatCurrency(totalAmount)}</p>
          <p className="text-xs text-gray-400 mt-1">suma de pagos no confirmados</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={notifyAll}
          disabled={notifying || moraList.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Bell className="w-4 h-4" />
          {notifying ? 'Notificando...' : 'Notificar a todos (warning+)'}
        </button>
        <button
          onClick={exportCSV}
          disabled={moraList.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {notifyResult && (
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm">
          {notifyResult}
        </div>
      )}

      {/* Main Table */}
      {moraList.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">🎉</p>
          <p className="text-lg font-medium text-gray-900 dark:text-white">Sin mora activa</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Todos los pagos están al corriente o en periodo de gracia
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Unidad</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Inquilino</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Días de mora</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nivel</th>
                <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Monto vencido</th>
                <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {moraList.map((m) => (
                <tr key={m.contractId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="py-3 px-3">
                    <span className="font-semibold text-gray-900 dark:text-white">{m.unitNumber}</span>
                  </td>
                  <td className="py-3 px-3 text-sm text-gray-700 dark:text-gray-300">{m.tenantName}</td>
                  <td className="py-3 px-3">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{m.daysPastDue}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getMoraColor(m.level)}`}>
                      {getMoraLabel(m.level, m.daysPastDue)}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(m.totalOverdue)}
                    </span>
                    {m.payments.length > 1 && (
                      <span className="text-xs text-gray-400 ml-1">({m.payments.length} pagos)</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => notifySingle(m.contractId)}
                        className="text-xs px-2.5 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-md hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
                        title="Registrar notificación en audit log"
                      >
                        Notificar
                      </button>
                      <Link
                        href={`/contracts`}
                        className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors inline-flex items-center gap-1"
                      >
                        Ver contrato <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
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
