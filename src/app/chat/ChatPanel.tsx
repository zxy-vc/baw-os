'use client'

// BaW OS — Panel de chat reusable (lo usan la página /chat y el dock lateral).
// Layout en una columna (stack): lista de conversaciones ↔ hilo, con el composer
// SIEMPRE visible (flex + min-h-0). Soporta tema claro u oscuro (dock).

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Send, Loader2, MessageSquare, ChevronLeft, X } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { ActorAvatar } from '@/components/ui/status'

const STALE_MS = 45000 // si el agente no responde en 45s, lo marcamos como sin respuesta

interface AgentLite { id: string; display_name: string; full_name: string; role_label?: string | null; domain?: string | null }
interface Conversation { id: string; agent_id: string; agent_name?: string; agent_role?: string | null; title: string | null; last_message_at: string }
interface Message { id: string; user_text: string; agent_text: string | null; status: string; created_at: string }

function palette(dark: boolean) {
  return dark
    ? {
        bg: 'var(--baw-sidebar-bg, #0b0b0c)',
        border: 'rgba(255,255,255,0.10)',
        text: '#f4f4f5',
        muted: 'rgba(255,255,255,0.55)',
        elevated: 'rgba(255,255,255,0.06)',
        hover: 'rgba(255,255,255,0.08)',
        agentBubble: 'rgba(255,255,255,0.08)',
      }
    : {
        bg: 'var(--baw-surface)',
        border: 'var(--baw-border)',
        text: 'var(--baw-text)',
        muted: 'var(--baw-muted)',
        elevated: 'var(--baw-elevated)',
        hover: 'var(--baw-elevated)',
        agentBubble: 'var(--baw-elevated)',
      }
}

export default function ChatPanel({ dark = false, onClose }: { dark?: boolean; onClose?: () => void }) {
  const toast = useToast()
  const c = palette(dark)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [agents, setAgents] = useState<AgentLite[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [sending, setSending] = useState(false)
  const [picking, setPicking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/conversations')
      const json = await res.json()
      if (json.success) {
        setConversations(json.data.conversations)
        setAgents(json.data.agents)
      }
    } catch {
      /* noop */
    } finally {
      setLoadingList(false)
    }
  }, [])

  const loadThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${id}`)
      const json = await res.json()
      if (json.success) setMessages(json.data.messages)
    } catch {
      /* noop */
    }
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Polling del hilo abierto (para ver la respuesta del agente y refrescar staleness).
  useEffect(() => {
    if (!selectedId) return
    loadThread(selectedId)
    const t = setInterval(() => loadThread(selectedId), 3000)
    return () => clearInterval(t)
  }, [selectedId, loadThread])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function startConversation(agentId: string) {
    setPicking(false)
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      })
      const json = await res.json()
      if (!json.success) { toast.error(json.error || 'No se pudo crear'); return }
      await loadConversations()
      setSelectedId(json.data.id)
      setMessages([])
    } catch {
      toast.error('Error de red')
    }
  }

  async function send() {
    const text = input.trim()
    if (!text || !selectedId || sending) return
    setSending(true)
    setInput('')
    setMessages((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}`, user_text: text, agent_text: null, status: 'deferred', created_at: new Date().toISOString() },
    ])
    try {
      const res = await fetch(`/api/chat/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const json = await res.json()
      if (!json.success) toast.error(json.error || 'No se pudo enviar')
      else loadThread(selectedId)
    } catch {
      toast.error('Error de red')
    } finally {
      setSending(false)
    }
  }

  const selectedConv = conversations.find((cv) => cv.id === selectedId)
  const noAgents = !loadingList && agents.length === 0

  return (
    <div className="flex flex-col h-full min-h-0" style={{ backgroundColor: c.bg, color: c.text }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${c.border}` }}>
        {selectedId ? (
          <>
            <button onClick={() => setSelectedId(null)} className="p-1 rounded hover:opacity-70" style={{ color: c.muted }} title="Volver">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <ActorAvatar type="agent" name={selectedConv?.agent_name || selectedConv?.agent_id || 'Agente'} size={26} />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold truncate">{selectedConv?.agent_name || selectedConv?.agent_id}</span>
              {selectedConv?.agent_role && <span className="block text-[11px] truncate" style={{ color: c.muted }}>{selectedConv.agent_role}</span>}
            </span>
          </>
        ) : (
          <>
            <MessageSquare className="w-4 h-4" style={{ color: c.muted }} />
            <span className="text-[13px] font-semibold flex-1">Conversaciones</span>
            <button onClick={() => setPicking((p) => !p)} disabled={noAgents} className="p-1 rounded disabled:opacity-40 hover:opacity-70" style={{ color: 'var(--baw-accent)' }} title="Nueva conversación">
              <Plus className="w-4 h-4" />
            </button>
          </>
        )}
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:opacity-70 ml-auto" style={{ color: c.muted }} title="Cerrar">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Body */}
      {!selectedId ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {picking && (
            <div className="p-2 space-y-1" style={{ borderBottom: `1px solid ${c.border}` }}>
              <p className="text-[11px] px-1 mb-1" style={{ color: c.muted }}>Chatear con:</p>
              {agents.map((a) => (
                <button key={a.id} onClick={() => startConversation(a.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left" style={{ backgroundColor: c.elevated }}>
                  <ActorAvatar type="agent" name={a.full_name || a.display_name} size={24} />
                  <span className="min-w-0">
                    <span className="block text-[13px] truncate">{a.full_name || a.display_name}</span>
                    {(a.role_label || a.domain) && <span className="block text-[11px] truncate" style={{ color: c.muted }}>{a.role_label || a.domain}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
          {loadingList ? (
            <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
          ) : conversations.length === 0 ? (
            <p className="p-4 text-[12px] text-center" style={{ color: c.muted }}>
              {noAgents ? 'No tienes agentes conectados. Conéctalos en /agents.' : 'Sin conversaciones. Empieza una con +.'}
            </p>
          ) : (
            conversations.map((cv) => (
              <button key={cv.id} onClick={() => setSelectedId(cv.id)} className="w-full text-left px-3 py-2.5 flex items-center gap-2.5" style={{ borderBottom: `1px solid ${c.border}` }}>
                <ActorAvatar type="agent" name={cv.agent_name || cv.agent_id} size={30} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium truncate">{cv.agent_name || cv.agent_id}</span>
                  {(cv.agent_role || cv.title) && <span className="block text-[11px] truncate" style={{ color: c.muted }}>{cv.agent_role || cv.title}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 ? (
              <p className="text-center text-[12px]" style={{ color: c.muted }}>Escribe el primer mensaje.</p>
            ) : (
              messages.map((m) => {
                const stale = !m.agent_text && m.status !== 'failed' && Date.now() - new Date(m.created_at).getTime() > STALE_MS
                return (
                  <div key={m.id} className="space-y-2">
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-lg px-3 py-2 text-[13px] text-white" style={{ backgroundColor: 'var(--baw-accent)' }}>{m.user_text}</div>
                    </div>
                    <div className="flex justify-start">
                      {m.agent_text ? (
                        <div className="max-w-[80%] rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: c.agentBubble, color: c.text, border: `1px solid ${c.border}` }}>{m.agent_text}</div>
                      ) : m.status === 'failed' ? (
                        <div className="text-[12px] px-2" style={{ color: 'var(--baw-danger-fg)' }}>El agente no pudo responder.</div>
                      ) : stale ? (
                        <div className="text-[12px] px-2" style={{ color: c.muted }}>Sin respuesta aún — el agente puede no estar disponible.</div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[12px] px-2" style={{ color: c.muted }}><Loader2 className="w-3 h-3 animate-spin" /> pensando…</div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <div className="shrink-0 p-2.5 flex items-end gap-2" style={{ borderTop: `1px solid ${c.border}` }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={1}
              placeholder="Escribe un mensaje…"
              className="flex-1 resize-none rounded-lg px-3 py-2 text-[13px] outline-none"
              style={{ backgroundColor: c.elevated, color: c.text, border: `1px solid ${c.border}` }}
            />
            <button onClick={send} disabled={sending || !input.trim()} className="rounded-lg px-3 py-2 text-white disabled:opacity-50" style={{ backgroundColor: 'var(--baw-accent)' }} title="Enviar">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
