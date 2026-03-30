'use client'

import { useEffect, useState } from 'react'
import { Plus, Wrench, AlertTriangle, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'

interface IncidentWithUnit {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  assigned_to: string | null
  estimated_cost: number | null
  actual_cost: number | null
  notes: string | null
  created_at: string
  resolved_at: string | null
  unit: { number: string } | null
}

const priorityLabels: Record<string, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Normal',
  low: 'Baja',
}

const statusLabels: Record<string, string> = {
  open: 'Abierto',
  in_progress: 'En proceso',
  waiting_parts: 'Esperando piezas',
  resolved: 'Resuelto',
  cancelled: 'Cancelado',
}

const priorityColor: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-400 border border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  low: 'bg-gray-500/10 text-gray-400 border border-gray-500/20',
}

const statusColor: Record<string, string> = {
  open: 'bg-red-500/10 text-red-400 border border-red-500/20',
  in_progress: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  waiting_parts: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  cancelled: 'bg-gray-500/10 text-gray-400 border border-gray-500/20',
}

export default function MaintenancePage() {
  const [incidents, setIncidents] = useState<IncidentWithUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [filterUnit, setFilterUnit] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [units, setUnits] = useState<{ id: string; number: string }[]>([])
  const [deleteTarget, setDeleteTarget] = useState<IncidentWithUnit | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('units')
      .select('id, number')
      .order('number')
      .then(({ data }) => setUnits(data || []))
  }, [])

  async function fetchIncidents() {
    setLoading(true)
    let query = supabase
      .from('incidents')
      .select('*, unit:units(number)')
      .order('created_at', { ascending: false })

    if (filterUnit !== 'all') query = query.eq('unit_id', filterUnit)
    if (filterPriority !== 'all') query = query.eq('priority', filterPriority)
    if (filterStatus !== 'all') query = query.eq('status', filterStatus)

    const { data } = await query
    setIncidents((data as IncidentWithUnit[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchIncidents()
  }, [filterUnit, filterPriority, filterStatus])

  async function handleStatusChange(id: string, status: string) {
    const updates: Record<string, unknown> = { status }
    if (status === 'resolved') updates.resolved_at = new Date().toISOString()
    await supabase.from('incidents').update(updates).eq('id', id)
    fetchIncidents()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    await supabase.from('incidents').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    setSaving(false)
    fetchIncidents()
  }

  const urgentCount = incidents.filter((i) => i.priority === 'urgent' && i.status !== 'resolved' && i.status !== 'cancelled').length
  const openCount = incidents.filter((i) => i.status === 'open').length
  const inProgressCount = incidents.filter((i) => i.status === 'in_progress').length
  const resolvedCount = incidents.filter((i) => i.status === 'resolved').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Mantenimiento</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Incidencias y mantenimiento de unidades</p>
        </div>
        <Link
          href="/maintenance/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva incidencia
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Urgentes</p>
          <p className={`text-xl font-bold mt-1 ${urgentCount > 0 ? 'text-red-400' : 'text-gray-300 dark:text-gray-600'}`}>
            {urgentCount}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Abiertas</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{openCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">En proceso</p>
          <p className="text-xl font-bold text-blue-400 mt-1">{inProgressCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Resueltas</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{resolvedCount}</p>
        </div>
      </div>

      {urgentCount > 0 && (
        <div className="card border-red-500/30">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <p className="text-sm text-red-400">
              {urgentCount} incidencia(s) urgente(s) requieren atención inmediata.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterUnit}
          onChange={(e) => setFilterUnit(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">Todas las unidades</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>Unidad {u.number}</option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">Toda prioridad</option>
          {Object.entries(priorityLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">Todos los estados</option>
          {Object.entries(statusLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-gray-400 dark:text-gray-500">Cargando incidencias...</div>
      ) : incidents.length === 0 ? (
        <div className="card text-center py-12">
          <Wrench className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No hay incidencias registradas</p>
          <Link
            href="/maintenance/new"
            className="mt-4 inline-block text-indigo-400 hover:text-indigo-300 text-sm font-medium"
          >
            Reportar incidencia
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <div
              key={inc.id}
              className={`card hover:shadow-md transition-shadow ${
                inc.priority === 'urgent' && inc.status !== 'resolved' ? 'border-red-500/30' : ''
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{inc.title}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${priorityColor[inc.priority]}`}>
                      {priorityLabels[inc.priority]}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColor[inc.status]}`}>
                      {statusLabels[inc.status]}
                    </span>
                  </div>
                  {inc.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{inc.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                    {inc.unit && <span>Unidad {(inc.unit as { number: string }).number}</span>}
                    <span>{formatDate(inc.created_at)}</span>
                    {inc.assigned_to && <span>Asignado: {inc.assigned_to}</span>}
                    {inc.estimated_cost && <span>Est: {formatCurrency(inc.estimated_cost)}</span>}
                    {inc.actual_cost && <span>Real: {formatCurrency(inc.actual_cost)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={inc.status}
                    onChange={(e) => handleStatusChange(inc.id, e.target.value)}
                    className="bg-gray-100 border border-gray-300 text-gray-700 text-xs rounded px-2 py-1 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
                  >
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setDeleteTarget(inc)}
                    title="Eliminar incidencia"
                    className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Eliminar incidencia</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              ¿Eliminar <strong className="text-gray-900 dark:text-white">{deleteTarget.title}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
