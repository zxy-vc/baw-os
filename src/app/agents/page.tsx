'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  StatusBadge,
  ConfidenceBar,
  ActorAvatar,
  type StatusKind,
} from '@/components/ui/status'

type AutonomyLevel = 'L1' | 'L2' | 'L3' | 'L4'
type AgentStatus = 'active' | 'idle' | 'paused'

interface AgentRoster {
  id: string
  name: string
  role: string
  status: AgentStatus
  tasks: number
  level: AutonomyLevel
  accent: string
}

interface GoalRow {
  id: string
  agent: string
  goal: string
  step: string
  status: StatusKind
  confidence: number
  started: string
  actions: string[]
}

interface Approval {
  id: string
  agent: string
  role: string
  what: string
  why: string
  confidence: number
  waiting: string
  evidence: string[]
}

const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  L1: 'L1 Suggest Only',
  L2: 'L2 Propose',
  L3: 'L3 Supervised',
  L4: 'L4 Autonomous',
}

const ROSTER: AgentRoster[] = [
  { id: 'hugo', name: 'Hugo', role: 'Chief of Staff', status: 'active', tasks: 12, level: 'L4', accent: '#818CF8' },
  { id: 'alicia', name: 'Alicia', role: 'Operations', status: 'active', tasks: 8, level: 'L3', accent: '#60A5FA' },
  { id: 'carmen', name: 'Carmen', role: 'Collections', status: 'active', tasks: 15, level: 'L3', accent: '#FBBF24' },
  { id: 'diego', name: 'Diego', role: 'Maintenance', status: 'active', tasks: 6, level: 'L2', accent: '#4ADE80' },
  { id: 'elena', name: 'Elena', role: 'Guest Experience', status: 'idle', tasks: 2, level: 'L3', accent: '#F472B6' },
  { id: 'felix', name: 'Felix', role: 'Compliance', status: 'active', tasks: 4, level: 'L2', accent: '#2DD4BF' },
]

const GOALS: GoalRow[] = [
  {
    id: 'g1',
    agent: 'Carmen',
    goal: 'Collect Nov arrears for 4 units',
    step: 'Drafting reminder messages',
    status: 'pending_approval',
    confidence: 94,
    started: '8m ago',
    actions: ['Approve', 'Pause'],
  },
  {
    id: 'g2',
    agent: 'Alicia',
    goal: 'Prepare renewal package Unit 1204',
    step: 'Computing market rate comparison',
    status: 'executing',
    confidence: 87,
    started: '22m ago',
    actions: ['Pause', 'View'],
  },
  {
    id: 'g3',
    agent: 'Diego',
    goal: 'Schedule HVAC inspection building-wide',
    step: 'Requesting vendor quotes',
    status: 'pending_approval',
    confidence: 78,
    started: '1h ago',
    actions: ['Approve', 'View'],
  },
  {
    id: 'g4',
    agent: 'Hugo',
    goal: 'Compile weekly executive briefing',
    step: 'Aggregating KPI data',
    status: 'completed',
    confidence: 99,
    started: '11m ago',
    actions: ['View'],
  },
  {
    id: 'g5',
    agent: 'Elena',
    goal: 'Send check-in instructions to guests',
    step: 'Auto-sent to Unit 702',
    status: 'completed',
    confidence: 96,
    started: '8m ago',
    actions: ['View'],
  },
  {
    id: 'g6',
    agent: 'Felix',
    goal: 'Verify vendor insurance certificates',
    step: 'Blocked — vendor 403 not responding',
    status: 'blocked',
    confidence: 45,
    started: '1h ago',
    actions: ['Override', 'View'],
  },
  {
    id: 'g7',
    agent: 'Carmen',
    goal: 'Negotiate late-fee waiver Unit 304',
    step: 'Awaiting tenant response',
    status: 'suggested_by_agent',
    confidence: 72,
    started: '1h ago',
    actions: ['Approve', 'Dismiss'],
  },
  {
    id: 'g8',
    agent: 'Diego',
    goal: 'Pool chemistry auto-adjust',
    step: 'Failed — sensor reading anomaly',
    status: 'failed',
    confidence: 31,
    started: '18m ago',
    actions: ['Retry', 'View'],
  },
]

const APPROVALS: Approval[] = [
  {
    id: 'ap1',
    agent: 'Carmen',
    role: 'Collections',
    what: 'Send personalized rent reminders to 4 delinquent tenants via WhatsApp',
    why:
      'Four tenants are >7 days past due totaling $186K MXN. Reminders are standard policy at day 7 and tenant 304 has historically responded to WhatsApp within 24h.',
    confidence: 94,
    waiting: '8m',
    evidence: [
      'Unit 1102 · Rodrigo Pérez · 18 days overdue · $52,400',
      'Unit 304 · Laura Medina · 11 days overdue · $38,200',
      'Unit 807 · Carlos Villanueva · 9 days overdue · $46,800',
      'Unit 1408 · Ana Ortega · 7 days overdue · $48,600',
    ],
  },
  {
    id: 'ap2',
    agent: 'Alicia',
    role: 'Operations',
    what: 'Propose +4.2% renewal rate for Unit 1204 (current $42,800 → $44,600)',
    why:
      'Comparable 2BR units in Polanco rented at +5.1% YoY over the last 90 days. Tenant has zero late payments and high NPS. A modest +4.2% stays below market while locking in retention.',
    confidence: 87,
    waiting: '22m',
    evidence: [
      '3 comps within 500m at $44,100–$45,900 median',
      'Tenant payment history: 24/24 on-time',
      'Occupancy target: 95% (+4.2% predicted 98% renew likelihood)',
    ],
  },
  {
    id: 'ap3',
    agent: 'Diego',
    role: 'Maintenance',
    what: 'Dispatch HVAC contractor to Unit 905 — bedroom unit failure',
    why:
      'Tenant reported unit failure at 06:42; outdoor temperature forecast 33°C today. SLA window is 4h. Preferred vendor Clima MX has availability at 13:00 ($2,400 MXN flat rate).',
    confidence: 91,
    waiting: '12m',
    evidence: [
      'Tenant report logged 06:42 via WhatsApp',
      'Clima MX 13:00 slot confirmed',
      'Unit 905 under active LTR contract through 2026-08-31',
    ],
  },
  {
    id: 'ap4',
    agent: 'Felix',
    role: 'Compliance',
    what: 'Replace vendor "JardinMX" — expired insurance certificate',
    why:
      'JardinMX insurance certificate expired 2026-04-01 and vendor is non-responsive to requests (2 retries over 72h). Compliance policy requires active cert on-file for all on-premise vendors.',
    confidence: 82,
    waiting: '1h',
    evidence: [
      'Cert expiry: 2026-04-01',
      '2 upload retry attempts · last HTTP 403',
      'Replacement candidates pre-vetted: GreenSpace CDMX, ViveJardin',
    ],
  },
]

const DOMAINS = ['Collections', 'Maintenance', 'Communications', 'Record Updates'] as const
type Domain = (typeof DOMAINS)[number]

export default function AgentControlCenter() {
  const [levels, setLevels] = useState<Record<string, AutonomyLevel>>(
    Object.fromEntries(ROSTER.map((a) => [a.id, a.level])) as Record<string, AutonomyLevel>,
  )
  const [toggles, setToggles] = useState<Record<string, Record<Domain, boolean>>>(
    Object.fromEntries(
      ROSTER.map((a) => [a.id, { Collections: true, Maintenance: true, Communications: true, 'Record Updates': false }]),
    ) as Record<string, Record<Domain, boolean>>,
  )
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['ap1']))
  const [selectedAgent, setSelectedAgent] = useState<string>('carmen')

  function toggleEvidence(id: string) {
    setExpanded((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const selected = ROSTER.find((a) => a.id === selectedAgent)!
  const selectedLevel = levels[selectedAgent]
  const selectedToggles = toggles[selectedAgent]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold" style={{ color: 'var(--baw-text)' }}>
          Agent Control Center
        </h1>
        <p className="text-[13px] muted-text mt-0.5">Monitor, approve, and tune your six operational agents</p>
      </div>

      {/* AGENT ROSTER */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide muted-text">Roster</h2>
          <span className="text-[11px] muted-text tabular-nums">{ROSTER.filter((r) => r.status === 'active').length} active</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ROSTER.map((a) => {
            const isSelected = selectedAgent === a.id
            return (
              <button
                key={a.id}
                onClick={() => setSelectedAgent(a.id)}
                className="min-w-[200px] rounded-lg p-3 flex flex-col gap-2 text-left transition-colors"
                style={{
                  backgroundColor: 'var(--baw-surface)',
                  border: `1px solid ${isSelected ? 'rgba(139, 92, 246, 0.5)' : 'var(--baw-border)'}`,
                }}
              >
                <div className="flex items-start gap-2">
                  <ActorAvatar type="agent" name={a.name} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold" style={{ color: 'var(--baw-text)' }}>
                        {a.name}
                      </span>
                    </div>
                    <span className="text-[11px] muted-text">{a.role}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor:
                        a.status === 'active'
                          ? 'rgba(34, 197, 94, 0.15)'
                          : a.status === 'idle'
                          ? 'rgba(139, 139, 149, 0.15)'
                          : 'rgba(245, 158, 11, 0.15)',
                      color: a.status === 'active' ? '#4ADE80' : a.status === 'idle' ? '#8B8B95' : '#FBBF24',
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: a.status === 'active' ? '#4ADE80' : a.status === 'idle' ? '#8B8B95' : '#FBBF24' }}
                    />
                    {a.status[0].toUpperCase() + a.status.slice(1)}
                  </span>
                  <span className="text-[11px] muted-text tabular-nums">{a.tasks} tasks</span>
                </div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded self-start"
                  style={{
                    backgroundColor: 'rgba(139, 92, 246, 0.12)',
                    color: '#A78BFA',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                  }}
                >
                  {AUTONOMY_LABELS[a.level]}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ACTIVE GOALS */}
      <section
        className="rounded-lg overflow-hidden"
        style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
      >
        <header className="px-4 py-3" style={{ borderBottom: '1px solid var(--baw-border)' }}>
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--baw-text)' }}>
            Active Goals
          </h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="table-header">
              <tr>
                <th className="text-left px-4 py-2">Agent</th>
                <th className="text-left px-4 py-2">Goal</th>
                <th className="text-left px-4 py-2">Current Step</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Confidence</th>
                <th className="text-left px-4 py-2">Started</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {GOALS.map((g) => (
                <tr key={g.id} className="table-row">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <ActorAvatar type="agent" name={g.agent} size={22} />
                      <span style={{ color: 'var(--baw-text)' }}>{g.agent}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2" style={{ color: 'var(--baw-text)' }}>
                    {g.goal}
                  </td>
                  <td className="px-4 py-2 muted-text">{g.step}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={g.status} />
                  </td>
                  <td className="px-4 py-2" style={{ minWidth: 120 }}>
                    <ConfidenceBar value={g.confidence} />
                  </td>
                  <td className="px-4 py-2 muted-text tabular-nums whitespace-nowrap">{g.started}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {g.actions.map((action) => (
                        <button
                          key={action}
                          className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                          style={
                            action === 'Approve'
                              ? {
                                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                  color: '#60A5FA',
                                  border: '1px solid rgba(59, 130, 246, 0.3)',
                                }
                              : {
                                  backgroundColor: 'transparent',
                                  color: 'var(--baw-muted)',
                                  border: '1px solid var(--baw-border)',
                                }
                          }
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* APPROVAL QUEUE */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide muted-text">
            Approval Queue
          </h2>
          <span
            className="text-[11px] px-1.5 py-0.5 rounded tabular-nums font-medium"
            style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#FBBF24' }}
          >
            {APPROVALS.length} pending
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {APPROVALS.map((a) => {
            const isOpen = expanded.has(a.id)
            return (
              <div
                key={a.id}
                className="rounded-lg p-4 flex flex-col gap-3 agent-border"
                style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
              >
                <div className="flex items-center gap-2">
                  <ActorAvatar type="agent" name={a.agent} size={28} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[14px] font-semibold" style={{ color: 'var(--baw-text)' }}>
                      {a.agent}
                    </span>
                    <span className="text-[11px] muted-text ml-2">{a.role}</span>
                  </div>
                  <span className="text-[11px] muted-text tabular-nums">waiting {a.waiting}</span>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide muted-text font-medium mb-1">What</p>
                  <p className="text-[13px]" style={{ color: 'var(--baw-text)' }}>
                    {a.what}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide muted-text font-medium mb-1">Why</p>
                  <p className="text-[13px] leading-snug" style={{ color: 'var(--baw-text)' }}>
                    {a.why}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide muted-text font-medium">Confidence</span>
                  <ConfidenceBar value={a.confidence} />
                </div>
                <button
                  onClick={() => toggleEvidence(a.id)}
                  className="inline-flex items-center gap-1 text-[12px] self-start"
                  style={{ color: 'var(--baw-primary)' }}
                >
                  {isOpen ? (
                    <>
                      Hide evidence <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      Show evidence <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
                {isOpen && (
                  <ul
                    className="text-[12px] rounded p-2 space-y-1 list-disc list-inside"
                    style={{
                      color: 'var(--baw-muted)',
                      backgroundColor: 'rgba(139, 92, 246, 0.06)',
                      border: '1px solid rgba(139, 92, 246, 0.18)',
                    }}
                  >
                    {a.evidence.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <button
                    className="flex-1 px-3 py-1.5 rounded text-[12px] font-semibold transition-colors"
                    style={{ backgroundColor: 'var(--baw-primary)', color: '#FFFFFF' }}
                  >
                    Approve
                  </button>
                  <button
                    className="flex-1 px-3 py-1.5 rounded text-[12px] font-semibold transition-colors"
                    style={{
                      backgroundColor: 'transparent',
                      color: '#F87171',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                    }}
                  >
                    Reject
                  </button>
                  <button
                    className="px-3 py-1.5 rounded text-[12px] font-medium transition-colors"
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--baw-muted)',
                      border: '1px solid var(--baw-border)',
                    }}
                  >
                    Delegate
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* AUTONOMY CONTROLS */}
      <section
        className="rounded-lg p-4"
        style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--baw-text)' }}>
            Autonomy Controls
          </h2>
          <div className="flex items-center gap-2">
            <ActorAvatar type="agent" name={selected.name} size={22} />
            <span className="text-[13px] font-medium" style={{ color: 'var(--baw-text)' }}>
              {selected.name}
            </span>
            <span className="text-[11px] muted-text">{selected.role}</span>
          </div>
        </div>

        {/* Autonomy level */}
        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-wide muted-text font-medium mb-2">Autonomy Level</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(AUTONOMY_LABELS) as AutonomyLevel[]).map((lvl) => {
              const active = selectedLevel === lvl
              return (
                <button
                  key={lvl}
                  onClick={() => setLevels((p) => ({ ...p, [selectedAgent]: lvl }))}
                  className="px-3 py-1.5 rounded text-[12px] font-medium transition-colors"
                  style={{
                    backgroundColor: active ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                    color: active ? '#A78BFA' : 'var(--baw-muted)',
                    border: `1px solid ${active ? 'rgba(139, 92, 246, 0.4)' : 'var(--baw-border)'}`,
                  }}
                >
                  {AUTONOMY_LABELS[lvl]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Per-domain toggles */}
        <div>
          <p className="text-[11px] uppercase tracking-wide muted-text font-medium mb-2">Domain Permissions</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {DOMAINS.map((d) => {
              const on = selectedToggles[d]
              return (
                <button
                  key={d}
                  onClick={() =>
                    setToggles((p) => ({
                      ...p,
                      [selectedAgent]: { ...p[selectedAgent], [d]: !on },
                    }))
                  }
                  className="flex items-center justify-between px-3 py-2 rounded transition-colors"
                  style={{
                    backgroundColor: 'var(--baw-elevated)',
                    border: `1px solid ${on ? 'rgba(139, 92, 246, 0.4)' : 'var(--baw-border)'}`,
                  }}
                >
                  <span className="text-[12px]" style={{ color: 'var(--baw-text)' }}>
                    {d}
                  </span>
                  <span
                    className="inline-flex items-center justify-center w-8 h-4 rounded-full transition-colors"
                    style={{
                      backgroundColor: on ? 'rgba(139, 92, 246, 0.35)' : 'var(--baw-border)',
                    }}
                  >
                    <span
                      className="w-3 h-3 rounded-full transition-transform"
                      style={{
                        backgroundColor: on ? '#A78BFA' : 'var(--baw-muted)',
                        transform: on ? 'translateX(8px)' : 'translateX(-8px)',
                      }}
                    />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
