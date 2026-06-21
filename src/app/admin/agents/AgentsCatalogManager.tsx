'use client'

// BaW OS — Editor del catálogo de agentes (Platform Admin L0).
// Edita metadata + controla `is_connectable`. No crea ni borra agentes.

import { useState } from 'react'

export interface CatalogAgent {
  id: string
  display_name: string
  full_name: string
  family: string
  domain: string
  description: string | null
  role_label: string | null
  capability_level: number
  feedback_level: number
  status: string
  is_connectable: boolean
  is_shared_zxy: boolean
  updated_at: string
}

const STATUSES = ['planned', 'beta', 'live', 'paused', 'deprecated'] as const

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  planned: { bg: 'var(--baw-neutral-bg-soft)', fg: 'var(--baw-neutral-fg)' },
  beta: { bg: 'var(--baw-agent-bg-soft)', fg: 'var(--baw-agent-fg)' },
  live: { bg: 'var(--baw-success-bg-soft)', fg: 'var(--baw-success-fg)' },
  paused: { bg: 'var(--baw-warning-bg-soft)', fg: 'var(--baw-warning-fg)' },
  deprecated: { bg: 'var(--baw-danger-bg-soft)', fg: 'var(--baw-danger-fg)' },
}

export default function AgentsCatalogManager({
  initialAgents,
}: {
  initialAgents: CatalogAgent[]
}) {
  const [agents, setAgents] = useState<CatalogAgent[]>(initialAgents)

  const onSaved = (updated: CatalogAgent) => {
    setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
  }

  // Agrupa por familia preservando el orden recibido (ya viene por family, name)
  const families: string[] = []
  for (const a of agents) if (!families.includes(a.family)) families.push(a.family)

  return (
    <div className="space-y-6">
      {families.map((family) => (
        <section key={family}>
          <h3
            className="text-[12px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--baw-muted)', fontFamily: 'var(--font-mono)' }}
          >
            {family}
          </h3>
          <div className="space-y-2">
            {agents
              .filter((a) => a.family === family)
              .map((a) => (
                <AgentRow key={a.id} agent={a} onSaved={onSaved} />
              ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function AgentRow({
  agent,
  onSaved,
}: {
  agent: CatalogAgent
  onSaved: (a: CatalogAgent) => void
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    display_name: agent.display_name,
    full_name: agent.full_name,
    role_label: agent.role_label ?? '',
    description: agent.description ?? '',
    domain: agent.domain,
    family: agent.family,
    capability_level: agent.capability_level,
    feedback_level: agent.feedback_level,
    status: agent.status,
  })
  const [saving, setSaving] = useState(false)
  const [togglingConn, setTogglingConn] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  async function patch(payload: Record<string, unknown>): Promise<CatalogAgent | null> {
    const res = await fetch(`/api/admin/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      setMsg({ kind: 'err', text: json.error || `HTTP ${res.status}` })
      return null
    }
    return json.data as CatalogAgent
  }

  async function handleSave() {
    setSaving(true)
    setMsg(null)
    const updated = await patch(form)
    if (updated) {
      onSaved(updated)
      setMsg({ kind: 'ok', text: 'Guardado' })
      setOpen(false)
    }
    setSaving(false)
  }

  async function handleToggleConnectable() {
    setTogglingConn(true)
    setMsg(null)
    const updated = await patch({ is_connectable: !agent.is_connectable })
    if (updated) onSaved(updated)
    setTogglingConn(false)
  }

  const s = STATUS_STYLE[agent.status] || STATUS_STYLE.planned

  return (
    <div
      className="rounded-lg"
      style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold" style={{ color: 'var(--baw-text)' }}>
              {agent.full_name}
            </span>
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'var(--baw-elevated)', color: 'var(--baw-muted)' }}
            >
              {agent.id}
            </span>
            <span
              className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ backgroundColor: s.bg, color: s.fg }}
            >
              {agent.status}
            </span>
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: 'var(--baw-muted)' }}>
            {agent.role_label || agent.domain} · L{agent.capability_level} · F{agent.feedback_level}
          </div>
        </div>

        {/* Toggle conectable */}
        <button
          type="button"
          onClick={handleToggleConnectable}
          disabled={togglingConn}
          title="¿Visible/conectable en /agents?"
          className="text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors disabled:opacity-50"
          style={{
            backgroundColor: agent.is_connectable ? 'var(--baw-success-bg-soft)' : 'var(--baw-neutral-bg-soft)',
            color: agent.is_connectable ? 'var(--baw-success-fg)' : 'var(--baw-neutral-fg)',
            border: `1px solid ${agent.is_connectable ? 'var(--baw-success-border, var(--baw-border))' : 'var(--baw-border)'}`,
          }}
        >
          {togglingConn ? '…' : agent.is_connectable ? '● Conectable' : '○ Oculto'}
        </button>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-[12px] underline"
          style={{ color: 'var(--baw-accent)' }}
        >
          {open ? 'Cerrar' : 'Editar'}
        </button>
      </div>

      {/* Edit form */}
      {open && (
        <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: 'var(--baw-border)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <Field label="Nombre corto">
              <input className="input-field w-full" value={form.display_name} onChange={(e) => set('display_name', e.target.value)} />
            </Field>
            <Field label="Nombre completo">
              <input className="input-field w-full" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
            </Field>
            <Field label="Rol (línea de la tarjeta)">
              <input className="input-field w-full" value={form.role_label} placeholder="ej. Operadora" onChange={(e) => set('role_label', e.target.value)} />
            </Field>
            <Field label="Dominio">
              <input className="input-field w-full" value={form.domain} onChange={(e) => set('domain', e.target.value)} />
            </Field>
            <Field label="Familia">
              <input className="input-field w-full" value={form.family} onChange={(e) => set('family', e.target.value)} />
            </Field>
            <Field label="Estado">
              <select className="input-field w-full" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </Field>
            <Field label="Capability (L) 0-5">
              <input type="number" min={0} max={5} className="input-field w-full" value={form.capability_level} onChange={(e) => set('capability_level', Number(e.target.value))} />
            </Field>
            <Field label="Feedback (F) 0-5">
              <input type="number" min={0} max={5} className="input-field w-full" value={form.feedback_level} onChange={(e) => set('feedback_level', Number(e.target.value))} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Descripción">
                <textarea className="input-field w-full" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-3">
            <button type="button" onClick={handleSave} disabled={saving} className="btn-primary text-[13px] px-4 py-1.5 disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            {msg && (
              <span className="text-[12px]" style={{ color: msg.kind === 'ok' ? 'var(--baw-success-fg)' : 'var(--baw-danger-fg)' }}>
                {msg.text}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Mensaje fuera del form (p.ej. error de toggle) */}
      {!open && msg && (
        <div className="px-3 pb-2 -mt-1">
          <span className="text-[12px]" style={{ color: msg.kind === 'ok' ? 'var(--baw-success-fg)' : 'var(--baw-danger-fg)' }}>
            {msg.text}
          </span>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--baw-muted)' }}>
        {label}
      </span>
      {children}
    </label>
  )
}
