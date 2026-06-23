'use client'

// BaW OS — Chat in-app con agentes conectados.
// Cada mensaje crea una interacción channel='app' que el agente recoge por su
// long-poll y responde. La UI hace polling del hilo para mostrar la respuesta.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Plus, Send, Loader2, MessageSquare } from 'lucide-react'
import { useToast } from '@/components/Toast'

interface AgentLite {
  id: string
  display_name: string
  full_name: string
}
interface Conversation {
  id: string
  agent_id: string
  agent_name?: string
  title: string | null
  last_message_at: string
}
interface Message {
  id: string
  user_text: string
  agent_text: string | null
  status: string
  created_at: string
}

export default function ChatView() {
  const toast = useToast()
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

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Carga + polling del hilo seleccionado (para ver la respuesta del agente).
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
      if (!json.success) {
        toast.error(json.error || 'No se pudo crear la conversación')
        return
      }
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
    // Optimista: muestra el mensaje del usuario de inmediato.
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
      if (!json.success) {
        toast.error(json.error || 'No se pudo enviar')
      } else {
        loadThread(selectedId)
      }
    } catch {
      toast.error('Error de red')
    } finally {
      setSending(false)
    }
  }

  const selectedConv = conversations.find((c) => c.id === selectedId)
  const noAgents = !loadingList && agents.length === 0

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-3">
      {/* Lista de conversaciones */}
      <div
        className="w-72 shrink-0 rounded-lg flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
      >
        <div className="p-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--baw-border)' }}>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--baw-text)' }}>Conversaciones</span>
          <button
            onClick={() => setPicking((p) => !p)}
            disabled={noAgents}
            className="p-1 rounded disabled:opacity-40"
            style={{ color: 'var(--baw-accent)' }}
            title="Nueva conversación"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {picking && (
          <div className="p-2 space-y-1" style={{ borderBottom: '1px solid var(--baw-border)' }}>
            <p className="text-[11px] px-1 mb-1" style={{ color: 'var(--baw-muted)' }}>Chatear con:</p>
            {agents.map((a) => (
              <button
                key={a.id}
                onClick={() => startConversation(a.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[13px] text-left hover:opacity-80"
                style={{ color: 'var(--baw-text)', backgroundColor: 'var(--baw-elevated)' }}
              >
                <Bot className="w-4 h-4" style={{ color: 'var(--baw-agent-fg)' }} />
                {a.full_name || a.display_name}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
          ) : conversations.length === 0 ? (
            <p className="p-4 text-[12px] text-center" style={{ color: 'var(--baw-muted)' }}>
              {noAgents ? 'No tienes agentes conectados. Conéctalos en /agents.' : 'Sin conversaciones. Empieza una con +.'}
            </p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors"
                style={{
                  backgroundColor: c.id === selectedId ? 'var(--baw-elevated)' : 'transparent',
                  borderBottom: '1px solid var(--baw-border)',
                }}
              >
                <Bot className="w-4 h-4 shrink-0" style={{ color: 'var(--baw-agent-fg)' }} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--baw-text)' }}>
                    {c.agent_name || c.agent_id}
                  </span>
                  {c.title && <span className="block text-[11px] truncate" style={{ color: 'var(--baw-muted)' }}>{c.title}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Hilo */}
      <div
        className="flex-1 rounded-lg flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
      >
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ color: 'var(--baw-muted)' }}>
            <MessageSquare className="w-8 h-8" />
            <p className="text-[13px]">Elige o inicia una conversación con un agente conectado.</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--baw-border)' }}>
              <Bot className="w-4 h-4" style={{ color: 'var(--baw-agent-fg)' }} />
              <span className="text-[14px] font-semibold" style={{ color: 'var(--baw-text)' }}>
                {selectedConv?.agent_name || selectedConv?.agent_id}
              </span>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <p className="text-center text-[12px]" style={{ color: 'var(--baw-muted)' }}>Escribe el primer mensaje.</p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="space-y-2">
                    {/* Usuario */}
                    <div className="flex justify-end">
                      <div className="max-w-[75%] rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: 'var(--baw-accent)', color: 'white' }}>
                        {m.user_text}
                      </div>
                    </div>
                    {/* Agente */}
                    <div className="flex justify-start">
                      {m.agent_text ? (
                        <div className="max-w-[75%] rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: 'var(--baw-elevated)', color: 'var(--baw-text)', border: '1px solid var(--baw-border)' }}>
                          {m.agent_text}
                        </div>
                      ) : m.status === 'failed' ? (
                        <div className="text-[12px] px-3 py-2" style={{ color: 'var(--baw-danger-fg)' }}>El agente no pudo responder.</div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[12px] px-3 py-2" style={{ color: 'var(--baw-muted)' }}>
                          <Loader2 className="w-3 h-3 animate-spin" /> pensando…
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 flex items-end gap-2" style={{ borderTop: '1px solid var(--baw-border)' }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                rows={1}
                placeholder="Escribe un mensaje…"
                className="input-field flex-1 resize-none"
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                className="btn-primary px-3 py-2 disabled:opacity-50"
                title="Enviar"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
