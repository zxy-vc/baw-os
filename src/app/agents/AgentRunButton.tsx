'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  agentId: string
  agentName: string
}

export default function AgentRunButton({ agentId, agentName }: Props) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function invoke(dryRun: boolean) {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch(`/api/agents/${agentId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: dryRun }),
      })
      const data = await res.json()
      if (data.success) {
        const m = data.data?.result?.metrics || {}
        setResult(`${data.data.status} · ${m.actions_ok || 0}✓ ${m.actions_failed || 0}✗`)
        router.refresh()
      } else {
        setResult(`error: ${data.error || 'unknown'}`)
      }
    } catch (e) {
      setResult(`error: ${e instanceof Error ? e.message : 'network'}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          onClick={() => invoke(true)}
          disabled={running}
          className="flex-1 text-[11px] px-3 py-1.5 rounded-md font-medium transition-opacity disabled:opacity-50"
          style={{
            backgroundColor: 'var(--baw-surface-alt, var(--baw-surface))',
            color: 'var(--baw-text)',
            border: '1px solid var(--baw-border)',
          }}
        >
          {running ? '…' : `Dry-run ${agentName}`}
        </button>
        <button
          onClick={() => invoke(false)}
          disabled={running}
          className="flex-1 text-[11px] px-3 py-1.5 rounded-md font-medium transition-opacity disabled:opacity-50"
          style={{
            backgroundColor: 'var(--baw-accent, #7c3aed)',
            color: '#fff',
          }}
        >
          {running ? '…' : 'Ejecutar'}
        </button>
      </div>
      {result && (
        <div className="text-[11px] tabular-nums" style={{ color: 'var(--baw-muted)' }}>
          {result}
        </div>
      )}
    </div>
  )
}
