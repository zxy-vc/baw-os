'use client'

// BaW OS — Switch Human ↔ Agent
// Drop-in: monta donde quieras (sidebar, navbar, header).
// Persiste vía POST /api/me/view-mode → cookie baw_view_mode (preferencia de UI).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User2, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ViewMode = 'human' | 'agent'

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
  const [mode, setMode] = useState<ViewMode>(initialMode || 'human')
  const [saving, setSaving] = useState(false)

  // Si no llegó initialMode, lo cargamos client-side
  useEffect(() => {
    if (initialMode) return
    fetch('/api/me/view-mode')
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && j.data?.mode) setMode(j.data.mode as ViewMode)
      })
      .catch(() => {})
  }, [initialMode])

  const apply = async (next: ViewMode) => {
    if (next === mode) return
    const prev = mode
    setSaving(true)
    setMode(next)
    try {
      const res = await fetch('/api/me/view-mode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      // Si el guardado no persistió, revertimos para no mentir en el UI.
      if (!res.ok) {
        setMode(prev)
        return
      }
      router.refresh()
    } catch {
      setMode(prev)
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
