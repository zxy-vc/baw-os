'use client'

import { useEffect, useState, useCallback } from 'react'
import { ClipboardList, Plus, X, Play, CheckCircle2, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface HKTask {
  id: string
  title: string
  description: string | null
  assigned_to: string | null
  task_type: string | null
  status: 'pending' | 'in_progress' | 'done'
  priority: 'urgent' | 'normal' | 'low'
  due_date: string | null
  created_at: string
  updated_at?: string
}

interface Unit {
  id: string
  number: string
}

const TASK_TYPES = ['Limpieza', 'Check-in', 'Check-out', 'Mantenimiento', 'Revisión']

const TYPE_BADGE: Record<string, string> = {
  Limpieza: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20 dark:text-cyan-300',
  'Check-in': 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300',
  'Check-out': 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300',
  Mantenimiento: 'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-300',
  Revisión: 'bg-purple-500/10 text-purple-700 border-purple-500/20 dark:text-purple-300',
}

const EMPTY_FORM = {
  unit: '',
  task_type: 'Limpieza',
  assigned_to: '',
  notes: '',
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function todayLabel() {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

export default function HousekeepingPage() {
  const [tasks, setTasks] = useState<HKTask[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToastMsg({ type, msg })
    setTimeout(() => setToastMsg(null), 4000)
  }, [])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  async function fetchTasks() {
    setLoading(true)
    const today = todayISO()
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('entity_type', 'housekeeping')
      .or(`due_date.eq.${today},and(due_date.is.null,created_at.gte.${today}T00:00:00)`)
      .order('created_at', { ascending: true })

    if (!error) setTasks((data as HKTask[]) || [])
    setLoading(false)
  }

  async function fetchUnits() {
    const { data } = await supabase
      .from('units')
      .select('id, number')
      .order('number', { ascending: true })
    if (data) setUnits(data)
  }

  useEffect(() => {
    fetchTasks()
    fetchUnits()
  }, [])

  async function createTask() {
    if (!form.unit.trim() || !form.task_type) return
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({
      title: `${form.task_type} — ${form.unit}`,
      description: form.notes.trim() || null,
      assigned_to: form.assigned_to.trim() || null,
      task_type: form.task_type,
      entity_type: 'housekeeping',
      entity_id: null,
      due_date: todayISO(),
      status: 'pending',
      priority: 'normal',
    })
    setSaving(false)
    if (error) {
      showToast('error', 'Error al crear tarea')
    } else {
      showToast('success', 'Tarea creada')
      setShowModal(false)
      setForm(EMPTY_FORM)
      fetchTasks()
    }
  }

  async function updateStatus(id: string, newStatus: HKTask['status']) {
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', id)

    if (error) {
      showToast('error', 'Error al actualizar')
    } else {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t))
      )
    }
  }

  const pending = tasks.filter((t) => t.status === 'pending')
  const inProgress = tasks.filter((t) => t.status === 'in_progress')
  const done = tasks.filter((t) => t.status === 'done')

  const groups = [
    { key: 'pending', label: 'Pendientes', emoji: '🟡', color: 'bg-amber-500', items: pending },
    { key: 'in_progress', label: 'En progreso', emoji: '🔵', color: 'bg-blue-500', items: inProgress },
    { key: 'done', label: 'Completadas', emoji: '✅', color: 'bg-emerald-500', items: done },
  ] as const

  function extractUnit(task: HKTask) {
    const match = task.title.match(/— (.+)$/)
    return match ? match[1] : task.title
  }

  return (
    <div className="space-y-6">
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toastMsg.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toastMsg.msg}
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-600/10 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Housekeeping
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
              {todayLabel()}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva tarea
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-amber-400">{pending.length}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Pendientes</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-blue-400">{inProgress.length}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">En progreso</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-emerald-400">{done.length}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Completadas</p>
        </div>
      </div>

      {/* Task groups */}
      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card p-4 space-y-3">
              <div className="h-4 bg-gray-800 [html.light_&]:bg-gray-200 rounded animate-pulse w-32" />
              <div className="h-20 bg-gray-800 [html.light_&]:bg-gray-200 rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2.5 h-2.5 rounded-full ${group.color}`} />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {group.emoji} {group.label}
                </h2>
                <span className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800/50 px-2 py-0.5 rounded-full">
                  {group.items.length}
                </span>
              </div>

              {group.items.length === 0 ? (
                <p className="text-xs text-gray-600 dark:text-gray-400 py-3 px-4">
                  Sin tareas {group.label.toLowerCase()}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.items.map((task) => (
                    <div
                      key={task.id}
                      className="card p-4 space-y-3"
                    >
                      {/* Unit */}
                      <div className="flex items-center justify-between">
                        <span className="text-base font-semibold text-gray-900 dark:text-white">
                          {extractUnit(task)}
                        </span>
                        {task.task_type && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_BADGE[task.task_type] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                            {task.task_type}
                          </span>
                        )}
                      </div>

                      {/* Assigned */}
                      {task.assigned_to && (
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-indigo-400 uppercase">
                              {task.assigned_to.charAt(0)}
                            </span>
                          </div>
                          <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">
                            {task.assigned_to}
                          </span>
                        </div>
                      )}

                      {/* Notes */}
                      {task.description && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{task.description}</p>
                      )}

                      {/* Time */}
                      <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                        <Clock className="w-3 h-3" />
                        {new Date(task.created_at).toLocaleTimeString('es-MX', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-1 border-t border-gray-800 dark:border-gray-800 [html.light_&]:border-gray-200">
                        {group.key === 'pending' && (
                          <button
                            onClick={() => updateStatus(task.id, 'in_progress')}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors"
                          >
                            <Play className="w-3 h-3" /> Iniciar
                          </button>
                        )}
                        {(group.key === 'pending' || group.key === 'in_progress') && (
                          <button
                            onClick={() => updateStatus(task.id, 'done')}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Completar
                          </button>
                        )}
                        {group.key === 'done' && (
                          <span className="text-xs text-gray-600 dark:text-gray-400 py-1.5">
                            ✓ Completada
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New task modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Nueva tarea de housekeeping
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Unidad *</label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="input-field w-full"
                >
                  <option value="">Seleccionar unidad</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.number}>{u.number}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Tipo *</label>
                <select
                  value={form.task_type}
                  onChange={(e) => setForm({ ...form, task_type: e.target.value })}
                  className="input-field w-full"
                >
                  {TASK_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Asignado a</label>
                <input
                  type="text"
                  value={form.assigned_to}
                  onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                  className="input-field w-full"
                  placeholder="Nombre del staff"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="input-field w-full"
                  rows={3}
                  placeholder="Detalles adicionales..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={createTask}
                disabled={saving || !form.unit.trim()}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Crear tarea'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
