'use client'

// Editor cliente para policies de un agente.
// Slider de autonomy 0-4 · per-action overrides · rate caps · save.

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'

type Classification = 'AUTO' | 'LOG' | 'REQUIRE_APPROVAL' | 'DISABLED'

interface Policy {
  autonomy_level: number
  active: boolean
  per_action: Record<string, string> | null
  rate_caps: Record<string, number> | null
  updated_at: string | null
  has_explicit_policy: boolean
}

interface Props {
  agentId: string
  agentName: string
  initialPolicy: Policy
  actionTypes: string[]
  defaultClassifications: Record<string, Classification>
}

const AUTONOMY_LABELS: Record<number, { name: string; desc: string; color: string }> = {
  0: {
    name: 'L0 — Disabled',
    desc: 'Agente apagado en esta org. Toda llamada → 403.',
    color: 'var(--baw-danger-fg)',
  },
  1: {
    name: 'L1 — Suggest only',
    desc: 'Todas las acciones write requieren aprobación humana antes de ejecutarse.',
    color: 'var(--baw-neutral-fg)',
  },
  2: {
    name: 'L2 — Approve each',
    desc: 'Respeta el default por acción. Riesgosas piden approval; seguras corren AUTO.',
    color: 'var(--baw-info-fg)',
  },
  3: {
    name: 'L3 — Approve batch',
    desc: 'Acciones recurrentes pueden degradarse a AUTO via per_action override.',
    color: 'var(--baw-warning-fg)',
  },
  4: {
    name: 'L4 — Full auto',
    desc: 'Ejecuta todo en AUTO excepto irreversibles externos (payments, cfdi, contratos).',
    color: 'var(--baw-success-fg)',
  },
}

const CLASSIFICATIONS: Classification[] = [
  'AUTO',
  'LOG',
  'REQUIRE_APPROVAL',
  'DISABLED',
]

const IRREVERSIBLE = new Set([
  'payment.charge',
  'payment.refund',
  'cfdi.emit',
  'contract.sign',
  'contract.terminate',
  'policy.modify',
])

export default function PoliciesEditorClient({
  agentId,
  agentName,
  initialPolicy,
  actionTypes,
  defaultClassifications,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const [autonomy, setAutonomy] = useState<number>(initialPolicy.autonomy_level)
  const [active, setActive] = useState<boolean>(initialPolicy.active)
  const [perAction, setPerAction] = useState<Record<string, string>>(
    initialPolicy.per_action || {}
  )
  const [rateCaps, setRateCaps] = useState<Record<string, number>>(
    initialPolicy.rate_caps || { per_minute: 60, per_hour: 1000, per_day: 10000 }
  )

  const grouped = useMemo(() => {
    const g: Record<string, string[]> = {}
    for (const at of actionTypes) {
      const family = at.split('.')[0]
      ;(g[family] = g[family] || []).push(at)
    }
    return g
  }, [actionTypes])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/agents/${agentId}/policies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autonomy_level: autonomy,
          active,
          per_action: Object.keys(perAction).length > 0 ? perAction : null,
          rate_caps: rateCaps,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error?.message || `save failed (${res.status})`)
      }
      setSavedAt(new Date().toLocaleTimeString('es-MX'))
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error')
    } finally {
      setSaving(false)
    }
  }

  function setActionOverride(at: string, val: string | null) {
    setPerAction((prev) => {
      const next = { ...prev }
      if (val === null || val === '') delete next[at]
      else next[at] = val
      return next
    })
  }

  const meta = AUTONOMY_LABELS[autonomy] || AUTONOMY_LABELS[1]

  return (
    <div className="space-y-6">
      {/* Active toggle */}
      <div
        className="rounded p-4 flex items-center justify-between"
        style={{
          backgroundColor: 'var(--baw-surface)',
          border: '1px solid var(--baw-border)',
        }}
      >
        <div>
          <div className="text-[14px]" style={{ color: 'var(--baw-text)' }}>
            Active
          </div>
          <div className="text-[11px]" style={{ color: 'var(--baw-muted)' }}>
            Si está OFF, las acciones se elevan automáticamente a REQUIRE_APPROVAL.
          </div>
        </div>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-[12px]" style={{ color: 'var(--baw-text)' }}>
            {active ? 'On' : 'Off'}
          </span>
        </label>
      </div>

      {/* Autonomy slider */}
      <div
        className="rounded p-4"
        style={{
          backgroundColor: 'var(--baw-surface)',
          border: '1px solid var(--baw-border)',
        }}
      >
        <div className="flex items-baseline justify-between mb-3">
          <h2
            className="text-[14px] uppercase tracking-wider"
            style={{ color: 'var(--baw-muted)' }}
          >
            Autonomy Level
          </h2>
          <span
            className="text-[12px] font-semibold"
            style={{ color: meta.color }}
          >
            {meta.name}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={4}
          step={1}
          value={autonomy}
          onChange={(e) => setAutonomy(parseInt(e.target.value, 10))}
          className="w-full"
          style={{ accentColor: meta.color }}
        />
        <div
          className="flex justify-between text-[10px] mt-1"
          style={{ color: 'var(--baw-faint)' }}
        >
          <span>L0</span>
          <span>L1</span>
          <span>L2</span>
          <span>L3</span>
          <span>L4</span>
        </div>
        <p
          className="text-[12px] mt-3"
          style={{ color: 'var(--baw-muted)' }}
        >
          {meta.desc}
        </p>
      </div>

      {/* Rate caps */}
      <div
        className="rounded p-4"
        style={{
          backgroundColor: 'var(--baw-surface)',
          border: '1px solid var(--baw-border)',
        }}
      >
        <h2
          className="text-[14px] uppercase tracking-wider mb-3"
          style={{ color: 'var(--baw-muted)' }}
        >
          Rate caps
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['per_minute', 'per_hour', 'per_day'] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-[11px]" style={{ color: 'var(--baw-muted)' }}>
                {k.replace('_', ' ')}
              </span>
              <input
                type="number"
                min={0}
                value={rateCaps[k] ?? 0}
                onChange={(e) =>
                  setRateCaps((p) => ({ ...p, [k]: parseInt(e.target.value, 10) || 0 }))
                }
                className="rounded px-2 py-1.5 text-[12px]"
                style={{
                  backgroundColor: 'var(--baw-bg)',
                  border: '1px solid var(--baw-border)',
                  color: 'var(--baw-text)',
                }}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Per-action overrides */}
      <div
        className="rounded p-4"
        style={{
          backgroundColor: 'var(--baw-surface)',
          border: '1px solid var(--baw-border)',
        }}
      >
        <h2
          className="text-[14px] uppercase tracking-wider mb-1"
          style={{ color: 'var(--baw-muted)' }}
        >
          Per-action overrides
        </h2>
        <p className="text-[11px] mb-3" style={{ color: 'var(--baw-faint)' }}>
          Override granular por action_type. Si dejas vacío, se usa el default
          del autonomy level. Los irreversibles externos están bloqueados a
          REQUIRE_APPROVAL.
        </p>
        <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
          {Object.entries(grouped).map(([family, types]) => (
            <div key={family}>
              <div
                className="text-[10px] uppercase tracking-wider mb-1"
                style={{ color: 'var(--baw-muted)' }}
              >
                {family}
              </div>
              <div className="space-y-1">
                {types.map((at) => {
                  const def = defaultClassifications[at]
                  const cur = perAction[at] || ''
                  const isIrr = IRREVERSIBLE.has(at)
                  return (
                    <div
                      key={at}
                      className="flex items-center gap-2 text-[11px] py-0.5"
                    >
                      <span
                        className="font-mono w-[200px] truncate"
                        style={{ color: 'var(--baw-text)' }}
                      >
                        {at}
                      </span>
                      <span
                        className="text-[10px] w-[140px] shrink-0"
                        style={{ color: 'var(--baw-faint)' }}
                      >
                        default: {def}
                      </span>
                      <select
                        value={cur}
                        disabled={isIrr}
                        onChange={(e) => setActionOverride(at, e.target.value || null)}
                        className="rounded px-1.5 py-1 text-[11px]"
                        style={{
                          backgroundColor: 'var(--baw-bg)',
                          border: '1px solid var(--baw-border)',
                          color: 'var(--baw-text)',
                          opacity: isIrr ? 0.4 : 1,
                        }}
                      >
                        <option value="">— sin override —</option>
                        {CLASSIFICATIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      {isIrr && (
                        <span
                          className="text-[9px]"
                          style={{ color: 'var(--baw-warning-fg)' }}
                        >
                          🔒 locked
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px]" style={{ color: 'var(--baw-muted)' }}>
          {error ? (
            <span style={{ color: 'var(--baw-danger-fg)' }}>{error}</span>
          ) : savedAt ? (
            <span style={{ color: 'var(--baw-success-fg)' }}>
              Guardado {savedAt}
            </span>
          ) : initialPolicy.has_explicit_policy ? (
            `Última actualización: ${
              initialPolicy.updated_at
                ? new Date(initialPolicy.updated_at).toLocaleString('es-MX')
                : '—'
            }`
          ) : (
            'Sin policy explícita — usando defaults.'
          )}
        </div>
        <button
          disabled={saving || pending}
          onClick={save}
          className="px-4 py-2 rounded text-[12px] uppercase tracking-wider font-semibold disabled:opacity-50"
          style={{
            backgroundColor: 'var(--baw-text)',
            color: 'var(--baw-bg)',
          }}
        >
          {saving ? 'Guardando…' : `Guardar policy de ${agentName}`}
        </button>
      </div>
    </div>
  )
}
