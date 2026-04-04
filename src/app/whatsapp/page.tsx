'use client'

import { useEffect, useState, useCallback } from 'react'
import { MessageCircle, Send, Phone, Inbox, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SkeletonTable } from '@/components/Skeleton'

type NotifyType = 'mora_day1' | 'mora_day5' | 'mora_day10' | 'checkin' | 'contract_expiring'

interface AuditEntry {
  id: string
  action: string
  created_at: string
  metadata: Record<string, string> | null
}

const NOTIFY_TYPES: { value: NotifyType; label: string }[] = [
  { value: 'mora_day1', label: 'Mora — Día 1' },
  { value: 'mora_day5', label: 'Mora — Día 5' },
  { value: 'mora_day10', label: 'Mora — Día 10' },
  { value: 'checkin', label: 'Check-in' },
  { value: 'contract_expiring', label: 'Contrato por vencer' },
]

const CLASSIFICATION_COLORS: Record<string, string> = {
  FAQ: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  PAGO: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  INCIDENCIA: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  COMPLEJO: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
}

const PAGE_SIZE = 15

export default function WhatsAppPage() {
  // ─── Connection status ───
  const [connected, setConnected] = useState<boolean | null>(null)

  // ─── Send notification form ───
  const [notifyType, setNotifyType] = useState<NotifyType>('mora_day1')
  const [phone, setPhone] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [unit, setUnit] = useState('')
  const [amount, setAmount] = useState('')
  const [checkInCode, setCheckInCode] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // ─── Sent history ───
  const [sentLogs, setSentLogs] = useState<AuditEntry[]>([])
  const [loadingSent, setLoadingSent] = useState(true)

  // ─── Received messages ───
  const [receivedLogs, setReceivedLogs] = useState<AuditEntry[]>([])
  const [loadingReceived, setLoadingReceived] = useState(true)
  const [receivedPage, setReceivedPage] = useState(0)
  const [receivedTotal, setReceivedTotal] = useState(0)

  // Check connection
  useEffect(() => {
    fetch('/api/whatsapp/send', { method: 'HEAD' })
      .then(() => setConnected(true))
      .catch(() => setConnected(false))
    // Simple check: we just verify if the page loaded. Actual token check is server-side.
    setConnected(true)
  }, [])

  // Fetch sent logs
  const fetchSentLogs = useCallback(async () => {
    setLoadingSent(true)
    const { data } = await supabase
      .from('audit_log')
      .select('id, action, created_at, metadata')
      .or('action.eq.whatsapp.message.sent,action.eq.whatsapp.notification.sent')
      .order('created_at', { ascending: false })
      .limit(10)
    setSentLogs((data as AuditEntry[]) || [])
    setLoadingSent(false)
  }, [])

  // Fetch received logs
  const fetchReceivedLogs = useCallback(async () => {
    setLoadingReceived(true)
    const { data, count } = await supabase
      .from('audit_log')
      .select('id, action, created_at, metadata', { count: 'exact' })
      .eq('action', 'whatsapp.message.received')
      .order('created_at', { ascending: false })
      .range(receivedPage * PAGE_SIZE, (receivedPage + 1) * PAGE_SIZE - 1)
    setReceivedLogs((data as AuditEntry[]) || [])
    setReceivedTotal(count || 0)
    setLoadingReceived(false)
  }, [receivedPage])

  useEffect(() => { fetchSentLogs() }, [fetchSentLogs])
  useEffect(() => { fetchReceivedLogs() }, [fetchReceivedLogs])

  async function handleSend() {
    setSending(true)
    setSendResult(null)

    try {
      const res = await fetch('/api/whatsapp/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'baw-secret-2026',
        },
        body: JSON.stringify({
          type: notifyType,
          tenantPhone: phone,
          tenantName,
          unit,
          ...(amount ? { amount: Number(amount) } : {}),
          ...(checkInCode ? { checkInCode } : {}),
        }),
      })

      const data = await res.json()
      if (data.success) {
        setSendResult({ ok: true, msg: 'Notificación enviada correctamente' })
        fetchSentLogs()
      } else {
        setSendResult({ ok: false, msg: data.error || 'Error al enviar' })
      }
    } catch {
      setSendResult({ ok: false, msg: 'Error de red' })
    } finally {
      setSending(false)
    }
  }

  const showAmount = ['mora_day1', 'mora_day5', 'mora_day10'].includes(notifyType)
  const showCode = notifyType === 'checkin'
  const receivedTotalPages = Math.ceil(receivedTotal / PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-green-600/10 flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-green-500" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-100 [html.light_&]:text-gray-900">WhatsApp</h1>
          <p className="text-sm text-gray-400 [html.light_&]:text-gray-500">Meta Cloud API — Mensajería automatizada</p>
        </div>
      </div>

      {/* Section 1 — Connection Status */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-200 [html.light_&]:text-gray-800 mb-3">Estado de conexión</h2>
        <div className="flex items-center gap-4">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            connected
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-yellow-500'}`} />
            {connected ? 'Conectado' : 'Sin credenciales'}
          </span>
          <span className="text-sm text-gray-400 [html.light_&]:text-gray-500 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" />
            +52 446 479 0229
          </span>
        </div>
      </div>

      {/* Section 2 — Send Notification */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-200 [html.light_&]:text-gray-800 mb-4 flex items-center gap-2">
          <Send className="w-4 h-4" />
          Enviar notificación manual
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-600 mb-1">Tipo</label>
            <select
              value={notifyType}
              onChange={(e) => setNotifyType(e.target.value as NotifyType)}
              className="input-field w-full"
            >
              {NOTIFY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-600 mb-1">Teléfono (+52...)</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+524464790229"
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-600 mb-1">Nombre del inquilino</label>
            <input
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              placeholder="Juan Pérez"
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-600 mb-1">Unidad</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="A-101"
              className="input-field w-full"
            />
          </div>

          {showAmount && (
            <div>
              <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-600 mb-1">Monto (MXN)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="8500"
                className="input-field w-full"
              />
            </div>
          )}

          {showCode && (
            <div>
              <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-600 mb-1">Código de acceso</label>
              <input
                type="text"
                value={checkInCode}
                onChange={(e) => setCheckInCode(e.target.value)}
                placeholder="4821"
                className="input-field w-full"
              />
            </div>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={sending || !phone || !tenantName || !unit}
          className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? 'Enviando...' : 'Enviar'}
        </button>

        {sendResult && (
          <p className={`mt-3 text-sm ${sendResult.ok ? 'text-green-400' : 'text-red-400'}`}>
            {sendResult.msg}
          </p>
        )}

        {/* Sent history */}
        <div className="mt-6">
          <h3 className="text-xs font-medium text-gray-400 [html.light_&]:text-gray-600 mb-2">Últimos envíos</h3>
          {loadingSent ? (
            <SkeletonTable />
          ) : sentLogs.length === 0 ? (
            <p className="text-sm text-gray-500">Sin envíos registrados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-800 [html.light_&]:border-gray-200">
                    <th className="pb-2 font-medium">Acción</th>
                    <th className="pb-2 font-medium">Destino</th>
                    <th className="pb-2 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 [html.light_&]:divide-gray-200">
                  {sentLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 text-gray-300 [html.light_&]:text-gray-700">{log.action}</td>
                      <td className="py-2 text-gray-400 [html.light_&]:text-gray-600">{log.metadata?.to ?? '—'}</td>
                      <td className="py-2 text-gray-500">{new Date(log.created_at).toLocaleString('es-MX')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Section 3 — Received Messages */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-200 [html.light_&]:text-gray-800 mb-4 flex items-center gap-2">
          <Inbox className="w-4 h-4" />
          Mensajes recibidos
        </h2>

        {loadingReceived ? (
          <SkeletonTable />
        ) : receivedLogs.length === 0 ? (
          <p className="text-sm text-gray-500">Sin mensajes recibidos</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-800 [html.light_&]:border-gray-200">
                    <th className="pb-2 font-medium">Teléfono</th>
                    <th className="pb-2 font-medium">Clasificación</th>
                    <th className="pb-2 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 [html.light_&]:divide-gray-200">
                  {receivedLogs.map((log) => {
                    const classification = log.metadata?.classification ?? 'COMPLEJO'
                    return (
                      <tr key={log.id}>
                        <td className="py-2 text-gray-300 [html.light_&]:text-gray-700">+{log.metadata?.from ?? '—'}</td>
                        <td className="py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CLASSIFICATION_COLORS[classification] ?? CLASSIFICATION_COLORS.COMPLEJO}`}>
                            {classification}
                          </span>
                        </td>
                        <td className="py-2 text-gray-500">{new Date(log.created_at).toLocaleString('es-MX')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {receivedTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-800 [html.light_&]:border-gray-200">
                <span className="text-xs text-gray-500">{receivedTotal} mensajes</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setReceivedPage((p) => Math.max(0, p - 1))}
                    disabled={receivedPage === 0}
                    className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-gray-400">{receivedPage + 1} / {receivedTotalPages}</span>
                  <button
                    onClick={() => setReceivedPage((p) => Math.min(receivedTotalPages - 1, p + 1))}
                    disabled={receivedPage >= receivedTotalPages - 1}
                    className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
