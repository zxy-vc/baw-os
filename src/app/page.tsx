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
  Receipt,
  ArrowRight,
  CreditCard,
  AlertOctagon,
  CalendarPlus,
  FileText,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils'
import Link from 'next/link'
import { SkeletonDashboard } from '@/components/Skeleton'
import ContractAlertsBanner from '@/components/ContractAlertsBanner'
import type { Unit, Contract, Payment, Occupant } from '@/types'

interface UnitWithContract extends Unit {
  occupantName?: string
  contractType?: string
}

interface AlertItem {
  type: 'overdue' | 'expiring' | 'expiring_critical' | 'expiring_soon' | 'expiring_warning' | 'maintenance' | 'missing_payment'
  title: string
  detail: string
  unitNumber?: string
  severity?: 'red' | 'orange' | 'yellow'
}

interface RecentPayment {
  id: string
  amount: number
  paid_date: string
  method?: string
  unitNumber: string
  occupantName: string
  status: string
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

const QUICK_ACTIONS = [
  { label: 'Registrar Pago', href: '/cobros', icon: CreditCard, color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30 dark:border-emerald-800' },
  { label: 'Nueva Incidencia', href: '/maintenance', icon: AlertOctagon, color: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30 dark:border-amber-800' },
  { label: 'Nueva Reservación', href: '/reservations', icon: CalendarPlus, color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 dark:border-blue-800' },
  { label: 'Generar Factura', href: '/invoices', icon: FileText, color: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/30 dark:border-purple-800' },
]

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
  const [cobrosSummary, setCobrosSummary] = useState<{ total: number; paid: number; pending: number; overdue: number } | null>(null)
  const [moraCriticalCount, setMoraCriticalCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboard() {
      try {
        // Current month range for missing payment detection
        const now0 = new Date()
        const monthStart = `${now0.getFullYear()}-${String(now0.getMonth() + 1).padStart(2, '0')}-01`
        const nextMonth = now0.getMonth() === 11
          ? `${now0.getFullYear() + 1}-01-01`
          : `${now0.getFullYear()}-${String(now0.getMonth() + 2).padStart(2, '0')}-01`

        const [unitsRes, contractsRes, paymentsRes, recentPmtsRes, paidThisMonthRes] = await Promise.all([
          supabase
            .from('units')
            .select('*')
            .order('floor', { ascending: false })
            .order('number'),
          supabase
            .from('contracts')
            .select('*, unit:units(id, number), occupant:occupants(id, name)')
            .in('status', ['active', 'expired', 'en_renovacion']),
          supabase
            .from('payments')
            .select('*, contract:contracts(*, unit:units(number), occupant:occupants(name))')
            .in('status', ['pending', 'late']),
          supabase
            .from('payments')
            .select('*, contract:contracts(*, unit:units(number), occupant:occupants(name))')
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('payments')
            .select('contract_id, status, due_date')
            .eq('status', 'paid')
            .gte('due_date', monthStart)
            .lt('due_date', nextMonth),
        ])

        const allUnits = (unitsRes.data || []) as Unit[]
        const activeContracts = (contractsRes.data || []) as (Contract & {
          unit: { id: string; number: string }
          occupant: { id: string; name: string }
        })[]
        const pendingPayments = (paymentsRes.data || []) as (Payment & {
          contract: Contract & { unit: { number: string }; occupant: { name: string } }
        })[]
        const recentAll = (recentPmtsRes.data || []) as (Payment & {
          contract: Contract & { unit: { number: string }; occupant: { name: string } }
        })[]

        // Build unit map with occupant info — prefer active, fallback to most recent expired
        const contractByUnit = new Map<string, { occupantName: string; type: string; status: string }>()
        for (const c of activeContracts) {
          if (!c.unit) continue
          const existing = contractByUnit.get(c.unit_id)
          // Active contracts always win; for expired, only set if no entry yet
          if (!existing || c.status === 'active') {
            contractByUnit.set(c.unit_id, {
              occupantName: c.occupant?.name || '',
              type: 'LTR',
              status: c.status,
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
        // Monthly income includes active + en_renovacion contracts (all occupied paying units)
        const monthlyIncome = activeContracts
          .filter((c) => ['active', 'en_renovacion'].includes(c.status))
          .reduce((sum, c) => sum + Number(c.monthly_amount), 0)

        // Overdue: payments with status 'late'
        const overduePayments = pendingPayments.filter((p) => p.status === 'late')

        // Expiring soon: active contracts ending within 60 days (for tiered alerts)
        const now = new Date()
        const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
        const expiringContracts = activeContracts.filter(
          (c) => c.end_date && c.status === 'active' && new Date(c.end_date) <= in60Days
        )

        // Paid this month — set of contract IDs that have a paid payment this month
        const paidThisMonth = new Set(
          (paidThisMonthRes.data || []).map((p: { contract_id: string }) => p.contract_id)
        )

        // Missing payments: active contracts with no paid payment this month and day > 10
        const missingPaymentContracts = now.getDate() > 10
          ? activeContracts.filter(
              (c) => c.status === 'active' && !paidThisMonth.has(c.id) && !overduePayments.some((p) => p.contract_id === c.id)
            )
          : []

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
          let alertType: AlertItem['type'] = 'expiring_warning'
          let severity: 'red' | 'orange' | 'yellow' = 'yellow'
          let message = `Vence en ${days} días — planear renovación`
          if (days <= 15) {
            alertType = 'expiring_critical'
            severity = 'red'
            message = `Vence en ${days} días — urgente renovar`
          } else if (days <= 30) {
            alertType = 'expiring_soon'
            severity = 'orange'
            message = `Vence en ${days} días`
          }
          alertItems.push({
            type: alertType,
            title: `Contrato por vencer — ${c.unit?.number || 'N/A'}`,
            detail: `${c.occupant?.name || 'Inquilino'} · ${message} · ${formatDate(c.end_date!)}`,
            unitNumber: c.unit?.number,
            severity,
          })
        }

        // Missing payment alerts (#2)
        for (const c of missingPaymentContracts) {
          alertItems.push({
            type: 'missing_payment',
            title: `Sin pago registrado — ${c.occupant?.name || 'Inquilino'} · ${c.unit?.number || 'N/A'}`,
            detail: `Día ${c.payment_day} de vencimiento · Sin pago en el mes actual`,
            unitNumber: c.unit?.number,
            severity: 'orange',
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

        // Sort alerts: overdue, expiring_critical, expiring_soon, expiring_warning, missing_payment, maintenance
        const alertOrder: Record<string, number> = {
          overdue: 0,
          expiring_critical: 1,
          expiring_soon: 2,
          expiring_warning: 3,
          missing_payment: 4,
          maintenance: 5,
          expiring: 3,
        }
        alertItems.sort((a, b) => (alertOrder[a.type] ?? 9) - (alertOrder[b.type] ?? 9))

        setAlerts(alertItems)
        setUnits(enrichedUnits)

        // Recent payments
        setRecentPayments(
          recentAll.map((p) => ({
            id: p.id,
            amount: Number(p.amount_paid || p.amount),
            paid_date: p.paid_date || p.due_date || p.created_at,
            method: p.method,
            unitNumber: p.contract?.unit?.number || 'N/A',
            occupantName: p.contract?.occupant?.name || 'N/A',
            status: p.status,
          }))
        )

        // Cobros del mes summary
        const activeLtrMtr = activeContracts.filter((c) => c.status === 'active')
        if (activeLtrMtr.length > 0) {
          const paidCount = activeLtrMtr.filter((c) => paidThisMonth.has(c.id)).length
          const todayDate = now.getDate()
          let overdueCount = 0
          let pendingCount = 0
          for (const c of activeLtrMtr) {
            if (paidThisMonth.has(c.id)) continue
            if (todayDate >= 10) {
              overdueCount++
            } else if (todayDate >= c.payment_day) {
              overdueCount++
            } else {
              pendingCount++
            }
          }
          setCobrosSummary({
            total: activeLtrMtr.length,
            paid: paidCount,
            pending: pendingCount,
            overdue: overdueCount,
          })
        }
        // Mora critical count
        try {
          const moraRes = await fetch('/api/mora')
          const moraData = await moraRes.json()
          if (moraData.success && moraData.data) {
            const critical = (moraData.data as Array<{ level: string }>).filter(
              (m) => m.level === 'critical' || m.level === 'legal'
            ).length
            setMoraCriticalCount(critical)
          }
        } catch {
          // Mora fetch is non-blocking
        }
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

  const alertIconEl = (type: string) => {
    switch (type) {
      case 'overdue':
        return <div className="p-1.5 rounded-full bg-red-100 dark:bg-red-900/30"><AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" /></div>
      case 'expiring_critical':
        return <div className="p-1.5 rounded-full bg-red-100 dark:bg-red-900/30"><Clock className="w-4 h-4 text-red-600 dark:text-red-400" /></div>
      case 'expiring_soon':
        return <div className="p-1.5 rounded-full bg-orange-100 dark:bg-orange-900/30"><Clock className="w-4 h-4 text-orange-600 dark:text-orange-400" /></div>
      case 'expiring_warning':
        return <div className="p-1.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30"><Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" /></div>
      case 'missing_payment':
        return <div className="p-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30"><AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" /></div>
      case 'maintenance':
        return <div className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-800"><Wrench className="w-4 h-4 text-gray-600 dark:text-gray-400" /></div>
      default:
        return null
    }
  }

  const alertBorderColor = (alert: AlertItem) => {
    if (alert.type === 'overdue' || alert.type === 'expiring_critical') return 'border-l-4 border-l-red-500'
    if (alert.type === 'expiring_soon') return 'border-l-4 border-l-orange-500'
    if (alert.type === 'expiring_warning') return 'border-l-4 border-l-yellow-500'
    if (alert.type === 'missing_payment') return 'border-l-4 border-l-amber-500'
    return 'border-l-4 border-l-gray-400'
  }

  const alertBg = (alert: AlertItem) => {
    if (alert.type === 'overdue') return 'bg-red-50 dark:bg-red-900/20'
    if (alert.type === 'expiring_critical') return 'bg-red-50 dark:bg-red-900/20'
    if (alert.type === 'expiring_soon') return 'bg-orange-50 dark:bg-orange-900/20'
    if (alert.type === 'expiring_warning') return 'bg-yellow-50 dark:bg-yellow-900/20'
    if (alert.type === 'missing_payment') return 'bg-amber-50 dark:bg-amber-900/20'
    if (alert.type === 'expiring') {
      if (alert.severity === 'red') return 'bg-red-50 dark:bg-red-900/20'
      if (alert.severity === 'yellow') return 'bg-yellow-50 dark:bg-yellow-900/20'
      if (alert.severity === 'orange') return 'bg-orange-50 dark:bg-orange-900/20'
    }
    return 'bg-gray-50 dark:bg-gray-800/50'
  }

  if (loading) {
    return <SkeletonDashboard />
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

      {/* Contract Expiry Alerts Banner */}
      <ContractAlertsBanner />

      {/* KPI Cards — with gradients */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Units */}
        <div className="card bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/40 dark:to-gray-900">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Unidades</p>
            <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/40">
              <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{kpis.total}</p>
          <div className="flex gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
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
        <div className="card bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-gray-900">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Ingreso mensual LTR
            </p>
            <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-900/40">
              <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(kpis.monthlyIncome)}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Renta base · sin agua (+$250/depto)
          </p>
        </div>

        {/* Overdue */}
        <div className={`card ${kpis.overdue > 0 ? 'bg-gradient-to-br from-red-50 to-white dark:from-red-950/40 dark:to-gray-900' : 'bg-gradient-to-br from-green-50 to-white dark:from-green-950/40 dark:to-gray-900'}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Pagos vencidos
            </p>
            <div className={`p-2 rounded-full ${kpis.overdue > 0 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-green-100 dark:bg-green-900/40'}`}>
              <AlertTriangle
                className={`w-5 h-5 ${kpis.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
              />
            </div>
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
        <div className={`card ${kpis.expiringSoon > 0 ? 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/40 dark:to-gray-900' : 'bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/40 dark:to-gray-900'}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Por vencer (60d)
            </p>
            <div className={`p-2 rounded-full ${kpis.expiringSoon > 0 ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
              <Clock
                className={`w-5 h-5 ${kpis.expiringSoon > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}
              />
            </div>
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

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all hover:shadow-md ${action.color}`}
          >
            <action.icon className="w-5 h-5 shrink-0" />
            <span className="truncate">{action.label}</span>
          </Link>
        ))}
      </div>

      {/* Mora crítica card — solo visible si hay deudores */}
      {moraCriticalCount > 0 && (
        <Link href="/mora" className="block card border-l-4 border-l-red-500 border-red-200 dark:border-red-800 hover:shadow-md transition-shadow bg-gradient-to-r from-red-50 to-white dark:from-red-950/30 dark:to-gray-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">En mora crítica</p>
              <p className="text-3xl font-bold text-red-700 dark:text-red-300 mt-1">{moraCriticalCount}</p>
              <p className="text-xs text-red-500/70 mt-1">contratos con {'>'} 15 días de mora</p>
            </div>
            <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/40">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </div>
        </Link>
      )}

      {/* Cobros del mes */}
      {cobrosSummary && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900/40">
                <Receipt className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Cobros del mes</h2>
            </div>
            <Link
              href="/cobros"
              className="flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-400 font-medium transition-colors"
            >
              Ver cobros <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
              {cobrosSummary.paid} pagados
            </span>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-yellow-100 text-yellow-700 border border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20">
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              {cobrosSummary.pending} pendientes
            </span>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
              <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
              {cobrosSummary.overdue} en mora
            </span>
          </div>
        </div>
      )}

      {/* Building Map */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900/40">
            <Home className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
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
            <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/40">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Alertas</h2>
            {alerts.length > 0 && (
              <span className="text-xs bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
                {alerts.length}
              </span>
            )}
          </div>

          {alerts.length === 0 ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-l-emerald-500">
              <div className="p-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Sin alertas — todo en orden</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg ${alertBg(alert)} ${alertBorderColor(alert)}`}
                >
                  <div className="mt-0.5 shrink-0">{alertIconEl(alert.type)}</div>
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
            <div className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900/40">
              <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Actividad reciente
            </h2>
          </div>

          {recentPayments.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Sin pagos registrados aún
            </p>
          ) : (
            <div className="space-y-2">
              {recentPayments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {p.occupantName}
                      </p>
                      <span className={
                        p.status === 'paid' ? 'badge-available' :
                        p.status === 'late' ? 'badge-late' :
                        p.status === 'pending' ? 'badge-pending' :
                        'badge-expired'
                      }>
                        {p.status === 'paid' ? 'Pagado' : p.status === 'late' ? 'Mora' : p.status === 'pending' ? 'Pendiente' : p.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Unidad {p.unitNumber} · {formatDate(p.paid_date)}
                      {p.method && ` · ${p.method}`}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 ml-3 ${p.status === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'}`}>
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
