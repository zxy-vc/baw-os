'use client'

import { useEffect, useState } from 'react'
import { Building2, FileText, CreditCard, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'

interface DashboardStats {
  totalUnits: number
  occupiedUnits: number
  activeContracts: number
  expiringContracts: number
  pendingPayments: number
  latePayments: number
  monthlyExpected: number
  monthlyReceived: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalUnits: 0,
    occupiedUnits: 0,
    activeContracts: 0,
    expiringContracts: 0,
    pendingPayments: 0,
    latePayments: 0,
    monthlyExpected: 0,
    monthlyReceived: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const [unitsRes, contractsRes, paymentsRes] = await Promise.all([
          supabase.from('units').select('id, status'),
          supabase.from('contracts').select('id, status, end_date, monthly_amount'),
          supabase.from('payments').select('id, status, amount, amount_paid'),
        ])

        const units = unitsRes.data || []
        const contracts = contractsRes.data || []
        const payments = paymentsRes.data || []

        const now = new Date()
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

        setStats({
          totalUnits: units.length,
          occupiedUnits: units.filter((u) => u.status === 'occupied').length,
          activeContracts: contracts.filter((c) => c.status === 'active').length,
          expiringContracts: contracts.filter(
            (c) =>
              c.status === 'active' &&
              c.end_date &&
              new Date(c.end_date) <= in30Days
          ).length,
          pendingPayments: payments.filter((p) => p.status === 'pending').length,
          latePayments: payments.filter((p) => p.status === 'late').length,
          monthlyExpected: contracts
            .filter((c) => c.status === 'active')
            .reduce((sum, c) => sum + Number(c.monthly_amount), 0),
          monthlyReceived: payments
            .filter((p) => p.status === 'paid')
            .reduce((sum, p) => sum + Number(p.amount_paid || p.amount), 0),
        })
      } catch (err) {
        console.error('Error fetching dashboard stats:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  const occupancyRate =
    stats.totalUnits > 0
      ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100)
      : 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">ALM809P — Vista general de operación</p>
      </div>

      {loading ? (
        <div className="text-gray-500">Cargando datos...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/units" className="card hover:border-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Unidades</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {stats.occupiedUnits}/{stats.totalUnits}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Ocupación: {occupancyRate}%
                  </p>
                </div>
                <Building2 className="w-10 h-10 text-indigo-500" />
              </div>
            </Link>

            <Link href="/contracts" className="card hover:border-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Contratos activos</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {stats.activeContracts}
                  </p>
                  {stats.expiringContracts > 0 && (
                    <p className="text-xs text-amber-400 mt-1">
                      {stats.expiringContracts} por vencer
                    </p>
                  )}
                </div>
                <FileText className="w-10 h-10 text-emerald-500" />
              </div>
            </Link>

            <Link href="/payments" className="card hover:border-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Ingresos del mes</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {formatCurrency(stats.monthlyReceived)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Esperado: {formatCurrency(stats.monthlyExpected)}
                  </p>
                </div>
                <CreditCard className="w-10 h-10 text-blue-500" />
              </div>
            </Link>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Alertas</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {stats.latePayments + stats.expiringContracts}
                  </p>
                  <div className="text-xs mt-1 space-y-0.5">
                    {stats.latePayments > 0 && (
                      <p className="text-red-400">
                        {stats.latePayments} pago(s) en mora
                      </p>
                    )}
                    {stats.expiringContracts > 0 && (
                      <p className="text-amber-400">
                        {stats.expiringContracts} contrato(s) por vencer
                      </p>
                    )}
                    {stats.latePayments === 0 && stats.expiringContracts === 0 && (
                      <p className="text-emerald-400">Sin alertas</p>
                    )}
                  </div>
                </div>
                <AlertTriangle
                  className={`w-10 h-10 ${
                    stats.latePayments > 0
                      ? 'text-red-500'
                      : stats.expiringContracts > 0
                      ? 'text-amber-500'
                      : 'text-gray-700'
                  }`}
                />
              </div>
            </div>
          </div>

          {stats.pendingPayments > 0 && (
            <div className="card border-amber-500/30">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-400">
                    {stats.pendingPayments} pago(s) pendientes este mes
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Revisa la sección de pagos para registrar cobros recibidos.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
