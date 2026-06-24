'use client'

// BaW OS — Chat in-app (página completa). Reusa ChatPanel. La altura se acota
// con dvh para que el composer SIEMPRE quede visible (no se corta abajo).

import ChatPanel from './ChatPanel'

export default function ChatView() {
  return (
    <div className="mx-auto w-full max-w-2xl h-[calc(100dvh-10rem)] min-h-[24rem] rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--baw-border)' }}>
      <ChatPanel />
    </div>
  )
}
