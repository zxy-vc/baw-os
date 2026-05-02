'use client'

// BaW OS — User Preferences form (L2) — Sprint 4 / S4-1.5

import { useState } from 'react'

type Prefs = {
  locale: string
  timezone: string
  notification_prefs: { email?: boolean; whatsapp?: boolean; in_app?: boolean }
  theme: string
}

const LOCALE_OPTIONS = [
  { value: 'es', label: 'Español (México)' },
  { value: 'en', label: 'English (US)' },
]

const TIMEZONE_OPTIONS = [
  'America/Mexico_City',
  'America/Tijuana',
  'America/Cancun',
  'America/Chicago',
  'America/Los_Angeles',
  'America/New_York',
  'UTC',
]

export default function MePreferencesForm({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState<Prefs>(initial)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/me/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setSavedAt(new Date())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className="rounded-lg p-5 space-y-4"
      style={{
        backgroundColor: 'var(--baw-surface)',
        border: '1px solid var(--baw-border)',
      }}
    >
      <h2
        className="text-[14px] font-medium"
        style={{ color: 'var(--baw-text)' }}
      >
        Preferencias
      </h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            className="block text-[10px] uppercase tracking-wider mb-1"
            style={{ color: 'var(--baw-muted)' }}
          >
            Idioma
          </label>
          <select
            value={prefs.locale}
            onChange={(e) => setPrefs({ ...prefs, locale: e.target.value })}
            className="w-full px-2 py-1.5 text-[12px] rounded"
            style={{
              backgroundColor: 'var(--baw-bg)',
              color: 'var(--baw-text)',
              border: '1px solid var(--baw-border)',
            }}
          >
            {LOCALE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="block text-[10px] uppercase tracking-wider mb-1"
            style={{ color: 'var(--baw-muted)' }}
          >
            Zona horaria
          </label>
          <select
            value={prefs.timezone}
            onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
            className="w-full px-2 py-1.5 text-[12px] rounded"
            style={{
              backgroundColor: 'var(--baw-bg)',
              color: 'var(--baw-text)',
              border: '1px solid var(--baw-border)',
            }}
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <div
          className="text-[10px] uppercase tracking-wider mb-2"
          style={{ color: 'var(--baw-muted)' }}
        >
          Notificaciones
        </div>
        <div className="space-y-1.5">
          <Toggle
            label="Email"
            checked={!!prefs.notification_prefs.email}
            onChange={(v) =>
              setPrefs({
                ...prefs,
                notification_prefs: { ...prefs.notification_prefs, email: v },
              })
            }
          />
          <Toggle
            label="WhatsApp"
            checked={!!prefs.notification_prefs.whatsapp}
            onChange={(v) =>
              setPrefs({
                ...prefs,
                notification_prefs: { ...prefs.notification_prefs, whatsapp: v },
              })
            }
          />
          <Toggle
            label="In-app"
            checked={!!prefs.notification_prefs.in_app}
            onChange={(v) =>
              setPrefs({
                ...prefs,
                notification_prefs: { ...prefs.notification_prefs, in_app: v },
              })
            }
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 text-[12px] rounded font-medium disabled:opacity-50"
          style={{
            backgroundColor: 'var(--baw-primary)',
            color: 'white',
          }}
        >
          {saving ? 'Guardando…' : 'Guardar preferencias'}
        </button>
        {savedAt && !error && (
          <span className="text-[11px]" style={{ color: 'var(--baw-muted)' }}>
            Guardado a las {savedAt.toLocaleTimeString('es-MX')}
          </span>
        )}
        {error && (
          <span className="text-[11px]" style={{ color: 'var(--baw-danger-fg)' }}>
            Error: {error}
          </span>
        )}
      </div>
    </section>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span style={{ color: 'var(--baw-text)' }}>{label}</span>
    </label>
  )
}
