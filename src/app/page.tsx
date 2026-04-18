'use client'

import Link from 'next/link'
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

const ATTENTION_ITEMS: AttentionItem[] = [
  {
    id: '1',
    type: 'APPROVAL',
    isAgent: true,
    description: 'Carmen wants to send rent reminders to 4 delinquent units',
    assignedTo: 'Carmen',
    assignedType: 'agent',
    priority: 'high',
    elapsed: '8m',
  },
  {
    id: '2',
    type: 'ESCALATION',
    isAgent: false,
    description: 'Duplicate payment on Unit 1807 — $42,000 MXN',
    assignedTo: 'María Reyes',
    assignedType: 'human',
    priority: 'critical',
    elapsed: '2h',
  },
  {
    id: '3',
    type: 'APPROVAL',
    isAgent: true,
    description: 'Alicia proposes +4.2% renewal for Unit 1204',
    assignedTo: 'Alicia',
    assignedType: 'agent',
    priority: 'medium',
    elapsed: '22m',
  },
  {
    id: '4',
    type: 'DECISION',
    isAgent: false,
    description: 'Draft eviction notice requires PM approval — Unit 1102',
    assignedTo: 'María Reyes',
    assignedType: 'human',
    priority: 'critical',
    elapsed: '18m',
  },
  {
    id: '5',
    type: 'BLOCKED',
    isAgent: true,
    description: 'Felix blocked on insurance cert upload — vendor 403',
    assignedTo: 'Felix',
    assignedType: 'agent',
    priority: 'medium',
    elapsed: '1h',
  },
  {
    id: '6',
    type: 'APPROVAL',
    isAgent: true,
    description: 'Diego requests HVAC contractor dispatch for Unit 905',
    assignedTo: 'Diego',
    assignedType: 'agent',
    priority: 'high',
    elapsed: '12m',
  },
  {
    id: '7',
    type: 'ESCALATION',
    isAgent: true,
    description: 'Elena escalated guest complaint — noise at Unit 1502',
    assignedTo: 'Elena',
    assignedType: 'agent',
    priority: 'medium',
    elapsed: '34m',
  },
  {
    id: '8',
    type: 'DECISION',
    isAgent: false,
    description: 'Budget variance approval — Q4 capex overrun 6.1%',
    assignedTo: 'Javier Solís',
    assignedType: 'human',
    priority: 'high',
    elapsed: '3h',
  },
  {
    id: '9',
    type: 'APPROVAL',
    isAgent: true,
    description: 'Carmen drafted late-fee waiver for Unit 304 tenant',
    assignedTo: 'Carmen',
    assignedType: 'agent',
    priority: 'low',
    elapsed: '45m',
  },
]

const ACTIVITY_ENTRIES: ActivityEntry[] = [
  {
    id: 'a1',
    time: '2m ago',
    agent: 'Carmen',
    role: 'Collections',
    action: 'Drafted 4 rent reminders for Nov arrears',
    status: 'pending_approval',
    reasoning:
      'Identified 4 tenants >7 days past due totaling $186K MXN. Drafted personalized reminders in Spanish referencing prior payment patterns. Awaiting PM approval before sending via WhatsApp.',
    expanded: true,
  },
  {
    id: 'a2',
    time: '6m ago',
    agent: 'Alicia',
    role: 'Operations',
    action: 'Computed renewal rate for Unit 1204 (+4.2%)',
    status: 'executing',
  },
  {
    id: 'a3',
    time: '11m ago',
    agent: 'Hugo',
    role: 'Chief of Staff',
    action: 'Compiled weekly executive briefing',
    status: 'completed',
  },
  {
    id: 'a4',
    time: '14m ago',
    agent: 'Elena',
    role: 'Guest Experience',
    action: 'Sent check-in instructions to Unit 702',
    status: 'completed',
  },
  {
    id: 'a5',
    time: '18m ago',
    agent: 'Diego',
    role: 'Maintenance',
    action: 'Pool chemistry auto-adjust failed — sensor anomaly',
    status: 'failed',
  },
  {
    id: 'a6',
    time: '22m ago',
    agent: 'Alicia',
    role: 'Operations',
    action: 'Prepared renewal package for Unit 1204',
    status: 'executing',
  },
  {
    id: 'a7',
    time: '34m ago',
    agent: 'Elena',
    role: 'Guest Experience',
    action: 'Escalated guest complaint — noise at Unit 1502',
    status: 'escalated',
  },
  {
    id: 'a8',
    time: '41m ago',
    agent: 'Felix',
    role: 'Compliance',
    action: 'Blocked on vendor insurance cert — upload 403',
    status: 'blocked',
  },
  {
    id: 'a9',
    time: '58m ago',
    agent: 'Carmen',
    role: 'Collections',
    action: 'Negotiated late-fee waiver draft for Unit 304',
    status: 'suggested_by_agent',
  },
  {
    id: 'a10',
    time: '1h ago',
    agent: 'Diego',
    role: 'Maintenance',
    action: 'Requested vendor quotes for HVAC inspection',
    status: 'pending_approval',
  },
  {
    id: 'a11',
    time: '1h ago',
    agent: 'Hugo',
    role: 'Chief of Staff',
    action: 'Reconciled ledger entries for November',
    status: 'completed',
  },
  {
    id: 'a12',
    time: '2h ago',
    agent: 'Alicia',
    role: 'Operations',
    action: 'Auto-generated rent roll snapshot',
    status: 'completed',
  },
]

const COLLECTIONS: CollectionRow[] = [
  { unit: '1102', tenant: 'Rodrigo Pérez', amount: 52400, status: 'late', daysOverdue: 18 },
  { unit: '304', tenant: 'Laura Medina', amount: 38200, status: 'late', daysOverdue: 11 },
  { unit: '807', tenant: 'Carlos Villanueva', amount: 46800, status: 'late', daysOverdue: 9 },
  { unit: '1408', tenant: 'Ana Ortega', amount: 48600, status: 'late', daysOverdue: 7 },
  { unit: '602', tenant: 'Felipe Guzmán', amount: 41200, status: 'pending', daysOverdue: 2 },
]

const MAINT_QUEUE: MaintRow[] = [
  { unit: '905', issue: 'HVAC failure — bedroom unit', priority: 'critical', assignedTo: 'Diego', sla: '4h' },
  { unit: '1502', issue: 'Water leak — bathroom', priority: 'high', assignedTo: 'Diego', sla: '8h' },
  { unit: '702', issue: 'Appliance: oven replacement', priority: 'medium', assignedTo: 'Vendor TBD', sla: '2d' },
  { unit: '1204', issue: 'Paint touch-up pre-renewal', priority: 'low', assignedTo: 'Alicia', sla: '5d' },
  { unit: 'Common', issue: 'Pool chemistry sensor replace', priority: 'high', assignedTo: 'Diego', sla: '24h' },
]

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

function typeBadge(type: AttentionType) {
  const MAP: Record<AttentionType, { bg: string; color: string; border: string }> = {
    APPROVAL: { bg: 'rgba(245, 158, 11, 0.15)', color: '#FBBF24', border: 'rgba(245, 158, 11, 0.3)' },
    ESCALATION: { bg: 'rgba(249, 115, 22, 0.15)', color: '#FB923C', border: 'rgba(249, 115, 22, 0.3)' },
    DECISION: { bg: 'rgba(59, 130, 246, 0.15)', color: '#60A5FA', border: 'rgba(59, 130, 246, 0.3)' },
    BLOCKED: { bg: 'rgba(239, 68, 68, 0.15)', color: '#F87171', border: 'rgba(239, 68, 68, 0.3)' },
  }
  const s = MAP[type]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {type}
    </span>
  )
}

export default function MissionControl() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: 'var(--baw-text)' }}>
            Mission Control
          </h1>
          <p className="text-[13px] muted-text mt-0.5">
            Torre Ópalo · Polanco, CDMX · Live
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="inline-flex items-center gap-1.5 muted-text">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-soft" />
            6 agents live
          </span>
        </div>
      </div>

      {/* TOP ROW — KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard label="Occupancy" value="94.2%" delta={0.4} deltaLabel="">
          <span className="text-[11px] muted-text tabular-nums">113 of 120 units</span>
        </KPICard>
        <KPICard label="Monthly Revenue" value="$2.40M" delta={8.3}>
          <span className="text-[11px] muted-text tabular-nums">MXN · November</span>
        </KPICard>
        <KPICard label="Arrears" value="$186K" delta={-15.2} warning>
          <span className="text-[11px] muted-text tabular-nums">MXN · 4 units critical</span>
        </KPICard>
        <KPICard label="Active Contracts" value="113">
          <span className="text-[11px] muted-text tabular-nums">3 expiring this week</span>
        </KPICard>
        <KPICard label="Open Incidents" value="7">
          <span className="text-[11px] muted-text tabular-nums">2 critical</span>
        </KPICard>
        <KPICard label="Agent Actions Today" value="47" accent="agent">
          <span className="text-[11px] muted-text tabular-nums">3 pending approval</span>
        </KPICard>
      </div>

      {/* MIDDLE ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Requires Attention */}
        <section
          className="rounded-lg overflow-hidden"
          style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
        >
          <header className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--baw-border)' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold" style={{ color: 'var(--baw-text)' }}>
                Requires Attention
              </h2>
              <span
                className="text-[11px] px-1.5 py-0.5 rounded tabular-nums font-medium"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#F87171' }}
              >
                {ATTENTION_ITEMS.length}
              </span>
            </div>
            <Link href="/agents" className="text-[12px]" style={{ color: 'var(--baw-primary)' }}>
              View all →
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

        {/* Agent Activity */}
        <section
          className="rounded-lg overflow-hidden"
          style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
        >
          <header className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--baw-border)' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold" style={{ color: 'var(--baw-text)' }}>
                Agent Activity
              </h2>
              <span className="text-[11px] muted-text tabular-nums">{ACTIVITY_ENTRIES.length}</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: '#4ADE80' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-soft" />
              6 agents live
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
                        color: 'var(--baw-muted)',
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

      {/* BOTTOM ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Collections Due */}
        <section
          className="rounded-lg overflow-hidden"
          style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
        >
          <header className="px-4 py-3" style={{ borderBottom: '1px solid var(--baw-border)' }}>
            <h2 className="text-[13px] font-semibold" style={{ color: 'var(--baw-text)' }}>
              Collections Due
            </h2>
          </header>
          <table className="w-full text-[13px]">
            <thead className="table-header">
              <tr>
                <th className="text-left px-4 py-2">Unit</th>
                <th className="text-left px-4 py-2">Tenant</th>
                <th className="text-right px-4 py-2">Amount</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {COLLECTIONS.map((r) => (
                <tr key={r.unit} className="table-row">
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

        {/* Maintenance Queue */}
        <section
          className="rounded-lg overflow-hidden"
          style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
        >
          <header className="px-4 py-3" style={{ borderBottom: '1px solid var(--baw-border)' }}>
            <h2 className="text-[13px] font-semibold" style={{ color: 'var(--baw-text)' }}>
              Maintenance Queue
            </h2>
          </header>
          <table className="w-full text-[13px]">
            <thead className="table-header">
              <tr>
                <th className="text-left px-4 py-2">Unit</th>
                <th className="text-left px-4 py-2">Issue</th>
                <th className="text-left px-4 py-2">Priority</th>
                <th className="text-left px-4 py-2">Assigned</th>
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
