'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, daysUntil } from '@/lib/utils'
import {
  StatusBadge,
  AgentBadge,
  PriorityBadge,
  ActorAvatar,
  KPICard,
  type StatusKind,
  type Priority,
  type ActorType,
} from '@/components/ui/status'

type AttentionType = 'APPROVAL' | 'ESCALATION' | 'DECISION' | 'BLOCKED'

interface AttentionItem {
  id: string
  type: AttentionType
  isAgent: boolean
  description: string
  assignedTo: string
  assignedType: ActorType
  priority: Priority
  elapsed: string
}

interface ActivityEntry {
  id: string
  time: string
  agent: string
  role: string
  action: string
  status: StatusKind
  reasoning?: string
  expanded?: boolean
}

interface CollectionRow {
  unit: string
  tenant: string
  amount: number
  status: StatusKind
  daysOverdue: number
}

interface MaintRow {
  unit: string
  issue: string
  priority: Priority
  assignedTo: string
  sla: string
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

const ATTENTION_ITEMS: AttentionItem[] = [
  {
    id: '1',
    type: 'APPROVAL',
    isAgent: true,
    description: 'El agente de cobranza propone enviar recordatorios a unidades con atraso',
    assignedTo: 'Carmen',
    assignedType: 'agent',
    priority: 'high',
    elapsed: '8m',
  },
  {
    id: '2',
    type: 'ESCALATION',
    isAgent: false,
    description: 'Pago duplicado detectado en una unidad, requiere revisión humana',
    assignedTo: 'Operación',
    assignedType: 'human',
    priority: 'critical',
    elapsed: '2h',
  },
  {
    id: '3',
    type: 'APPROVAL',
    isAgent: true,
    description: 'Renovación sugerida por agente para contrato próximo a vencer',
    assignedTo: 'Alicia',
    assignedType: 'agent',
    priority: 'medium',
    elapsed: '22m',
  },
]

const ACTIVITY_ENTRIES: ActivityEntry[] = [
  {
    id: 'a1',
    time: '2m ago',
    agent: 'Carmen',
    role: 'Cobranza',
    action: 'Preparó borradores de recordatorios para pagos vencidos',
    status: 'pending_approval',
    reasoning:
      'Detectó pagos atrasados y preparó seguimiento automático. Pendiente de aprobación humana antes del envío.',
    expanded: true,
  },
  {
    id: 'a2',
    time: '6m ago',
    agent: 'Alicia',
    role: 'Operación',
    action: 'Calculó propuesta de renovación para contratos por vencer',
    status: 'executing',
  },
  {
    id: 'a3',
    time: '11m ago',
    agent: 'Hugo',
    role: 'Coordinación',
    action: 'Consolidó resumen ejecutivo de operación',
    status: 'completed',
  },
]

const COLLECTIONS_FALLBACK: CollectionRow[] = [
  { unit: '—', tenant: 'Sin datos conectados', amount: 0, status: 'pending', daysOverdue: 0 },
]

const MAINT_QUEUE: MaintRow[] = [
  { unit: 'D102', issue: 'Revisión general de mantenimiento', priority: 'medium', assignedTo: 'Operación', sla: '24h' },
  { unit: 'D302', issue: 'Seguimiento a incidencia abierta', priority: 'high', assignedTo: 'Operación', sla: '8h' },
  { unit: 'Áreas comunes', issue: 'Chequeo preventivo', priority: 'low', assignedTo: 'Operación', sla: '48h' },
]

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

function typeBadge(type: AttentionType) {
  const MAP: Record<AttentionType, { bg: string; color: string; border: string; label: string }> = {
    APPROVAL: { bg: 'rgba(245, 158, 11, 0.15)', color: '#FBBF24', border: 'rgba(245, 158, 11, 0.3)', label: 'Aprobación' },
    ESCALATION: { bg: 'rgba(249, 115, 22, 0.15)', color: '#FB923C', border: 'rgba(249, 115, 22, 0.3)', label: 'Escalado' },
    DECISION: { bg: 'rgba(59, 130, 246, 0.15)', color: '#60A5FA', border: 'rgba(59, 130, 246, 0.3)', label: 'Decisión' },
    BLOCKED: { bg: 'rgba(239, 68, 68, 0.15)', color: '#F87171', border: 'rgba(239, 68, 68, 0.3)', label: 'Bloqueado' },
  }
  const s = MAP[type]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {s.label}
    </span>
  )
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const now = new Date()

        const [unitsRes, contractsRes, paymentsRes] = await Promise.all([
          supabase.from('units').select('*').order('floor').order('number'),
          supabase
            .from('contracts')
            .select('id, unit_id, monthly_amount, end_date, status, unit:units(number), occupant:occupants(name)')
            .in('status', ['active', 'en_renovacion']),
          supabase
            .from('payments')
            .select('amount, due_date, status, contract:contracts(unit:units(number), occupant:occupants(name))')
            .in('status', ['pending', 'late'])
            .order('due_date', { ascending: true }),
        ])

        const units = unitsRes.data || []
        const contracts = contractsRes.data || []
        const payments = paymentsRes.data || []

        const totalUnits = units.length
        const occupiedUnits = units.filter((u: { status: string }) => u.status === 'occupied').length
        const availableUnits = units.filter((u: { status: string }) => u.status === 'available').length
        const monthlyRevenue = contracts.reduce((sum: number, c: { monthly_amount: number | null }) => sum + Number(c.monthly_amount || 0), 0)
        const overdue = payments.filter((p: { status: string }) => p.status === 'late')
        const overdueAmount = overdue.reduce((sum: number, p: { amount: number | null }) => sum + Number(p.amount || 0), 0)
        const expiringCount = contracts.filter((c: { end_date: string | null }) => c.end_date && daysUntil(c.end_date) <= 60).length

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
            unit: p.contract?.[0]?.unit?.[0]?.number || p.contract?.unit?.number || '—',
            tenant: p.contract?.[0]?.occupant?.[0]?.name || p.contract?.occupant?.name || 'Sin ocupante',
            amount: Number(p.amount || 0),
            status: p.status === 'late' ? 'late' : 'pending',
            daysOverdue: Math.max(0, Math.floor((now.getTime() - new Date(p.due_date).getTime()) / (1000 * 60 * 60 * 24))),
          }))
        )
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [])

  const occupancyPct = metrics.totalUnits > 0 ? ((metrics.occupiedUnits / metrics.totalUnits) * 100).toFixed(1) : '0.0'

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: 'var(--baw-text)' }}>
            Mission Control
          </h1>
          <p className="text-[13px] muted-text mt-0.5">
            ALM809P · Operación en vivo
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="inline-flex items-center gap-1.5 muted-text">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-soft" />
            Vista híbrida humano-agente
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard label="Ocupación" value={`${occupancyPct}%`} delta={0} deltaLabel="">
          <span className="text-[11px] muted-text tabular-nums">{metrics.occupiedUnits} de {metrics.totalUnits} unidades</span>
        </KPICard>
        <KPICard label="Ingreso mensual" value={formatCurrency(metrics.monthlyRevenue)} delta={0}>
          <span className="text-[11px] muted-text tabular-nums">Contratos activos y en renovación</span>
        </KPICard>
        <KPICard label="Morosidad" value={formatCurrency(metrics.overdueAmount)} warning={metrics.overdueCount > 0}>
          <span className="text-[11px] muted-text tabular-nums">{metrics.overdueCount} pagos vencidos</span>
        </KPICard>
        <KPICard label="Contratos activos" value={metrics.occupiedUnits}>
          <span className="text-[11px] muted-text tabular-nums">{metrics.expiringCount} por vencer en 60 días</span>
        </KPICard>
        <KPICard label="Disponibles" value={metrics.availableUnits}>
          <span className="text-[11px] muted-text tabular-nums">Inventario listo para ocupación</span>
        </KPICard>
        <KPICard label="Actividad agente" value={loading ? '…' : ACTIVITY_ENTRIES.length} accent="agent">
          <span className="text-[11px] muted-text tabular-nums">Capa visual agent-native en preview</span>
        </KPICard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section
          className="rounded-lg overflow-hidden"
          style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
        >
          <header className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--baw-border)' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold" style={{ color: 'var(--baw-text)' }}>
                Requiere atención
              </h2>
              <span
                className="text-[11px] px-1.5 py-0.5 rounded tabular-nums font-medium"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#F87171' }}
              >
                {ATTENTION_ITEMS.length}
              </span>
            </div>
            <Link href="/agents" className="text-[12px]" style={{ color: 'var(--baw-primary)' }}>
              Ver todo →
            </Link>
          </header>
          <ul className="divide-y" style={{ borderColor: 'var(--baw-border)' }}>
            {ATTENTION_ITEMS.map((item) => (
              <li
                key={item.id}
                className={`px-4 py-3 flex items-start gap-3 ${item.isAgent ? 'agent-border' : 'human-border'}`}
                style={{ borderBottomColor: 'var(--baw-border)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {typeBadge(item.type)}
                    {item.isAgent && <AgentBadge />}
                    <span className="text-[11px] muted-text ml-auto tabular-nums">{item.elapsed}</span>
                  </div>
                  <p className="text-[13px] leading-snug" style={{ color: 'var(--baw-text)' }}>
                    {item.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <ActorAvatar type={item.assignedType} name={item.assignedTo} size={18} />
                    <span className="text-[11px] muted-text">{item.assignedTo}</span>
                    <span className="muted-text">·</span>
                    <PriorityBadge priority={item.priority} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="rounded-lg overflow-hidden"
          style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
        >
          <header className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--baw-border)' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold" style={{ color: 'var(--baw-text)' }}>
                Actividad de agentes
              </h2>
              <span className="text-[11px] muted-text tabular-nums">{ACTIVITY_ENTRIES.length}</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: '#4ADE80' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-soft" />
              Preview conceptual
            </span>
          </header>
          <ul className="divide-y" style={{ borderColor: 'var(--baw-border)' }}>
            {ACTIVITY_ENTRIES.map((e) => (
              <li key={e.id} className="px-4 py-3 flex items-start gap-3 agent-border" style={{ borderBottomColor: 'var(--baw-border)' }}>
                <ActorAvatar type="agent" name={e.agent} size={26} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium" style={{ color: 'var(--baw-text)' }}>
                      {e.agent}
                    </span>
                    <span className="text-[11px] muted-text">{e.role}</span>
                    <span className="text-[11px] muted-text ml-auto tabular-nums">{e.time}</span>
                  </div>
                  <p className="text-[12.5px] mt-0.5 leading-snug" style={{ color: 'var(--baw-text)' }}>
                    {e.action}
                  </p>
                  <div className="mt-1.5">
                    <StatusBadge status={e.status} />
                  </div>
                  {e.expanded && e.reasoning && (
                    <p
                      className="mt-2 text-[12px] leading-relaxed p-2 rounded"
                      style={{
                        color: 'var(--baw-text)',
                        backgroundColor: 'rgba(139, 92, 246, 0.06)',
                        border: '1px solid rgba(139, 92, 246, 0.18)',
                      }}
                    >
                      <span style={{ color: '#A78BFA' }}>Reasoning: </span>
                      {e.reasoning}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section
          className="rounded-lg overflow-hidden"
          style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
        >
          <header className="px-4 py-3" style={{ borderBottom: '1px solid var(--baw-border)' }}>
            <h2 className="text-[13px] font-semibold" style={{ color: 'var(--baw-text)' }}>
              Cobros pendientes
            </h2>
          </header>
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
              {(collections.length > 0 ? collections : COLLECTIONS_FALLBACK).map((r) => (
                <tr key={`${r.unit}-${r.tenant}`} className="table-row">
                  <td className="px-4 py-2 font-medium tabular-nums" style={{ color: 'var(--baw-text)' }}>
                    {r.unit}
                  </td>
                  <td className="px-4 py-2 muted-text">{r.tenant}</td>
                  <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--baw-text)' }}>
                    {fmtMoney(r.amount)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums muted-text">{r.daysOverdue}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section
          className="rounded-lg overflow-hidden"
          style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
        >
          <header className="px-4 py-3" style={{ borderBottom: '1px solid var(--baw-border)' }}>
            <h2 className="text-[13px] font-semibold" style={{ color: 'var(--baw-text)' }}>
              Cola de mantenimiento
            </h2>
          </header>
          <table className="w-full text-[13px]">
            <thead className="table-header">
              <tr>
                <th className="text-left px-4 py-2">Unidad</th>
                <th className="text-left px-4 py-2">Incidencia</th>
                <th className="text-left px-4 py-2">Prioridad</th>
                <th className="text-left px-4 py-2">Asignado</th>
                <th className="text-right px-4 py-2">SLA</th>
              </tr>
            </thead>
            <tbody>
              {MAINT_QUEUE.map((r) => (
                <tr key={r.unit + r.issue} className="table-row">
                  <td className="px-4 py-2 font-medium tabular-nums" style={{ color: 'var(--baw-text)' }}>
                    {r.unit}
                  </td>
                  <td className="px-4 py-2 muted-text">{r.issue}</td>
                  <td className="px-4 py-2">
                    <PriorityBadge priority={r.priority} />
                  </td>
                  <td className="px-4 py-2 muted-text">{r.assignedTo}</td>
                  <td className="px-4 py-2 text-right tabular-nums muted-text">{r.sla}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
