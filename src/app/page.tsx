'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, daysUntil } from '@/lib/utils'
import {
  StatusBadge,
  KPICard,
  type StatusKind,
} from '@/components/ui/status'
import ContractAlertsBanner from '@/components/ContractAlertsBanner'

interface CollectionRow {
  id: string
  unit: string
  tenant: string
  amount: number
  status: StatusKind
  daysOverdue: number
}

interface MaintRow {
  id: string
  unit: string
  issue: string
  status: string
  createdAt: string
}

interface DashboardMetrics {
  totalUnits: number
  occupiedUnits: number
  availableUnits: number
  monthlyRevenue: number
  overdueAmount: number
  overdueCount: number
  expiringCount: number
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n)
}

export default function MissionControl() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalUnits: 0,
    occupiedUnits: 0,
    availableUnits: 0,
    monthlyRevenue: 0,
    overdueAmount: 0,
    overdueCount: 0,
    expiringCount: 0,
  })
  const [collections, setCollections] = useState<CollectionRow[]>([])
  const [maintenance, setMaintenance] = useState<MaintRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const now = new Date()

        const [unitsRes, contractsRes, paymentsRes, maintRes] = await Promise.all([
          supabase.from('units').select('*').order('floor').order('number'),
          supabase
            .from('contracts')
            .select(
              'id, unit_id, monthly_amount, end_date, status, unit:units(number), occupant:occupants(name)'
            )
            .in('status', ['active', 'en_renovacion']),
          supabase
            .from('payments')
            .select(
              'id, amount, due_date, status, contract:contracts(unit:units(number), occupant:occupants(name))'
            )
            .in('status', ['pending', 'late'])
            .order('due_date', { ascending: true }),
          supabase
            .from('incidents')
            .select('id, status, created_at, description, unit:units(number)')
            .in('status', ['open', 'in_progress', 'pending'])
            .order('created_at', { ascending: false })
            .limit(5),
        ])

        const units = unitsRes.data || []
        const contracts = contractsRes.data || []
        const payments = paymentsRes.data || []
        const tickets = maintRes.data || []

        const totalUnits = units.length
        const occupiedUnits = units.filter(
          (u: { status: string }) => u.status === 'occupied'
        ).length
        const availableUnits = units.filter(
          (u: { status: string }) => u.status === 'available'
        ).length
        const monthlyRevenue = contracts.reduce(
          (sum: number, c: { monthly_amount: number | null }) =>
            sum + Number(c.monthly_amount || 0),
          0
        )
        const overdue = payments.filter(
          (p: { status: string }) => p.status === 'late'
        )
        const overdueAmount = overdue.reduce(
          (sum: number, p: { amount: number | null }) =>
            sum + Number(p.amount || 0),
          0
        )
        const expiringCount = contracts.filter(
          (c: { end_date: string | null }) =>
            c.end_date && daysUntil(c.end_date) <= 60
        ).length

        setMetrics({
          totalUnits,
          occupiedUnits,
          availableUnits,
          monthlyRevenue,
          overdueAmount,
          overdueCount: overdue.length,
          expiringCount,
        })

        setCollections(
          payments.slice(0, 5).map((p: any) => ({
            id: p.id,
            unit:
              p.contract?.[0]?.unit?.[0]?.number ||
              p.contract?.unit?.number ||
              '—',
            tenant:
              p.contract?.[0]?.occupant?.[0]?.name ||
              p.contract?.occupant?.name ||
              'Sin ocupante',
            amount: Number(p.amount || 0),
            status: p.status === 'late' ? 'late' : 'pending',
            daysOverdue: Math.max(
              0,
              Math.floor(
                (now.getTime() - new Date(p.due_date).getTime()) /
                  (1000 * 60 * 60 * 24)
              )
            ),
          }))
        )

        setMaintenance(
          tickets.map((t: any) => ({
            id: t.id,
            unit: t.unit?.number || t.unit?.[0]?.number || '—',
            issue: t.description || 'Sin descripción',
            status: t.status,
            createdAt: t.created_at,
          }))
        )
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [])

  const occupancyPct =
    metrics.totalUnits > 0
      ? ((metrics.occupiedUnits / metrics.totalUnits) * 100).toFixed(1)
      : '0.0'

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Mission Control</h1>
          <p className="text-[13px] muted-text mt-0.5">
            Frontier Bay · Operación en vivo
          </p>
        </div>
      </div>

      <ContractAlertsBanner />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          label="Ocupación"
          value={`${occupancyPct}%`}
          delta={0}
          deltaLabel=""
        >
          <span className="text-[11px] muted-text tabular-nums">
            {metrics.occupiedUnits} de {metrics.totalUnits} unidades
          </span>
        </KPICard>
        <KPICard
          label="Ingreso mensual"
          value={formatCurrency(metrics.monthlyRevenue)}
          delta={0}
        >
          <span className="text-[11px] muted-text tabular-nums">
            Contratos activos y en renovación
          </span>
        </KPICard>
        <KPICard
          label="Morosidad"
          value={formatCurrency(metrics.overdueAmount)}
          warning={metrics.overdueCount > 0}
        >
          <span className="text-[11px] muted-text tabular-nums">
            {metrics.overdueCount} pagos vencidos
          </span>
        </KPICard>
        <KPICard label="Contratos activos" value={metrics.occupiedUnits}>
          <span className="text-[11px] muted-text tabular-nums">
            {metrics.expiringCount} por vencer en 60 días
          </span>
        </KPICard>
        <KPICard label="Disponibles" value={metrics.availableUnits}>
          <span className="text-[11px] muted-text tabular-nums">
            Inventario listo para ocupación
          </span>
        </KPICard>
        <KPICard
          label="Mantenimiento abierto"
          value={loading ? '…' : maintenance.length}
        >
          <span className="text-[11px] muted-text tabular-nums">
            Tickets sin cerrar
          </span>
        </KPICard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section
          className="rounded-lg overflow-hidden"
          style={{
            backgroundColor: 'var(--baw-surface)',
            border: '1px solid var(--baw-border)',
          }}
        >
          <header
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--baw-border)' }}
          >
            <div className="flex items-center gap-2">
              <h2
                className="text-[13px] font-semibold"
                style={{ color: 'var(--baw-text)' }}
              >
                Cobros pendientes
              </h2>
              <span className="text-[11px] muted-text tabular-nums">
                {collections.length}
              </span>
            </div>
            <Link
              href="/cobros"
              className="text-[12px]"
              style={{ color: 'var(--baw-primary)' }}
            >
              Ver todo →
            </Link>
          </header>
          {loading ? (
            <div className="px-4 py-6 text-[13px] muted-text">Cargando…</div>
          ) : collections.length === 0 ? (
            <div className="px-4 py-6 text-[13px] muted-text">
              Sin pagos pendientes ni vencidos.
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="table-header">
                <tr>
                  <th className="text-left px-4 py-2">Unidad</th>
                  <th className="text-left px-4 py-2">Inquilino</th>
                  <th className="text-right px-4 py-2">Monto</th>
                  <th className="text-left px-4 py-2">Estado</th>
                  <th className="text-right px-4 py-2">Mora</th>
                </tr>
              </thead>
              <tbody>
                {collections.map((r) => (
                  <tr key={r.id} className="table-row">
                    <td
                      className="px-4 py-2 font-medium tabular-nums"
                      style={{ color: 'var(--baw-text)' }}
                    >
                      {r.unit}
                    </td>
                    <td className="px-4 py-2 muted-text">{r.tenant}</td>
                    <td
                      className="px-4 py-2 text-right tabular-nums"
                      style={{ color: 'var(--baw-text)' }}
                    >
                      {fmtMoney(r.amount)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums muted-text">
                      {r.daysOverdue}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section
          className="rounded-lg overflow-hidden"
          style={{
            backgroundColor: 'var(--baw-surface)',
            border: '1px solid var(--baw-border)',
          }}
        >
          <header
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--baw-border)' }}
          >
            <div className="flex items-center gap-2">
              <h2
                className="text-[13px] font-semibold"
                style={{ color: 'var(--baw-text)' }}
              >
                Cola de mantenimiento
              </h2>
              <span className="text-[11px] muted-text tabular-nums">
                {maintenance.length}
              </span>
            </div>
            <Link
              href="/maintenance"
              className="text-[12px]"
              style={{ color: 'var(--baw-primary)' }}
            >
              Ver todo →
            </Link>
          </header>
          {loading ? (
            <div className="px-4 py-6 text-[13px] muted-text">Cargando…</div>
          ) : maintenance.length === 0 ? (
            <div className="px-4 py-6 text-[13px] muted-text">
              Sin tickets abiertos.
            </div>
          ) : (
            <ul
              className="divide-y"
              style={{ borderColor: 'var(--baw-border)' }}
            >
              {maintenance.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[12px] font-medium tabular-nums"
                      style={{ color: 'var(--baw-text)' }}
                    >
                      {t.unit}
                    </span>
                    <span
                      className="text-[10px] uppercase tracking-wider muted-text"
                    >
                      {t.status}
                    </span>
                  </div>
                  <p
                    className="text-[12.5px] leading-snug"
                    style={{ color: 'var(--baw-text)' }}
                  >
                    {t.issue}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
