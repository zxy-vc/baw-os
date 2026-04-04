'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface StatementExpense {
  category: string
  amount: number
  provider: string | null
}

interface StatementIncident {
  id: string
  title: string
  status: string
  priority: string
  created_at: string
}

interface UnitStatement {
  unit_number: string
  unit_id: string
  tenant_name: string | null
  gross_rent: number
  admin_fee: number
  unit_expenses: number
  general_expenses_share: number
  maintenance_cost: number
  net_payout: number
  payment_status: string
  paid_date: string | null
  expenses_detail: StatementExpense[]
  incidents: StatementIncident[]
}

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

interface OwnerData {
  summary: Summary
  statements: UnitStatement[]
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0 }).format(n)
}

function formatPaidDate(d: string): string {
  const [year, month, day] = d.split('T')[0].split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
  })
}

const monthName = new Date().toLocaleDateString('es-MX', { month: 'long' })
const yearStr = new Date().getFullYear().toString()

const categoryLabels: Record<string, string> = {
  internet: 'Internet',
  gas: 'Gas',
  luz: 'Luz',
  mantenimiento: 'Mantenimiento',
  limpieza: 'Limpieza',
  otro: 'Otro',
}

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  paid: { label: 'Pagado', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  pending: { label: 'Pendiente de cobro', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
  late: { label: 'En mora', bg: 'bg-red-50 border-red-200', text: 'text-red-700' },
  partial: { label: 'Pago parcial', bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700' },
}

const incidentStatusLabels: Record<string, string> = {
  open: 'Abierto',
  in_progress: 'En proceso',
  waiting_parts: 'Esperando',
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
          <p className="text-slate-400 text-sm">Cargando estado de cuenta...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">&#128274;</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Acceso denegado</h1>
          <p className="text-slate-500 text-sm">Este enlace no es valido o no tienes autorizacion.</p>
        </div>
      </div>
    )
  }

  const { statements, summary } = data

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">BaW</span>
          </div>
          <div className="flex-1">
            <h1 className="font-semibold text-sm text-slate-900 tracking-tight">Estado de Cuenta</h1>
            <p className="text-xs text-slate-400 capitalize">{monthName} {yearStr}</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Summary KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Cobrado</p>
            <p className="text-xl font-bold text-slate-900">${fmt(summary.collectedMonthly)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Ingreso neto</p>
            <p className={`text-xl font-bold ${summary.netIncome >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              ${fmt(summary.netIncome)}
            </p>
          </div>
        </div>

        {/* Per-unit statements */}
        {statements.map((st) => {
          const ps = statusConfig[st.payment_status] || statusConfig.pending
          const totalExpenses = st.unit_expenses + st.general_expenses_share

          return (
            <div key={st.unit_id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Unit header */}
              <div className="px-5 pt-5 pb-3">
                <h2 className="text-lg font-bold text-slate-900">
                  Tu unidad {st.unit_number} — <span className="capitalize">{monthName}</span> {yearStr}
                </h2>
                {st.tenant_name && (
                  <p className="text-xs text-slate-400 mt-0.5">Inquilino: {st.tenant_name}</p>
                )}
              </div>

              {/* Statement breakdown */}
              <div className="px-5 pb-4 space-y-3">
                {/* Gross rent */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600">Renta bruta</p>
                  <p className="text-sm font-semibold text-slate-900">${fmt(st.gross_rent)}</p>
                </div>

                {/* Admin fee */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">(-) Cuota administracion (10%)</p>
                  <p className="text-sm text-red-500">-${fmt(st.admin_fee)}</p>
                </div>

                {/* Expenses */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">(-) Gastos del mes</p>
                    {st.expenses_detail.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {st.expenses_detail.map((e, i) => (
                          <p key={i} className="text-[11px] text-slate-400 pl-3">
                            {categoryLabels[e.category] || e.category}: ${fmt(e.amount)}
                          </p>
                        ))}
                        {st.general_expenses_share > 0 && (
                          <p className="text-[11px] text-slate-400 pl-3">
                            Prorrateo general: ${fmt(st.general_expenses_share)}
                          </p>
                        )}
                      </div>
                    )}
                    {st.expenses_detail.length === 0 && st.general_expenses_share > 0 && (
                      <p className="text-[11px] text-slate-400 pl-3 mt-1">
                        Prorrateo general: ${fmt(st.general_expenses_share)}
                      </p>
                    )}
                  </div>
                  <p className="text-sm text-red-500 self-start">-${fmt(totalExpenses)}</p>
                </div>

                {/* Maintenance */}
                {st.maintenance_cost > 0 && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500">(-) Mantenimientos</p>
                    <p className="text-sm text-red-500">-${fmt(st.maintenance_cost)}</p>
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-base font-bold text-slate-900">Pago neto a recibir</p>
                    <p className={`text-2xl font-bold ${st.net_payout >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      ${fmt(st.net_payout)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Payment status */}
              <div className={`px-5 py-3 border-t ${ps.bg}`}>
                <p className={`text-sm font-semibold ${ps.text}`}>
                  {st.payment_status === 'paid' && st.paid_date
                    ? `Pagado el ${formatPaidDate(st.paid_date)}`
                    : ps.label}
                </p>
              </div>

              {/* Incidents */}
              {st.incidents.length > 0 && (
                <div className="px-5 py-4 border-t border-slate-100">
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">
                    Incidencias del mes
                  </p>
                  <div className="space-y-2">
                    {st.incidents.map((inc) => (
                      <div key={inc.id} className="flex items-center justify-between">
                        <p className="text-sm text-slate-700 truncate flex-1 mr-2">{inc.title}</p>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                          inc.priority === 'urgent' || inc.priority === 'high'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {incidentStatusLabels[inc.status] || inc.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {statements.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
            <p className="text-slate-400 text-sm">No hay contratos activos este mes.</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-8 px-4 border-t border-slate-100 mt-4">
        <p className="text-xs text-slate-400">BaW · Estado de cuenta · ALM809P</p>
      </footer>
    </div>
  )
}
