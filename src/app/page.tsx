'use client'

import { useEffect, useState } from 'react'
import {
  Building2,
  DollarSign,
  AlertTriangle,
  Clock,
  Wrench,
  CheckCircle,
  Home,
  Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils'
import Link from 'next/link'
import type { Unit, Contract, Payment, Occupant } from '@/types'

interface UnitWithContract extends Unit {
  occupantName?: string
  contractType?: string
}

interface AlertItem {
  type: 'overdue' | 'expiring' | 'maintenance'
  title: string
  detail: string
  unitNumber?: string
}

interface RecentPayment {
  id: string
  amount: number
  paid_date: string
  method?: string
  unitNumber: string
  occupantName: string
}

const FLOORS = [4, 3, 2, 1]
const UNITS_PER_FLOOR = ['01', '02', '03', '04']

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  occupied: 'bg-blue-500/20 border-blue-500/40 text-blue-600 dark:text-blue-400',
  maintenance: 'bg-red-500/20 border-red-500/40 text-red-600 dark:text-red-400',
  reserved: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-600 dark:text-yellow-400',
  inactive: 'bg-gray-500/20 border-gray-500/40 text-gray-600 dark:text-gray-400',
}

const STATUS_DOT: Record<string, string> = {
  available: 'bg-emerald-500',
  occupied: 'bg-blue-500',
  maintenance: 'bg-red-500',
  reserved: 'bg-yellow-500',
  inactive: 'bg-gray-500',
}

const TYPE_BADGE: Record<string, string> = {
  STR: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  MTR: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  LTR: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  OFFICE: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  COMMON: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
}

export default function Dashboard() {
  const [units, setUnits] = useState<UnitWithContract[]>([])
  const [kpis, setKpis] = useState({
    total: 16,
    occupied: 0,
    available: 0,
    maintenance: 0,
    monthlyIncome: 0,
    overdue: 0,
    expiringSoon: 0,
  })
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const [unitsRes, contractsRes, paymentsRes, recentPmtsRes] = await Promise.all([
          supabase
            .from('units')
            .select('*')
            .order('floor', { ascending: false })
            .order('number'),
          supabase
            .from('contracts')
            .select('*, unit:units(id, number), occupant:occupants(id, name)')
            .eq('status', 'active'),
          supabase
            .from('payments')
            .select('*, contract:contracts(*, unit:units(number), occupant:occupants(name))')
            .in('status', ['pending', 'late']),
          supabase
            .from('payments')
            .select('*, contract:contracts(*, unit:units(number), occupant:occupants(name))')
            .eq('status', 'paid')
            .order('paid_date', { ascending: false })
            .limit(5),
        ])

        const allUnits = (unitsRes.data || []) as Unit[]
        const activeContracts = (contractsRes.data || []) as (Contract & {
          unit: { id: string; number: string }
          occupant: { id: string; name: string }
        })[]
        const pendingPayments = (paymentsRes.data || []) as (Payment & {
          contract: Contract & { unit: { number: string }; occupant: { name: string } }
        })[]
        const recentPaid = (recentPmtsRes.data || []) as (Payment & {
          contract: Contract & { unit: { number: string }; occupant: { name: string } }
        })[]

        // Build unit map with occupant info
        const contractByUnit = new Map<string, { occupantName: string; type: string }>()
        for (const c of activeContracts) {
          if (c.unit) {
            contractByUnit.set(c.unit_id, {
              occupantName: c.occupant?.name || '',
              type: c.unit?.number ? 'LTR' : 'LTR',
            })
          }
        }

        const enrichedUnits: UnitWithContract[] = allUnits.map((u) => {
          const contract = contractByUnit.get(u.id)
          return {
            ...u,
            occupantName: contract?.occupantName,
          }
        })

        // KPIs
        const occupied = allUnits.filter((u) => u.status === 'occupied').length
        const available = allUnits.filter((u) => u.status === 'available').length
        const maint = allUnits.filter((u) => u.status === 'maintenance').length
        const monthlyIncome = activeContracts.reduce(
          (sum, c) => sum + Number(c.monthly_amount),
          0
        )

        // Overdue: payments with status 'late'
        const overduePayments = pendingPayments.filter((p) => p.status === 'late')

        // Expiring soon: active contracts ending within 30 days
        const now = new Date()
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        const expiringContracts = activeContracts.filter(
          (c) => c.end_date && new Date(c.end_date) <= in30Days
        )

        // Overdue based on payment_day: active contracts where today > payment_day and no paid payment this month
        const currentMonth = now.getMonth()
        const currentYear = now.getFullYear()
        const overdueByDay = activeContracts.filter((c) => {
          if (now.getDate() <= c.payment_day) return false
          // Check if there's a late payment for this contract
          return overduePayments.some((p) => p.contract_id === c.id)
        })

        setKpis({
          total: allUnits.length || 16,
          occupied,
          available,
          maintenance: maint,
          monthlyIncome,
          overdue: overduePayments.length,
          expiringSoon: expiringContracts.length,
        })

        // Build alerts
        const alertItems: AlertItem[] = []

        for (const p of overduePayments) {
          const daysDiff = Math.floor(
            (now.getTime() - new Date(p.due_date).getTime()) / (1000 * 60 * 60 * 24)
          )
          alertItems.push({
            type: 'overdue',
            title: `Pago vencido — ${p.contract?.unit?.number || 'N/A'}`,
            detail: `${p.contract?.occupant?.name || 'Inquilino'} · ${daysDiff} días de mora · ${formatCurrency(p.amount)}`,
            unitNumber: p.contract?.unit?.number,
          })
        }

        for (const c of expiringContracts) {
          const days = daysUntil(c.end_date!)
          alertItems.push({
            type: 'expiring',
            title: `Contrato por vencer — ${c.unit?.number || 'N/A'}`,
            detail: `${c.occupant?.name || 'Inquilino'} · Vence en ${days} días · ${formatDate(c.end_date!)}`,
            unitNumber: c.unit?.number,
          })
        }

        for (const u of allUnits.filter((u) => u.status === 'maintenance')) {
          alertItems.push({
            type: 'maintenance',
            title: `En mantenimiento — ${u.number}`,
            detail: u.notes || 'Sin descripción',
            unitNumber: u.number,
          })
        }

        setAlerts(alertItems)
        setUnits(enrichedUnits)

        // Recent payments
        setRecentPayments(
          recentPaid.map((p) => ({
            id: p.id,
            amount: Number(p.amount_paid || p.amount),
            paid_date: p.paid_date || p.created_at,
            method: p.method,
            unitNumber: p.contract?.unit?.number || 'N/A',
            occupantName: p.contract?.occupant?.name || 'N/A',
          }))
        )
      } catch (err) {
        console.error('Error fetching dashboard:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [])

  function getUnitByNumber(number: string): UnitWithContract | undefined {
    return units.find((u) => u.number === number)
  }

  const alertIcon = (type: string) => {
    switch (type) {
      case 'overdue':
        return <span className="text-lg">🔴</span>
      case 'expiring':
        return <span className="text-lg">⚠️</span>
      case 'maintenance':
        return <span className="text-lg">🔧</span>
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 dark:text-gray-500 animate-pulse">
          Cargando dashboard...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Dashboard ejecutivo
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          ALM809P — Vista general de operación
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Units */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Unidades</p>
            <Building2 className="w-5 h-5 text-indigo-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{kpis.total}</p>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {kpis.occupied} ocup.
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {kpis.available} disp.
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {kpis.maintenance} mant.
            </span>
          </div>
        </div>

        {/* Monthly Income */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Ingreso mensual LTR
            </p>
            <DollarSign className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(kpis.monthlyIncome)}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Contratos activos
          </p>
        </div>

        {/* Overdue */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Pagos vencidos
            </p>
            <AlertTriangle
              className={`w-5 h-5 ${kpis.overdue > 0 ? 'text-red-500' : 'text-gray-300 dark:text-gray-700'}`}
            />
          </div>
          <p
            className={`text-3xl font-bold ${
              kpis.overdue > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            {kpis.overdue}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {kpis.overdue > 0 ? 'Requiere atención' : 'Al corriente'}
          </p>
        </div>

        {/* Expiring */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Por vencer (30d)
            </p>
            <Clock
              className={`w-5 h-5 ${kpis.expiringSoon > 0 ? 'text-amber-500' : 'text-gray-300 dark:text-gray-700'}`}
            />
          </div>
          <p
            className={`text-3xl font-bold ${
              kpis.expiringSoon > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            {kpis.expiringSoon}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {kpis.expiringSoon > 0 ? 'Contratos próximos a vencer' : 'Sin vencimientos próximos'}
          </p>
        </div>
      </div>

      {/* Building Map */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Home className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Mapa del edificio
          </h2>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-4 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Disponible
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Ocupado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Mantenimiento
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Reservado
          </span>
        </div>

        {/* Floors */}
        <div className="space-y-3">
          {FLOORS.map((floor) => (
            <div key={floor} className="flex items-center gap-3">
              <div className="w-12 text-xs font-medium text-gray-400 dark:text-gray-500 text-right shrink-0">
                Piso {floor}
              </div>
              <div className="grid grid-cols-4 gap-2 flex-1">
                {UNITS_PER_FLOOR.map((num) => {
                  const unitNumber = `${floor}${num}`
                  const unit = getUnitByNumber(unitNumber)
                  const status = unit?.status || 'inactive'
                  const colorClass = STATUS_COLORS[status] || STATUS_COLORS.inactive

                  return (
                    <Link
                      key={unitNumber}
                      href={unit ? `/units/${unit.id}` : '/units'}
                      className={`border rounded-lg p-3 transition-all hover:scale-[1.02] hover:shadow-md cursor-pointer ${colorClass}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm">{unitNumber}</span>
                        {unit?.type && (
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TYPE_BADGE[unit.type] || ''}`}
                          >
                            {unit.type}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] || 'bg-gray-500'}`}
                        />
                        <span className="text-[11px] truncate">
                          {unit?.occupantName ||
                            (status === 'available'
                              ? 'Disponible'
                              : status === 'maintenance'
                              ? 'Mant.'
                              : status === 'reserved'
                              ? 'Reservado'
                              : '—')}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom row: Alerts + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alerts */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Alertas</h2>
            {alerts.length > 0 && (
              <span className="text-xs bg-red-500/15 text-red-500 px-2 py-0.5 rounded-full font-medium">
                {alerts.length}
              </span>
            )}
          </div>

          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-500">
              <CheckCircle className="w-4 h-4" />
              Sin alertas — todo en orden
            </div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {alerts.map((alert, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                >
                  <div className="mt-0.5">{alertIcon(alert.type)}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {alert.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {alert.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Actividad reciente
            </h2>
          </div>

          {recentPayments.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Sin pagos registrados aún
            </p>
          ) : (
            <div className="space-y-3">
              {recentPayments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {p.occupantName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Unidad {p.unitNumber} · {formatDate(p.paid_date)}
                      {p.method && ` · ${p.method}`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 shrink-0 ml-3">
                    {formatCurrency(p.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
