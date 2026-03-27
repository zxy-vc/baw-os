'use client'

import { useEffect, useState } from 'react'
import { Plus, FileText, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils'
import type { Contract } from '@/types'
import Link from 'next/link'

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  async function fetchContracts() {
    setLoading(true)
    let query = supabase
      .from('contracts')
      .select('*, unit:units(number, floor, type), occupant:occupants(name, phone, email)')
      .order('created_at', { ascending: false })

    if (filterStatus !== 'all') query = query.eq('status', filterStatus)

    const { data } = await query
    setContracts(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchContracts()
  }, [filterStatus])

  const statusLabels: Record<string, string> = {
    active: 'Activo',
    expired: 'Vencido',
    terminated: 'Terminado',
    pending: 'Pendiente',
    renewed: 'Renovado',
  }

  const statusBadge: Record<string, string> = {
    active: 'badge-active',
    expired: 'badge-expired',
    terminated: 'badge-late',
    pending: 'badge-pending',
    renewed: 'badge-occupied',
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Contratos LTR / MTR</h1>
          <p className="text-gray-400 mt-1">
            {contracts.length} contrato(s) registrado(s)
          </p>
        </div>
        <Link
          href="/contracts/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nuevo contrato
        </Link>
      </div>

      <div className="flex items-center gap-3">
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
        <div className="text-gray-500">Cargando contratos...</div>
      ) : contracts.length === 0 ? (
        <div className="card text-center py-12">
          <FileText className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No hay contratos registrados</p>
          <Link
            href="/contracts/new"
            className="mt-4 inline-block text-indigo-400 hover:text-indigo-300 text-sm font-medium"
          >
            Crear primer contrato
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((contract) => {
            const days = contract.end_date ? daysUntil(contract.end_date) : null
            const isExpiring = days !== null && days <= 30 && days > 0 && contract.status === 'active'
            const isExpired = days !== null && days <= 0 && contract.status === 'active'

            return (
              <Link
                key={contract.id}
                href={`/contracts/${contract.id}`}
                className="card block hover:border-gray-700 transition-colors"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-white">
                        {(contract.occupant as { name: string } | null)?.name || 'Sin inquilino'}
                      </h3>
                      <span className={statusBadge[contract.status] || 'badge-expired'}>
                        {statusLabels[contract.status] || contract.status}
                      </span>
                      {isExpiring && (
                        <span className="badge-pending flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Vence en {days} días
                        </span>
                      )}
                      {isExpired && (
                        <span className="badge-late flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Vencido
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
                      <span>
                        Unidad {(contract.unit as { number: string } | null)?.number || '—'}
                      </span>
                      <span>
                        {formatDate(contract.start_date)} — {contract.end_date ? formatDate(contract.end_date) : 'Indefinido'}
                      </span>
                      <span>Día de pago: {contract.payment_day}</span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <p className="text-lg font-semibold text-white">
                      {formatCurrency(contract.monthly_amount)}
                    </p>
                    <p className="text-xs text-gray-500">/ mes</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
