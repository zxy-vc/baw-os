'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, daysUntil } from '@/lib/utils'
import {
  StatusBadge,
  KPICard,
  type StatusKind,
} from '@/components/ui/status'
import ContractAlertsBanner from '@/components/ContractAlertsBanner'
import { useActiveContext, ALL_BUILDINGS } from '@/lib/useActiveContext'
import { scheduleMonths, computeMonthStatus, rankPayment, pad2 } from '@/lib/billing'
import { resolveServiceRate, type ServiceRate } from '@/lib/cobros'

// S9 hotfix: Mission Control ahora espera el contexto activo y filtra todas
// las queries por activeOrgId. Antes confiaba 100% en RLS y, cuando una sola
// query fallaba (e.g. organizations sin policies), el Promise.all colapsaba
// la página y en iOS Safari se veía como un 404 / pantalla en blanco.

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
  const { activeOrgId, activeBuildingId, loading: ctxLoading, orgs } = useActiveContext()
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
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    // S9: esperar a que el contexto activo se hidrate antes de hacer queries
    if (ctxLoading) return

    // Sin orgs → onboarding directo
    if (orgs.length === 0) {
      setNeedsOnboarding(true)
      setLoading(false)
      return
    }

    async function fetchDashboard() {
      try {
        const now = new Date()

        // Filtrar todas las queries por activeOrgId. Si por algún motivo no
        // hay org activa todavía, abortamos sin romper la UI.
        if (!activeOrgId) {
          setLoading(false)
          return
        }

        // Edificio activo: si hay uno específico (no "Todos" ni vacío) filtramos.
        // Contratos/pagos/incidencias cuelgan de la unidad, así que filtramos por
        // el edificio de la unidad usando joins !inner de PostgREST.
        const bId =
          activeBuildingId && activeBuildingId !== ALL_BUILDINGS
            ? activeBuildingId
            : null

        // Selects: con filtro de edificio usamos !inner para poder filtrar por
        // la columna anidada; sin filtro, embeds normales (no excluir filas).
        const contractsSel = bId
          ? 'id, unit_id, monthly_amount, payment_day, start_date, billing_start_date, end_date, status, unit:units!inner(number, building_id), occupant:occupants(name)'
          : 'id, unit_id, monthly_amount, payment_day, start_date, billing_start_date, end_date, status, unit:units(number, building_id), occupant:occupants(name)'
        const incidentsSel = bId
          ? 'id, status, created_at, description, unit:units!inner(number, building_id)'
          : 'id, status, created_at, description, unit:units(number)'

        // Nota: los filtros .eq() van ANTES de .order()/.limit() (el builder de
        // Supabase deja de exponer .eq() una vez transformado).
        let unitsQ = supabase.from('units').select('*').eq('org_id', activeOrgId)
        if (bId) unitsQ = unitsQ.eq('building_id', bId)
        const unitsFinal = unitsQ.order('floor').order('number')

        let contractsQ = supabase
          .from('contracts')
          .select(contractsSel)
          .eq('org_id', activeOrgId)
          .in('status', ['active', 'en_renovacion'])
        if (bId) contractsQ = contractsQ.eq('unit.building_id', bId)

        let incidentsQ = supabase
          .from('incidents')
          .select(incidentsSel)
          .eq('org_id', activeOrgId)
          .in('status', ['open', 'in_progress', 'pending'])
        if (bId) incidentsQ = incidentsQ.eq('unit.building_id', bId)
        const incidentsFinal = incidentsQ
          .order('created_at', { ascending: false })
          .limit(5)

        const [unitsRes, contractsRes, maintRes] = await Promise.all([
          unitsFinal,
          contractsQ,
          incidentsFinal,
        ])

        const units = unitsRes.data || []
        const contracts = (contractsRes.data || []) as Record<string, unknown>[]
        const tickets = maintRes.data || []

        // Pagos (todos) de esos contratos + tarifas de agua, para PROYECTAR el
        // adeudo igual que Cobros (fuente única @/lib/billing). Antes el dashboard
        // contaba solo filas con status 'late' y subcontaba la morosidad real.
        const contractIds = contracts.map((c) => c.id as string)
        const [allPaymentsRes, ratesRes] = await Promise.all([
          contractIds.length
            ? supabase
                .from('payments')
                .select('contract_id, due_date, status, amount, amount_paid, late_fee_amount')
                .in('contract_id', contractIds)
            : Promise.resolve({ data: [] as Record<string, unknown>[] }),
          supabase
            .from('service_rates')
            .select('building_id, service, amount, effective_from')
            .eq('org_id', activeOrgId)
            .eq('service', 'agua'),
        ])
        const allPayments = (allPaymentsRes.data || []) as Record<string, unknown>[]
        const waterRates = (ratesRes.data || []) as ServiceRate[]

        const paymentByKey = new Map<string, Record<string, unknown>>()
        for (const p of allPayments) {
          const key = `${p.contract_id}|${String(p.due_date).slice(0, 7)}`
          const prev = paymentByKey.get(key)
          if (!prev || rankPayment(p.status as string) > rankPayment(prev.status as string)) paymentByKey.set(key, p)
        }

        const cutoff = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
        type OverdueRow = { contract: Record<string, unknown>; dueDate: string; owed: number }
        const overdueRows: OverdueRow[] = []
        for (const c of contracts) {
          const unitRel = c.unit as { building_id?: string | null } | { building_id?: string | null }[] | null
          const buildingId = (Array.isArray(unitRel) ? unitRel[0]?.building_id : unitRel?.building_id) ?? null
          const months = scheduleMonths(
            (c.billing_start_date as string | null) ?? (c.start_date as string | null),
            cutoff,
          )
          for (const month of months) {
            const dueDate = `${month}-${pad2(Number(c.payment_day) || 1)}`
            const payment = (paymentByKey.get(`${c.id}|${month}`) || null) as
              | { status: string; amount: number | null; amount_paid: number | null; late_fee_amount: number | null }
              | null
            const waterFee = resolveServiceRate(waterRates, 'agua', buildingId, month) ?? 250
            const r = computeMonthStatus({
              monthlyAmount: Number(c.monthly_amount || 0),
              paymentDay: (c.payment_day as number) ?? null,
              dueDate,
              waterFee,
              payment,
              today: now,
            })
            if (r.status === 'mora' || r.status === 'vencido' || r.status === 'parcial') {
              overdueRows.push({ contract: c, dueDate, owed: r.owed })
            }
          }
        }
        overdueRows.sort((a, b) => a.dueDate.localeCompare(b.dueDate))

        // S9: empty state honesto — si la org existe pero no tiene units ni
        // contracts, mostrar dashboard vacío (no onboarding) porque el user
        // ya completó onboarding pero no tiene operación cargada todavía.
        // Solo redirigir a onboarding si NO hay orgs.
        if (units.length === 0 && contracts.length === 0 && orgs.length === 0) {
          setNeedsOnboarding(true)
        }

        const totalUnits = units.length
        const occupiedUnits = units.filter(
          (u: { status: string }) => u.status === 'occupied'
        ).length
        const availableUnits = units.filter(
          (u: { status: string }) => u.status === 'available'
        ).length
        const monthlyRevenue = contracts.reduce(
          (sum: number, c) => sum + Number((c.monthly_amount as number) || 0),
          0
        )
        // Morosidad = adeudo proyectado (vencido/mora/parcial), igual que Cobros.
        const overdueAmount = overdueRows.reduce((sum, r) => sum + r.owed, 0)
        const overdueCount = overdueRows.length
        const expiringCount = contracts.filter(
          (c) => c.end_date && daysUntil(c.end_date as string) <= 60
        ).length

        setMetrics({
          totalUnits,
          occupiedUnits,
          availableUnits,
          monthlyRevenue,
          overdueAmount,
          overdueCount,
          expiringCount,
        })

        const unitNumber = (c: Record<string, unknown>): string => {
          const u = c.unit as { number?: string } | { number?: string }[] | null
          return (Array.isArray(u) ? u[0]?.number : u?.number) || '—'
        }
        const occupantName = (c: Record<string, unknown>): string => {
          const o = c.occupant as { name?: string } | { name?: string }[] | null
          return (Array.isArray(o) ? o[0]?.name : o?.name) || 'Sin ocupante'
        }

        setCollections(
          overdueRows.slice(0, 5).map((r, i) => ({
            id: `${r.contract.id}-${r.dueDate}-${i}`,
            unit: unitNumber(r.contract),
            tenant: occupantName(r.contract),
            amount: r.owed,
            status: 'late' as const,
            daysOverdue: Math.max(
              0,
              Math.floor((now.getTime() - new Date(r.dueDate).getTime()) / (1000 * 60 * 60 * 24))
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
  }, [ctxLoading, activeOrgId, activeBuildingId, orgs.length])

  const occupancyPct =
    metrics.totalUnits > 0
      ? ((metrics.occupiedUnits / metrics.totalUnits) * 100).toFixed(1)
      : '0.0'

  // Empty state honesto: si no hay datos, ofrecer el onboarding como CTA principal
  if (!loading && needsOnboarding) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div
          className="max-w-lg w-full rounded-lg p-8 text-center"
          style={{
            backgroundColor: 'var(--baw-surface)',
            border: '1px solid var(--baw-border)',
          }}
        >
          <div
            className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-4"
            style={{
              backgroundColor: 'var(--baw-info-bg)',
              color: 'var(--baw-primary)',
            }}
          >
            <Sparkles size={22} />
          </div>
          <h1 className="text-[22px] font-semibold">BaW está listo para arrancar</h1>
          <p className="muted-text text-[13px] mt-2 max-w-md mx-auto">
            Aún no hay un PM Company configurado. Tarda dos minutos: registra tu
            organización, tu primer edificio, las unidades y el Property Owner.
          </p>
          <Link
            href="/onboarding"
            className="inline-block mt-6 px-5 py-2 rounded-md text-[13px] font-medium"
            style={{ backgroundColor: 'var(--baw-primary)', color: 'var(--baw-on-primary)' }}
          >
            Empezar onboarding
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Mission Control</h1>
          <MissionControlSubtitle />
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
            <div className="overflow-x-auto">
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
            </div>
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

// Sprint 3 / S7: Subtítulo dinámico de Mission Control
// Antes hardcoded "Frontier Bay · Operación en vivo"; ahora lee la org y
// building activos del contexto compartido y cae en un placeholder neutro
// si todavía no hay onboarding completo.
function MissionControlSubtitle() {
  const { orgs, buildings, activeOrgId, activeBuildingId, loading } =
    useActiveContext()
  if (loading) return <p className="text-[13px] muted-text mt-0.5">···</p>
  const activeOrg = orgs.find((o) => o.id === activeOrgId)
  const activeBuilding = buildings.find((b) => b.id === activeBuildingId)
  const orgName = activeOrg?.name?.trim()
  const buildingName = activeBuilding?.name?.trim()
  const label = buildingName
    ? `${buildingName}${orgName ? ` · ${orgName}` : ''}`
    : orgName || 'Workspace sin configurar'
  return (
    <p className="text-[13px] muted-text mt-0.5">
      {label} · Operación en vivo
    </p>
  )
}
