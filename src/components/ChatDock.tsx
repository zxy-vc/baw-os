'use client'

// BaW OS — Dock de chat lateral (derecha), global y oscuro como el sidebar.
// Permite chatear con agentes conectados sin abandonar la pantalla actual.
// Solo se monta si hay al menos un agente conectado en la org.

import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import ChatPanel from '@/app/chat/ChatPanel'

export default function ChatDock() {
  const [open, setOpen] = useState(false)
  const [hasAgents, setHasAgents] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/chat/conversations')
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.success) setHasAgents((j.data.agents?.length ?? 0) > 0)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (!hasAgents) return null

  return (
    <>
      {/* Launcher flotante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full px-4 py-3 shadow-lg text-white transition-transform hover:scale-105"
          style={{ backgroundColor: 'var(--baw-accent)' }}
          title="Chat con agentes"
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[13px] font-medium hidden sm:inline">Chat</span>
        </button>
      )}

      {/* Panel acoplado a la derecha */}
      {open && (
        <div
          className="fixed top-0 right-0 z-50 h-[100dvh] w-full sm:w-[380px] shadow-2xl"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}
        >
          <ChatPanel dark onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  )
}
