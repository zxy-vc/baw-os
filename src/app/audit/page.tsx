'use client'

import { useEffect, useState } from 'react'
import { ClipboardList, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SkeletonTable } from '@/components/Skeleton'

interface AuditEntry {
  id: string
  actor_type: 'human' | 'agent'
  actor_id: string
  action: string
  entity_type: string | null
  entity_id: string | null
  created_at: string
}

const PAGE_SIZE = 20

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  // Filters
  const [actorFilter, setActorFilter] = useState<'all' | 'human' | 'agent'>('all')
  const [actionSearch, setActionSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  async function fetchEntries() {
    setLoading(true)

    let query = supabase
      .from('audit_log')
      .select('id, actor_type, actor_id, action, entity_type, entity_id, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (actorFilter !== 'all') {
      query = query.eq('actor_type', actorFilter)
    }
    if (actionSearch.trim()) {
      query = query.ilike('action', `%${actionSearch.trim()}%`)
    }
    if (dateFrom) {
      query = query.gte('created_at', `${dateFrom}T00:00:00`)
    }
    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59`)
    }

    const { data, count, error } = await query
    if (!error) {
      setEntries(data || [])
      setTotal(count || 0)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, actorFilter, actionSearch, dateFrom, dateTo])

  // Reset page when filters change
  useEffect(() => {
    setPage(0)
  }, [actorFilter, actionSearch, dateFrom, dateTo])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-600/10 flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white dark:text-white [html.light_&]:text-gray-900">
            Audit Log
          </h1>
          <p className="text-sm text-gray-400 [html.light_&]:text-gray-500">
            Registro de acciones del sistema
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Actor type */}
          <div>
            <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-500 mb-1">Actor</label>
            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value as 'all' | 'human' | 'agent')}
              className="input-field w-full"
            >
              <option value="all">Todos</option>
              <option value="human">Humano</option>
              <option value="agent">Agente</option>
            </select>
          </div>

          {/* Action search */}
          <div>
            <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-500 mb-1">Acción</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Buscar acción..."
                value={actionSearch}
                onChange={(e) => setActionSearch(e.target.value)}
                className="input-field w-full pl-9"
              />
            </div>
          </div>

          {/* Date from */}
          <div>
            <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input-field w-full"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-field w-full"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4">
            <SkeletonTable />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No hay registros de auditoría
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 dark:border-gray-800 [html.light_&]:border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 [html.light_&]:text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 [html.light_&]:text-gray-500 uppercase tracking-wider">Actor</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 [html.light_&]:text-gray-500 uppercase tracking-wider">Acción</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 [html.light_&]:text-gray-500 uppercase tracking-wider">Entidad</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 [html.light_&]:text-gray-500 uppercase tracking-wider">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 dark:divide-gray-800 [html.light_&]:divide-gray-200">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-800/30 [html.light_&]:hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-300 [html.light_&]:text-gray-700 whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString('es-MX', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                        entry.actor_type === 'agent'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}>
                        {entry.actor_type === 'agent' ? '🤖' : '👤'} {entry.actor_id}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 [html.light_&]:text-gray-700">
                      {entry.action}
                    </td>
                    <td className="px-4 py-3 text-gray-400 [html.light_&]:text-gray-500">
                      {entry.entity_type || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {entry.entity_id ? entry.entity_id.slice(0, 8) + '…' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 dark:border-gray-800 [html.light_&]:border-gray-200">
            <p className="text-xs text-gray-500">
              {total} registros · Página {page + 1} de {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed [html.light_&]:hover:text-gray-900 [html.light_&]:hover:bg-gray-100"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed [html.light_&]:hover:text-gray-900 [html.light_&]:hover:bg-gray-100"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
