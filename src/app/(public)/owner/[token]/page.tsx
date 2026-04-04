'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Summary {
  totalUnits: number
  occupiedUnits: number
  occupancyRate: number
  expectedMonthly: number
  collectedMonthly: number
  pendingMonthly: number
  collectionRate: number
  totalExpenses: number
  netIncome: number
  openIncidents: number
  expiringContracts: number
}

interface UnitDetail {
  unit_number: string
  floor: number
  type: string
  unit_status: string
  tenant_name: string | null
  monthly_rent: number | null
  payment_status: string | null
  paid_date: string | null
}

interface Expense {
  category: string
  amount: number
  date: string
  provider: string | null
  notes: string | null
}

interface Incident {
  id: string
  unit_number: string
  title: string
  description: string | null
  status: string
  priority: string
  created_at: string
}

interface ExpiringContract {
  unit_number: string
  tenant_name: string
  end_date: string
  monthly_amount: number
}

interface OwnerData {
  summary: Summary
  units: UnitDetail[]
  expenses: Expense[]
  incidents: Incident[]
  expiringContracts: ExpiringContract[]
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0 }).format(n)
}

function formatDate(d: string): string {
  const [year, month, day] = d.split('T')[0].split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatCurrentDate(): string {
  return new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const paymentStatusConfig: Record<string, { label: string; icon: string; color: string }> = {
  paid: { label: 'Pagado', icon: '\u2705', color: 'bg-emerald-50 text-emerald-700' },
  pending: { label: 'Pendiente', icon: '\u23F3', color: 'bg-amber-50 text-amber-700' },
  late: { label: 'Vencido', icon: '\uD83D\uDD34', color: 'bg-red-50 text-red-700' },
  partial: { label: 'Parcial', icon: '\uD83D\uDFE1', color: 'bg-orange-50 text-orange-700' },
}

const categoryLabels: Record<string, string> = {
  internet: 'Internet',
  gas: 'Gas',
  luz: 'Luz',
  mantenimiento: 'Mantenimiento',
  limpieza: 'Limpieza',
  otro: 'Otro',
}

export default function OwnerPortalPage() {
  const params = useParams()
  const token = Array.isArray(params.token) ? params.token[0] : params.token
  const [data, setData] = useState<OwnerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/owner/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error()
        return res.json()
      })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center animate-pulse">
            <span className="text-white text-sm font-bold">B</span>
          </div>
          <p className="text-slate-400 text-sm">Cargando panel ejecutivo...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔒</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Acceso denegado</h1>
          <p className="text-slate-500 text-sm">Este enlace no es válido o no tienes autorización.</p>
        </div>
      </div>
    )
  }

  const { summary, units, expenses, incidents, expiringContracts } = data

  const collectionColor = summary.collectionRate >= 90
    ? 'text-emerald-600'
    : summary.collectionRate >= 70
      ? 'text-amber-600'
      : 'text-red-600'

  const collectionBg = summary.collectionRate >= 90
    ? 'bg-emerald-50 border-emerald-100'
    : summary.collectionRate >= 70
      ? 'bg-amber-50 border-amber-100'
      : 'bg-red-50 border-red-100'

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Dark Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">BaW</span>
          </div>
          <div className="flex-1">
            <h1 className="font-semibold text-sm tracking-tight">Panel Ejecutivo — ALM809P</h1>
            <p className="text-xs text-slate-400 capitalize">{formatCurrentDate()}</p>
          </div>
          <span className="text-xs bg-white/10 text-slate-300 px-2.5 py-1 rounded-full font-medium">
            🔒 Privado
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Net Income */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">💰</span>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Ingreso neto</p>
            </div>
            <p className={`text-2xl font-bold ${summary.netIncome > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              ${formatCurrency(summary.netIncome)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              ${formatCurrency(summary.collectedMonthly)} cobrado − ${formatCurrency(summary.totalExpenses)} gastos
            </p>
          </div>

          {/* Collection Rate */}
          <div className={`rounded-2xl border shadow-sm p-5 ${collectionBg}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📊</span>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Tasa de cobro</p>
            </div>
            <p className={`text-2xl font-bold ${collectionColor}`}>
              {summary.collectionRate}%
            </p>
            <p className="text-xs text-slate-400 mt-1">
              ${formatCurrency(summary.pendingMonthly)} pendiente
            </p>
          </div>

          {/* Occupancy */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🏠</span>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Ocupación</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {summary.occupiedUnits}/{summary.totalUnits}
            </p>
            <div className="mt-2 w-full bg-slate-100 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${summary.occupancyRate}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">{summary.occupancyRate}% ocupado</p>
          </div>

          {/* Open Incidents */}
          <div className={`rounded-2xl border shadow-sm p-5 ${summary.openIncidents > 3 ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">⚠️</span>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Incidencias</p>
            </div>
            <p className={`text-2xl font-bold ${summary.openIncidents > 3 ? 'text-red-600' : 'text-slate-900'}`}>
              {summary.openIncidents}
            </p>
            <p className="text-xs text-slate-400 mt-1">abiertas</p>
          </div>
        </div>

        {/* Expiring Contracts Banner */}
        {expiringContracts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📋</span>
              <p className="text-sm font-semibold text-amber-800">
                {expiringContracts.length} contrato{expiringContracts.length > 1 ? 's' : ''} por vencer en &lt;60 días
              </p>
            </div>
            <div className="space-y-2">
              {expiringContracts.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-amber-900 font-medium">
                    Depto {c.unit_number} · {c.tenant_name}
                  </span>
                  <span className="text-amber-700 text-xs">
                    Vence {formatDate(c.end_date)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Units Section */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Unidades</p>
            <span className="text-xs text-slate-400">{units.length} deptos</span>
          </div>
          <div className="space-y-2">
            {units.map((u, i) => {
              const status = u.payment_status ? paymentStatusConfig[u.payment_status] : null
              return (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">Depto {u.unit_number}</p>
                      {!u.tenant_name && (
                        <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">Vacante</span>
                      )}
                    </div>
                    {u.tenant_name && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{u.tenant_name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    {u.monthly_rent && (
                      <p className="text-sm font-bold text-slate-700">${formatCurrency(u.monthly_rent)}</p>
                    )}
                    {status && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${status.color}`}>
                        {status.icon} {status.label}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Expenses Section */}
        {expenses.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Gastos del mes</p>
              <p className="text-sm font-bold text-slate-900">${formatCurrency(summary.totalExpenses)}</p>
            </div>
            <div className="space-y-2">
              {expenses.map((e, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {categoryLabels[e.category] || e.category}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatDate(e.date)}{e.provider ? ` · ${e.provider}` : ''}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-slate-700">${formatCurrency(e.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Incidents Section */}
        {incidents.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Incidencias abiertas</p>
              <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-semibold">
                {incidents.length}
              </span>
            </div>
            <div className="space-y-2">
              {incidents.map((inc) => (
                <div
                  key={inc.id}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 truncate">{inc.title}</p>
                      <span className="text-xs text-slate-400 whitespace-nowrap">Depto {inc.unit_number}</span>
                    </div>
                    {inc.description && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{inc.description}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                    inc.priority === 'urgent' || inc.priority === 'high'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-orange-50 text-orange-600'
                  }`}>
                    {inc.status === 'open' ? 'Abierto' : inc.status === 'in_progress' ? 'En proceso' : 'Esperando'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-8 px-4 border-t border-slate-100 mt-4">
        <p className="text-xs text-slate-400">BaW · Datos en tiempo real · ALM809P</p>
      </footer>
    </div>
  )
}
