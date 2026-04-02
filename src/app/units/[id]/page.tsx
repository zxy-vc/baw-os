'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Building2, FileText, CreditCard, Wrench, Download, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Unit, Contract, Payment, Incident } from '@/types'

const statusLabels: Record<string, string> = {
  available: 'Disponible',
  occupied: 'Ocupado',
  maintenance: 'Mantenimiento',
  reserved: 'Reservado',
  inactive: 'Inactivo',
}

const typeLabels: Record<string, string> = {
  STR: 'Corta estancia',
  MTR: 'Media estancia',
  LTR: 'Larga estancia',
  OFFICE: 'Oficina',
  COMMON: 'Área común',
}

const statusBadgeClass: Record<string, string> = {
  available: 'badge-available',
  occupied: 'badge-occupied',
  maintenance: 'badge-maintenance',
  reserved: 'badge-reserved',
  inactive: 'badge-expired',
}

export default function UnitDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [unit, setUnit] = useState<Unit | null>(null)
  const [contracts, setContracts] = useState<(Contract & { occupant: { name: string } | null })[]>([])
  const [payments, setPayments] = useState<(Payment & { contract: { unit: { number: string } } | null })[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchData() {
    const id = params.id as string
    const [unitRes, contractsRes, incidentsRes] = await Promise.all([
      supabase.from('units').select('*').eq('id', id).single(),
      supabase
        .from('contracts')
        .select('*, occupant:occupants(name)')
        .eq('unit_id', id)
        .order('start_date', { ascending: false }),
      supabase
        .from('incidents')
        .select('*')
        .eq('unit_id', id)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    setUnit(unitRes.data)
    const contractList = (contractsRes.data || []) as (Contract & { occupant: { name: string } | null })[]
    setContracts(contractList)

    if (contractList.length > 0) {
      const contractIds = contractList.map((c) => c.id)
      const { data: pmtsData } = await supabase
        .from('payments')
        .select('*, contract:contracts(unit:units(number))')
        .in('contract_id', contractIds)
        .order('due_date', { ascending: false })
      setPayments((pmtsData || []) as (Payment & { contract: { unit: { number: string } } | null })[])
    }

    setIncidents(incidentsRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [params.id])

  if (loading) return <div className="text-gray-400 dark:text-gray-500">Cargando unidad...</div>
  if (!unit) return (
    <div className="text-gray-400 dark:text-gray-500">
      <p>Unidad no encontrada.</p>
      <Link href="/units" className="text-indigo-400 hover:text-indigo-300 mt-2 inline-block">← Volver a unidades</Link>
    </div>
  )

  const activeContract = contracts.find((c) => ['active', 'en_renovacion'].includes(c.status))
  const pendingPayments = payments.filter((p) => ['pending', 'late'].includes(p.status))

  function exportCSV() {
    const header = ['Depto', 'Inquilino', 'Mes', 'Vencimiento', 'Renta', 'Agua', 'Total', 'Pagado', 'Fecha pago', 'Método', 'Referencia', 'Status']
    const occupantName = activeContract ? (activeContract.occupant as { name: string } | null)?.name || '' : ''
    const rows = payments.map((p) => [
      unit?.number || '',
      occupantName,
      formatDate(p.due_date),
      formatDate(p.due_date),
      String(p.amount || 0),
      String((p as any).water_fee || 0),
      String(p.amount || 0),
      String(p.amount_paid || 0),
      p.paid_date ? formatDate(p.paid_date) : '',
      (p as any).method || '',
      (p as any).reference || '',
      p.status,
    ])
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pagos_depto_${unit?.number || 'unknown'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Depto {unit.number}
            </h1>
            <span className={statusBadgeClass[unit.status]}>{statusLabels[unit.status]}</span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 mt-0.5">
            {typeLabels[unit.type]} · Piso {unit.floor ?? '—'}
            {unit.area_m2 && ` · ${unit.area_m2} m²`}
            {unit.bedrooms && ` · ${unit.bedrooms} rec`}
            {unit.bathrooms && ` · ${unit.bathrooms} baños`}
          </p>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Contrato activo</p>
          {activeContract ? (
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">
                {(activeContract.occupant as { name: string } | null)?.name ?? '—'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatCurrency(activeContract.monthly_amount)}/mes
              </p>
              {activeContract.status === 'en_renovacion' && (
                <p className="text-xs text-yellow-500 mt-1">⚠️ En renovación</p>
              )}
              {activeContract.end_date && activeContract.status !== 'en_renovacion' && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Vence: {formatDate(activeContract.end_date)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">Sin contrato activo</p>
          )}
        </div>

        <div className="card">
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Pagos pendientes</p>
          {pendingPayments.length > 0 ? (
            <div>
              <p className="font-semibold text-red-500">{pendingPayments.length} pendiente{pendingPayments.length > 1 ? 's' : ''}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatCurrency(pendingPayments.reduce((sum, p) => sum + p.amount, 0))} total
              </p>
            </div>
          ) : (
            <p className="text-green-500 font-medium">Al corriente ✓</p>
          )}
        </div>

        <div className="card">
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Incidencias abiertas</p>
          {incidents.filter((i) => !['resolved', 'cancelled'].includes(i.status)).length > 0 ? (
            <p className="font-semibold text-yellow-500">
              {incidents.filter((i) => !['resolved', 'cancelled'].includes(i.status)).length} abierta(s)
            </p>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">Sin incidencias</p>
          )}
        </div>
      </div>

      {/* Contracts */}
      {contracts.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-indigo-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Contratos</h2>
          </div>
          <div className="space-y-2">
            {contracts.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-800/50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {(c.occupant as { name: string } | null)?.name ?? '—'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(c.start_date)} – {c.end_date ? formatDate(c.end_date) : 'indefinido'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{formatCurrency(c.monthly_amount)}/mes</span>
                  <Link href={`/contracts/${c.id}`} className="text-xs text-indigo-400 hover:text-indigo-300">
                    Ver →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documentos */}
      {contracts.filter((c) => (c as any).contract_url).length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-indigo-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Documentos</h2>
          </div>
          <div className="space-y-2">
            {contracts
              .filter((c) => (c as any).contract_url)
              .map((c) => (
                <a
                  key={c.id}
                  href={(c as any).contract_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-800/50 last:border-0 group"
                >
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Contrato {formatDate(c.start_date)} — {(c.occupant as { name: string } | null)?.name ?? '—'}
                  </p>
                  <ExternalLink className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300" />
                </a>
              ))}
          </div>
        </div>
      )}

      {/* Payments */}
      {payments.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-400" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Historial de pagos</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={exportCSV}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>
              <Link href="/payments" className="text-xs text-indigo-400 hover:text-indigo-300">Ver todos →</Link>
            </div>
          </div>
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-800/50 last:border-0">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Vence: {formatDate(p.due_date)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{formatCurrency(p.amount)}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    p.status === 'paid' ? 'bg-green-500/15 text-green-600 dark:text-green-400' :
                    p.status === 'late' ? 'bg-red-500/15 text-red-500' :
                    'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                  }`}>
                    {p.status === 'paid' ? 'Pagado' : p.status === 'late' ? 'Atrasado' : 'Pendiente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incidents */}
      {incidents.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-4 h-4 text-indigo-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Mantenimiento reciente</h2>
          </div>
          <div className="space-y-2">
            {incidents.map((inc) => (
              <div key={inc.id} className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-800/50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{inc.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(inc.created_at)}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  inc.status === 'resolved' ? 'bg-green-500/15 text-green-500' :
                  inc.priority === 'urgent' ? 'bg-red-500/15 text-red-500' :
                  'bg-yellow-500/15 text-yellow-500'
                }`}>
                  {inc.status === 'resolved' ? 'Resuelto' : inc.status === 'open' ? 'Abierto' : 'En proceso'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No data */}
      {contracts.length === 0 && incidents.length === 0 && (
        <div className="card text-center py-10">
          <Building2 className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Sin historial para esta unidad.</p>
        </div>
      )}
    </div>
  )
}
