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
  L1: 'L1 Solo sugiere',
  L2: 'L2 Propone',
  L3: 'L3 Supervisado',
  L4: 'L4 Autónomo',
}

const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  active: 'Activo',
  idle: 'En espera',
  paused: 'Pausado',
}

const ROSTER: AgentRoster[] = [
  { id: 'hugo', name: 'Hugo', role: 'Coordinación', status: 'active', tasks: 4, level: 'L3', accent: '#818CF8' },
  { id: 'alicia', name: 'Alicia', role: 'Operación BaW', status: 'active', tasks: 6, level: 'L3', accent: '#60A5FA' },
  { id: 'andres', name: 'Andrés', role: 'Producto técnico', status: 'active', tasks: 3, level: 'L2', accent: '#4ADE80' },
  { id: 'beto', name: 'Beto', role: 'Cobranza / CFDI', status: 'idle', tasks: 2, level: 'L2', accent: '#FBBF24' },
  { id: 'maribel', name: 'Maribel', role: 'Legal', status: 'idle', tasks: 1, level: 'L1', accent: '#F472B6' },
  { id: 'luis', name: 'Luis', role: 'Growth / CRM', status: 'paused', tasks: 0, level: 'L1', accent: '#2DD4BF' },
]

const GOALS: GoalRow[] = [
  {
    id: 'g1',
    agent: 'Alicia',
    goal: 'Resolver morosidad crítica D402 + D302',
    step: 'Preparando plan de seguimiento operativo',
    status: 'pending_approval',
    confidence: 88,
    started: '8 min',
    actions: ['Aprobar', 'Pausar'],
  },
  {
    id: 'g2',
    agent: 'Hugo',
    goal: 'Cerrar definición staging + multi-edificio',
    step: 'Validando bloqueadores de arquitectura',
    status: 'executing',
    confidence: 82,
    started: '22 min',
    actions: ['Pausar', 'Ver'],
  },
  {
    id: 'g3',
    agent: 'Andrés',
    goal: 'Eliminar deuda de UI ficticia del overhaul agent-native',
    step: 'Sustituyendo datos demo por contexto BaW real',
    status: 'executing',
    confidence: 91,
    started: '1 h',
    actions: ['Ver'],
  },
  {
    id: 'g4',
    agent: 'Beto',
    goal: 'Revisar facturación CFDI en modo prueba',
    step: 'Confirmando requisitos de FacturAPI',
    status: 'completed',
    confidence: 76,
    started: '11 min',
    actions: ['Ver'],
  },
  {
    id: 'g5',
    agent: 'Alicia',
    goal: 'Validar portal de huésped D101',
    step: 'Checklist STR marcado como estable',
    status: 'completed',
    confidence: 93,
    started: '8 min',
    actions: ['Ver'],
  },
  {
    id: 'g6',
    agent: 'Maribel',
    goal: 'Revisar flujo de firmas Mifiel',
    step: 'Bloqueado — faltan documentos finales',
    status: 'blocked',
    confidence: 45,
    started: '1 h',
    actions: ['Escalar', 'Ver'],
  },
  {
    id: 'g7',
    agent: 'Alicia',
    goal: 'Depurar unidad de prueba Naran 138',
    step: 'Esperando staging para no tocar prod a ciegas',
    status: 'suggested_by_agent',
    confidence: 72,
    started: '1 h',
    actions: ['Aprobar', 'Descartar'],
  },
  {
    id: 'g8',
    agent: 'Luis',
    goal: 'Sincronizar mensajes comerciales para PMS propietario',
    step: 'Falló — faltan assets aprobados',
    status: 'failed',
    confidence: 31,
    started: '18 min',
    actions: ['Reintentar', 'Ver'],
  },
]

const APPROVALS: Approval[] = [
  {
    id: 'ap1',
    agent: 'Alicia',
    role: 'Operación',
    what: 'Preparar seguimiento de cobranza para D402 y D302 antes de automatizar WhatsApp',
    why:
      'La morosidad crítica conocida suma $112K MXN. Antes de enviar mensajes automáticos conviene validar monto, tono y siguiente acción con operación.',
    confidence: 88,
    waiting: '8 min',
    evidence: [
      'D402 · Arturo · atraso crítico reportado: $80K MXN',
      'D302 · Humberto · atraso reportado: $32K MXN',
      'Motor de morosidad existe, pero WhatsApp autónomo sigue pendiente de token y política de aprobación',
      'Recomendación: humano aprueba primer lote; agente solo prepara borradores',
    ],
  },
  {
    id: 'ap2',
    agent: 'Hugo',
    role: 'Coordinación',
    what: 'Priorizar staging y multi-edificio sobre más features nuevas',
    why:
      'QA en producción ya contaminó datos y la arquitectura actual mezcla edificios. Agregar más módulos encima de eso aumenta deuda técnica.',
    confidence: 91,
    waiting: '22 min',
    evidence: [
      'Hallazgo Fran: staging urgente',
      'Hallazgo técnico: units cuelgan directo de org_id; falta buildings',
      'Vista Unidades no filtra por edificio',
      'Dashboard sigue comunicando ALM809P como contexto único',
    ],
  },
  {
    id: 'ap3',
    agent: 'Andrés',
    role: 'Producto técnico',
    what: 'Mantener el Agent Control Center como prototipo explícito hasta conectarlo a datos reales',
    why:
      'La pantalla era visualmente buena pero mezclaba datos ficticios de otro mercado. Eso da falsa confianza durante demo.',
    confidence: 96,
    waiting: '12 min',
    evidence: [
      'Se removieron referencias ficticias de mercado, unidades y edificios inexistentes',
      'Las acciones quedan etiquetadas como simulación operativa',
      'Siguiente paso: conectar aprobaciones a tasks/webhook_events reales',
    ],
  },
  {
    id: 'ap4',
    agent: 'Maribel',
    role: 'Legal',
    what: 'No activar firmas Mifiel automáticas sin plantilla contractual final',
    why:
      'La integración técnica existe, pero el documento legal debe quedar validado antes de enviar contratos reales.',
    confidence: 82,
    waiting: '1 h',
    evidence: [
      'Mifiel está en roadmap/integración técnica',
      'Contratos requieren versión legal final por tipo A/B/C/D/E',
      'Recomendación: pruebas sandbox solamente hasta aprobación legal',
    ],
  },
]

const DOMAINS = ['Cobranza', 'Mantenimiento', 'Comunicaciones', 'Cambios de datos'] as const
type Domain = (typeof DOMAINS)[number]

export default function AgentControlCenter() {
  const [levels, setLevels] = useState<Record<string, AutonomyLevel>>(
    Object.fromEntries(ROSTER.map((a) => [a.id, a.level])) as Record<string, AutonomyLevel>,
  )
  const [toggles, setToggles] = useState<Record<string, Record<Domain, boolean>>>(
    Object.fromEntries(
      ROSTER.map((a) => [a.id, { Cobranza: true, Mantenimiento: true, Comunicaciones: true, 'Cambios de datos': false }]),
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
          Centro de Agentes
        </h1>
        <p className="text-[13px] muted-text mt-0.5">Prototipo operativo: monitorea aprobaciones humano-agente sin ejecutar acciones reales todavía.</p>
      </div>

      <div
        className="rounded-lg px-4 py-3 text-[13px]"
        style={{
          backgroundColor: 'rgba(245, 158, 11, 0.10)',
          color: '#FBBF24',
          border: '1px solid rgba(245, 158, 11, 0.28)',
        }}
      >
        Modo diseño: esta vista ya usa contexto real de BaW/ALM809P, pero las aprobaciones aún no están conectadas a `tasks`, `webhook_events` ni WhatsApp.
      </div>

      {/* AGENT ROSTER */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide muted-text">Equipo operativo</h2>
          <span className="text-[11px] muted-text tabular-nums">{ROSTER.filter((r) => r.status === 'active').length} activos</span>
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
                    {AGENT_STATUS_LABELS[a.status]}
                  </span>
                  <span className="text-[11px] muted-text tabular-nums">{a.tasks} tareas</span>
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
            Objetivos activos
          </h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="table-header">
              <tr>
                <th className="text-left px-4 py-2">Agente</th>
                <th className="text-left px-4 py-2">Objetivo</th>
                <th className="text-left px-4 py-2">Paso actual</th>
                <th className="text-left px-4 py-2">Estado</th>
                <th className="text-left px-4 py-2">Confianza</th>
                <th className="text-left px-4 py-2">Inicio</th>
                <th className="text-right px-4 py-2">Acciones</th>
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
                            action === 'Aprobar'
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
            Cola de aprobación
          </h2>
          <span
            className="text-[11px] px-1.5 py-0.5 rounded tabular-nums font-medium"
            style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#FBBF24' }}
          >
            {APPROVALS.length} pendientes
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
                  <span className="text-[11px] muted-text tabular-nums">esperando {a.waiting}</span>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide muted-text font-medium mb-1">Qué</p>
                  <p className="text-[13px]" style={{ color: 'var(--baw-text)' }}>
                    {a.what}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide muted-text font-medium mb-1">Por qué</p>
                  <p className="text-[13px] leading-snug" style={{ color: 'var(--baw-text)' }}>
                    {a.why}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide muted-text font-medium">Confianza</span>
                  <ConfidenceBar value={a.confidence} />
                </div>
                <button
                  onClick={() => toggleEvidence(a.id)}
                  className="inline-flex items-center gap-1 text-[12px] self-start"
                  style={{ color: 'var(--baw-primary)' }}
                >
                  {isOpen ? (
                    <>
                      Ocultar evidencia <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      Ver evidencia <ChevronDown className="w-3 h-3" />
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
                    Aprobar
                  </button>
                  <button
                    className="flex-1 px-3 py-1.5 rounded text-[12px] font-semibold transition-colors"
                    style={{
                      backgroundColor: 'transparent',
                      color: '#F87171',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                    }}
                  >
                    Rechazar
                  </button>
                  <button
                    className="px-3 py-1.5 rounded text-[12px] font-medium transition-colors"
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--baw-muted)',
                      border: '1px solid var(--baw-border)',
                    }}
                  >
                    Delegar
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
            Controles de autonomía
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
          <p className="text-[11px] uppercase tracking-wide muted-text font-medium mb-2">Nivel de autonomía</p>
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
          <p className="text-[11px] uppercase tracking-wide muted-text font-medium mb-2">Permisos por dominio</p>
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
