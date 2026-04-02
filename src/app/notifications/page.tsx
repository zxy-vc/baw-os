'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Bell, CheckCheck, Circle, AlertTriangle, CreditCard, FileText, Wrench, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WebhookEvent {
  id: string
  event_type: string
  payload: Record<string, unknown>
  source: string | null
  read: boolean
  created_at: string
}

const eventConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  'payment.received': { label: 'Pago recibido', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CreditCard },
  'payment.overdue': { label: 'Pago vencido', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: AlertTriangle },
  'contract.created': { label: 'Contrato creado', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: FileText },
  'contract.expiring': { label: 'Contrato por vencer', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: FileText },
  'incident.opened': { label: 'Incidencia abierta', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: Wrench },
  'incident.resolved': { label: 'Incidencia resuelta', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: Wrench },
  'unit.status_changed': { label: 'Cambio de unidad', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: Home },
}

function getEventConfig(type: string) {
  return eventConfig[type] || { label: type, color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: Bell }
}

function summarizePayload(payload: Record<string, unknown>): string {
  const parts: string[] = []
  if (payload.amount) parts.push(`$${Number(payload.amount).toLocaleString('es-MX')}`)
  if (payload.title) parts.push(String(payload.title))
  if (payload.contract_id) parts.push(`Contrato: ${String(payload.contract_id).slice(0, 8)}...`)
  if (payload.unit_id) parts.push(`Unidad: ${String(payload.unit_id).slice(0, 8)}...`)
  if (payload.rent) parts.push(`Renta: $${Number(payload.rent).toLocaleString('es-MX')}`)
  if (payload.priority) parts.push(`Prioridad: ${String(payload.priority)}`)
  if (payload.method) parts.push(`Método: ${String(payload.method)}`)
  return parts.join(' · ') || JSON.stringify(payload).slice(0, 80)
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `hace ${days}d`
}

export default function NotificationsPage() {
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data, count } = await supabase
      .from('webhook_events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    setEvents(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [page])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  async function markAsRead(id: string) {
    await supabase
      .from('webhook_events')
      .update({ read: true })
      .eq('id', id)
    setEvents(prev => prev.map(e => e.id === id ? { ...e, read: true } : e))
  }

  async function markAllRead() {
    await supabase
      .from('webhook_events')
      .update({ read: true })
      .eq('read', false)
    setEvents(prev => prev.map(e => ({ ...e, read: true })))
  }

  const unreadCount = events.filter(e => !e.read).length
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white dark:text-white [html.light_&]:text-gray-900">
            Notificaciones
          </h1>
          <p className="text-sm text-gray-400 [html.light_&]:text-gray-500 mt-1">
            {total} eventos · {unreadCount} sin leer
          </p>
        </div>
        <button
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <CheckCheck className="w-4 h-4" />
          Marcar todo como leído
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-800/50 [html.light_&]:bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 [html.light_&]:text-gray-500">No hay notificaciones</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map(event => {
            const config = getEventConfig(event.event_type)
            const Icon = config.icon
            return (
              <button
                key={event.id}
                onClick={() => !event.read && markAsRead(event.id)}
                className={cn(
                  'w-full text-left flex items-start gap-4 p-4 rounded-xl border transition-all',
                  event.read
                    ? 'bg-gray-900/30 border-gray-800/50 [html.light_&]:bg-gray-50 [html.light_&]:border-gray-200'
                    : 'bg-gray-800/60 border-gray-700 hover:border-gray-600 [html.light_&]:bg-white [html.light_&]:border-gray-300 [html.light_&]:hover:border-gray-400'
                )}
              >
                <div className={cn('p-2 rounded-lg border', config.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', config.color)}>
                      {config.label}
                    </span>
                    {!event.read && (
                      <Circle className="w-2 h-2 fill-indigo-500 text-indigo-500" />
                    )}
                  </div>
                  <p className="text-sm text-gray-300 [html.light_&]:text-gray-700 truncate">
                    {summarizePayload(event.payload)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {timeAgo(event.created_at)} · {event.source || 'sistema'}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 [html.light_&]:bg-gray-100 [html.light_&]:text-gray-700"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-400">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 [html.light_&]:bg-gray-100 [html.light_&]:text-gray-700"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  )
}
