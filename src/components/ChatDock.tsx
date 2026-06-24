'use client'

// BaW OS — Dock de chat lateral (derecha), global y oscuro como el sidebar.
// Mismo ancho que el menú izquierdo (240px). Al abrirse, empuja el contenido
// central vía la variable --chat-dock-width (el <main> aplica padding-right).
// Solo se monta si hay al menos un agente conectado en la org.

import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import ChatPanel from '@/app/chat/ChatPanel'

const DOCK_WIDTH = 240 // = EXPANDED_WIDTH del sidebar

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

  // Empuja el contenido central cuando el dock está abierto (solo en sm+).
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--chat-dock-width', open ? `${DOCK_WIDTH}px` : '0px')
    return () => root.style.setProperty('--chat-dock-width', '0px')
  }, [open])

  if (!hasAgents) return null

  return (
    <>
      {/* Launcher flotante — visible siempre */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center justify-center w-12 h-12 rounded-full shadow-xl text-white ring-2 ring-white/25 transition-transform hover:scale-105"
          style={{ backgroundColor: 'var(--baw-primary)' }}
          title="Chat con agentes"
          aria-label="Abrir chat con agentes"
        >
          <MessageSquare className="w-5 h-5" />
        </button>
      )}

      {/* Panel acoplado a la derecha — mismo ancho que el sidebar */}
      {open && (
        <div
          className="fixed top-0 right-0 z-50 h-[100dvh] w-full sm:w-[240px] shadow-2xl"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}
        >
          <ChatPanel dark onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  )
}
