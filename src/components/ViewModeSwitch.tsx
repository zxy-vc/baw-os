'use client'

// BaW OS — Switch Human ↔ Agent
// Drop-in: monta donde quieras (sidebar, navbar, header).
// Persiste vía POST /api/me/view-mode → cookie baw_view_mode (preferencia de UI).
// El estado visual es COMPARTIDO entre todas las instancias vía view-mode-store,
// para que los dos toggles (sidebar + header) nunca se desincronicen.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { User2, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getViewModeSnapshot,
  isViewModeInitialized,
  seedViewMode,
  setViewModeLocal,
  subscribeViewMode,
  type ViewMode,
} from '@/lib/agents/view-mode-store'

export type { ViewMode }

interface Props {
  initialMode?: ViewMode
  className?: string
  size?: 'sm' | 'md'
}

export default function ViewModeSwitch({
  initialMode,
  className,
  size = 'md',
}: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  // Siembra el store con el valor del servidor (si llegó) una sola vez.
  useState(() => {
    if (initialMode) seedViewMode(initialMode)
    return null
  })

  // Estado COMPARTIDO: cambiar una instancia re-renderiza todas (fin del desync).
  const mode = useSyncExternalStore(
    subscribeViewMode,
    getViewModeSnapshot,
    () => initialMode || 'human' // snapshot para SSR
  )

  // Si nadie sembró el modo (ninguna instancia recibió initialMode), lo cargamos
  // client-side una vez.
  useEffect(() => {
    if (isViewModeInitialized()) return
    fetch('/api/me/view-mode')
      .then((r) => r.json())
      .then((j) => {
        setViewModeLocal(j?.success && j.data?.mode ? (j.data.mode as ViewMode) : 'human')
      })
      .catch(() => setViewModeLocal('human'))
  }, [])

  const apply = async (next: ViewMode) => {
    if (next === mode) return
    const prev = mode
    setSaving(true)
    setViewModeLocal(next) // actualiza TODAS las instancias al instante
    try {
      const res = await fetch('/api/me/view-mode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      // Si el guardado no persistió, revertimos para no mentir en el UI.
      if (!res.ok) {
        setViewModeLocal(prev)
        return
      }
      router.refresh()
    } catch {
      setViewModeLocal(prev)
    } finally {
      setSaving(false)
    }
  }

  const padding = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
  const iconSize = size === 'sm' ? 12 : 14

  return (
    <div
      role="group"
      aria-label="View mode"
      className={cn(
        'inline-flex rounded-md border border-neutral-200 bg-white p-0.5',
        saving && 'opacity-70',
        className
      )}
    >
      <button
        type="button"
        onClick={() => apply('human')}
        aria-pressed={mode === 'human'}
        className={cn(
          'inline-flex items-center gap-1.5 rounded transition-colors',
          padding,
          mode === 'human'
            ? 'bg-neutral-900 text-white'
            : 'text-neutral-600 hover:bg-neutral-100'
        )}
      >
        <User2 size={iconSize} />
        Human
      </button>
      <button
        type="button"
        onClick={() => apply('agent')}
        aria-pressed={mode === 'agent'}
        className={cn(
          'inline-flex items-center gap-1.5 rounded transition-colors',
          padding,
          mode === 'agent'
            ? 'bg-neutral-900 text-white'
            : 'text-neutral-600 hover:bg-neutral-100'
        )}
      >
        <Bot size={iconSize} />
        Agent
      </button>
    </div>
  )
}
