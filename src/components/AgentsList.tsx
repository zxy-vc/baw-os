'use client'

// BaW OS — AgentsList (Sprint 3 / S4)
// Sección "Agentes" en el sidebar con los 11 agentes del workforce v0.2:
// 1 coordinador (BaW) + 10 especialistas. Status placeholder (idle/running/paused).
// Sin links activos todavía — la página individual de cada agente vendrá en sprints
// posteriores. Hoy solo muestra presencia visual y prepara la jerarquía mental.

import { useState } from 'react'
import { ChevronDown, ChevronRight, Bot, Circle } from 'lucide-react'

type AgentStatus = 'idle' | 'running' | 'paused' | 'planned'

interface Agent {
  key: string
  name: string
  role: 'coordinator' | 'core' | 'experience' | 'intelligence'
  status: AgentStatus
}

const AGENTS: Agent[] = [
  // Coordinador (no se prefija con "Agente")
  { key: 'baw', name: 'BaW', role: 'coordinator', status: 'idle' },
  // Operaciones Core
  { key: 'cobranza', name: 'Agente Cobranza', role: 'core', status: 'planned' },
  { key: 'facturacion', name: 'Agente Facturación', role: 'core', status: 'planned' },
  { key: 'mantenimiento', name: 'Agente Mantenimiento', role: 'core', status: 'planned' },
  // Experiencia
  { key: 'atencion', name: 'Agente Atención', role: 'experience', status: 'planned' },
  { key: 'reservas', name: 'Agente Reservas', role: 'experience', status: 'planned' },
  { key: 'tarifas', name: 'Agente Tarifas', role: 'experience', status: 'planned' },
  { key: 'renovaciones', name: 'Agente Renovaciones', role: 'experience', status: 'planned' },
  // Inteligencia
  { key: 'reportes', name: 'Agente Reportes', role: 'intelligence', status: 'planned' },
  { key: 'auditoria', name: 'Agente Auditoría', role: 'intelligence', status: 'planned' },
  { key: 'fiscal', name: 'Agente Fiscal', role: 'intelligence', status: 'planned' },
]

const ROLE_LABEL: Record<Agent['role'], string> = {
  coordinator: 'Coordinador',
  core: 'Operaciones Core',
  experience: 'Experiencia',
  intelligence: 'Inteligencia',
}

const STATUS_DOT: Record<AgentStatus, { color: string; label: string }> = {
  idle: { color: '#86efac', label: 'Activo' },
  running: { color: '#60a5fa', label: 'Corriendo' },
  paused: { color: '#fbbf24', label: 'Pausado' },
  planned: { color: '#52525b', label: 'Planeado' },
}

interface Props {
  expanded: boolean
}

export default function AgentsList({ expanded }: Props) {
  const [open, setOpen] = useState(false)

  if (!expanded) {
    // Modo colapsado: un solo ícono que indica que hay sección de agentes
    return (
      <button
        type="button"
        title="Agentes"
        className="flex items-center justify-center h-9 w-[40px] mx-2 rounded-md hover:bg-white/5"
        style={{ color: 'var(--baw-muted)' }}
      >
        <Bot className="w-[18px] h-[18px]" />
      </button>
    )
  }

  // Agrupar por rol
  const groups: Array<{ label: string; agents: Agent[] }> = [
    {
      label: ROLE_LABEL.coordinator,
      agents: AGENTS.filter((a) => a.role === 'coordinator'),
    },
    {
      label: ROLE_LABEL.core,
      agents: AGENTS.filter((a) => a.role === 'core'),
    },
    {
      label: ROLE_LABEL.experience,
      agents: AGENTS.filter((a) => a.role === 'experience'),
    },
    {
      label: ROLE_LABEL.intelligence,
      agents: AGENTS.filter((a) => a.role === 'intelligence'),
    },
  ]

  return (
    <div className="mx-2 mb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between h-7 px-3 rounded-md text-[10px] uppercase tracking-wider hover:bg-white/5"
        style={{ color: 'var(--baw-muted)' }}
      >
        <span className="flex items-center gap-1.5">
          <Bot size={11} />
          Agentes ({AGENTS.length})
        </span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>

      {open && (
        <ul className="mt-1 space-y-0.5">
          {groups.map((g) => (
            <li key={g.label} className="mt-1.5">
              <div
                className="px-3 pt-1 pb-0.5 text-[9px] uppercase tracking-wider"
                style={{ color: 'var(--baw-muted)', opacity: 0.7 }}
              >
                {g.label}
              </div>
              <ul>
                {g.agents.map((a) => {
                  const dot = STATUS_DOT[a.status]
                  return (
                    <li key={a.key}>
                      <div
                        className="flex items-center justify-between gap-2 px-3 py-1 rounded-md hover:bg-white/5 cursor-default"
                        title={`${a.name} · ${dot.label}`}
                      >
                        <span
                          className="text-[11.5px] truncate"
                          style={{
                            color:
                              a.status === 'planned'
                                ? 'var(--baw-muted)'
                                : 'var(--baw-text)',
                          }}
                        >
                          {a.name}
                        </span>
                        <Circle
                          size={6}
                          fill={dot.color}
                          stroke={dot.color}
                          aria-label={dot.label}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
