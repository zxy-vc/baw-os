'use client'

import { useState, useEffect, useCallback } from 'react'
import { Globe, RefreshCw, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Reservation {
  id: string
  guest_name: string
  check_in: string
  check_out: string
  channel: string | null
  status: string
  total_price: number
  unit_id: string
  units?: { label: string }[] | { label: string } | null
}

interface ChannelSummary {
  name: string
  label: string
  logo: string
  count: number
  connected: boolean
}

const CHANNEL_META: Record<string, { label: string; logo: string }> = {
  airbnb: { label: 'Airbnb', logo: '🏠' },
  booking: { label: 'Booking.com', logo: '🅱️' },
  direct: { label: 'Directo', logo: '🔗' },
}

export default function ChannelsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; errors: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('reservations')
        .select('id, guest_name, check_in, check_out, channel, status, total_price, unit_id, units(label)')
        .not('channel', 'is', null)
        .order('check_in', { ascending: false })
        .limit(50)

      const rows = (data || []) as Reservation[]
      setReservations(rows)

      // Build channel summaries
      const counts: Record<string, number> = {}
      for (const r of rows) {
        const ch = r.channel || 'direct'
        counts[ch] = (counts[ch] || 0) + (r.status !== 'cancelled' ? 1 : 0)
      }

      const summaries: ChannelSummary[] = Object.entries(CHANNEL_META).map(
        ([key, meta]) => ({
          name: key,
          label: meta.label,
          logo: meta.logo,
          count: counts[key] || 0,
          connected: key !== 'direct' && (counts[key] || 0) > 0,
        })
      )
      // Add any channels from data not in META
      for (const ch of Object.keys(counts)) {
        if (!CHANNEL_META[ch]) {
          summaries.push({
            name: ch,
            label: ch.charAt(0).toUpperCase() + ch.slice(1),
            logo: '🌐',
            count: counts[ch],
            connected: counts[ch] > 0,
          })
        }
      }
      setChannels(summaries)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/channex/sync', { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        setSyncResult(json.data)
        await loadData()
      } else {
        setSyncResult({ synced: 0, errors: 1 })
      }
    } catch {
      setSyncResult({ synced: 0, errors: 1 })
    } finally {
      setSyncing(false)
    }
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)

  const fmtDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
    })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Globe className="w-6 h-6 text-gray-400" />
          <h1 className="text-2xl font-bold text-white [html.light_&]:text-gray-900">
            Channel Manager
          </h1>
          <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-gray-800 text-gray-400 border border-gray-700 [html.light_&]:bg-gray-100 [html.light_&]:text-gray-500 [html.light_&]:border-gray-300">
            Powered by Channex
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-white text-black hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <Link
            href="/reservations"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 [html.light_&]:border-gray-300 [html.light_&]:text-gray-600 [html.light_&]:hover:text-gray-900 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Ver disponibilidad
          </Link>
        </div>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            syncResult.errors > 0
              ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-800 [html.light_&]:bg-yellow-50 [html.light_&]:text-yellow-800 [html.light_&]:border-yellow-200'
              : 'bg-emerald-900/30 text-emerald-400 border border-emerald-800 [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-800 [html.light_&]:border-emerald-200'
          }`}
        >
          Sincronización completa: {syncResult.synced} reservaciones sincronizadas
          {syncResult.errors > 0 && `, ${syncResult.errors} errores`}
        </div>
      )}

      {/* Channel cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {channels.map((ch) => (
          <div
            key={ch.name}
            className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 [html.light_&]:border-gray-200 [html.light_&]:bg-white"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{ch.logo}</span>
                <span className="text-sm font-semibold text-white [html.light_&]:text-gray-900">
                  {ch.label}
                </span>
              </div>
              <span
                className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${
                  ch.connected
                    ? 'bg-emerald-900/40 text-emerald-400 [html.light_&]:bg-emerald-100 [html.light_&]:text-emerald-700'
                    : 'bg-gray-800 text-gray-500 [html.light_&]:bg-gray-100 [html.light_&]:text-gray-400'
                }`}
              >
                {ch.connected ? 'Conectado' : 'Sin datos'}
              </span>
            </div>
            <p className="text-2xl font-bold text-white [html.light_&]:text-gray-900">
              {ch.count}
            </p>
            <p className="text-xs text-gray-500 mt-1">reservaciones activas</p>
          </div>
        ))}
      </div>

      {/* Reservations table */}
      <div className="rounded-xl border border-gray-800 overflow-hidden [html.light_&]:border-gray-200">
        <div className="px-5 py-4 border-b border-gray-800 [html.light_&]:border-gray-200">
          <h2 className="text-sm font-semibold text-white [html.light_&]:text-gray-900">
            Reservaciones recientes por canal
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 [html.light_&]:border-gray-200">
                {['Check-in', 'Check-out', 'Unidad', 'Huésped', 'Canal', 'Monto', 'Estado'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 [html.light_&]:divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-gray-500">
                    Cargando...
                  </td>
                </tr>
              ) : reservations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-gray-500">
                    Sin reservaciones de canales. Presiona &quot;Sincronizar&quot; para importar.
                  </td>
                </tr>
              ) : (
                reservations.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-gray-800/50 [html.light_&]:hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-5 py-3 text-gray-300 [html.light_&]:text-gray-700">
                      {fmtDate(r.check_in)}
                    </td>
                    <td className="px-5 py-3 text-gray-300 [html.light_&]:text-gray-700">
                      {fmtDate(r.check_out)}
                    </td>
                    <td className="px-5 py-3 text-gray-300 [html.light_&]:text-gray-700">
                      {(Array.isArray(r.units) ? r.units[0]?.label : r.units?.label) || '—'}
                    </td>
                    <td className="px-5 py-3 text-white font-medium [html.light_&]:text-gray-900">
                      {r.guest_name}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full ${
                          r.channel === 'airbnb'
                            ? 'bg-rose-900/40 text-rose-400 [html.light_&]:bg-rose-100 [html.light_&]:text-rose-700'
                            : r.channel === 'booking'
                              ? 'bg-blue-900/40 text-blue-400 [html.light_&]:bg-blue-100 [html.light_&]:text-blue-700'
                              : 'bg-gray-800 text-gray-400 [html.light_&]:bg-gray-100 [html.light_&]:text-gray-600'
                        }`}
                      >
                        {CHANNEL_META[r.channel || 'direct']?.label || r.channel}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-300 [html.light_&]:text-gray-700 font-mono">
                      {fmt(r.total_price)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full ${
                          r.status === 'confirmed'
                            ? 'bg-emerald-900/40 text-emerald-400 [html.light_&]:bg-emerald-100 [html.light_&]:text-emerald-700'
                            : r.status === 'cancelled'
                              ? 'bg-red-900/40 text-red-400 [html.light_&]:bg-red-100 [html.light_&]:text-red-700'
                              : 'bg-gray-800 text-gray-400 [html.light_&]:bg-gray-100 [html.light_&]:text-gray-600'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
