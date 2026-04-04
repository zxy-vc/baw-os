'use client'

import { useEffect, useState } from 'react'
import { CheckSquare, Plus, X, Calendar, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/Toast'

interface Task {
  id: string
  title: string
  description: string | null
  assigned_to: string | null
  created_by: string | null
  due_date: string | null
  status: 'pending' | 'in_progress' | 'done'
  priority: 'urgent' | 'normal' | 'low'
  created_at: string
}

const TEAM = ['alicia', 'enrique', 'fran', 'hugo']

const PRIORITY_BADGE: Record<string, string> = {
  urgent: '🔴 Urgente',
  normal: '🟡 Normal',
  low: '🟢 Baja',
}

const PRIORITY_CLASS: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-400 border border-red-500/20',
  normal: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  low: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
}

const COLUMNS: { key: Task['status']; label: string; color: string }[] = [
  { key: 'pending', label: 'Pendiente', color: 'bg-amber-500' },
  { key: 'in_progress', label: 'En proceso', color: 'bg-blue-500' },
  { key: 'done', label: 'Hecho', color: 'bg-emerald-500' },
]

const EMPTY_FORM = {
  title: '',
  description: '',
  assigned_to: '',
  priority: 'normal' as Task['priority'],
  due_date: '',
}

export default function TasksPage() {
  const toast = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  async function fetchTasks() {
    setLoading(true)
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) setTasks(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchTasks()
  }, [])

  async function createTask() {
    if (!form.title.trim()) return
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      assigned_to: form.assigned_to || null,
      priority: form.priority,
      due_date: form.due_date || null,
      status: 'pending',
    })
    setSaving(false)
    if (error) {
      toast.error('Error al crear tarea')
    } else {
      toast.success('Tarea creada')
      setShowModal(false)
      setForm(EMPTY_FORM)
      fetchTasks()
    }
  }

  async function moveTask(taskId: string, newStatus: Task['status']) {
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', taskId)

    if (error) {
      toast.error('Error al actualizar')
    } else {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      )
    }
  }

  function tasksByStatus(status: Task['status']) {
    return tasks.filter((t) => t.status === status)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600/10 flex items-center justify-center">
            <CheckSquare className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white dark:text-white [html.light_&]:text-gray-900">
              Tareas
            </h1>
            <p className="text-sm text-gray-400 [html.light_&]:text-gray-500">
              {tasks.length} tareas · {tasksByStatus('done').length} completadas
            </p>
          </div>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nueva tarea
        </button>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card p-4 space-y-3">
              <div className="h-4 bg-gray-800 [html.light_&]:bg-gray-200 rounded animate-pulse w-24" />
              {[0, 1].map((j) => (
                <div key={j} className="h-28 bg-gray-800 [html.light_&]:bg-gray-200 rounded-lg animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map((col) => (
            <div key={col.key} className="card p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                <h2 className="text-sm font-semibold text-white dark:text-white [html.light_&]:text-gray-900">
                  {col.label}
                </h2>
                <span className="ml-auto text-xs text-gray-500 bg-gray-800/50 [html.light_&]:bg-gray-100 px-2 py-0.5 rounded-full">
                  {tasksByStatus(col.key).length}
                </span>
              </div>

              <div className="space-y-3">
                {tasksByStatus(col.key).length === 0 ? (
                  <p className="text-xs text-gray-600 [html.light_&]:text-gray-400 text-center py-6">
                    Sin tareas
                  </p>
                ) : (
                  tasksByStatus(col.key).map((task) => (
                    <div
                      key={task.id}
                      className="rounded-lg border border-gray-800 dark:border-gray-800 [html.light_&]:border-gray-200 p-3 space-y-2 bg-gray-900/50 [html.light_&]:bg-white"
                    >
                      <p className="text-sm font-medium text-white dark:text-white [html.light_&]:text-gray-900">
                        {task.title}
                      </p>

                      <div className="flex flex-wrap items-center gap-2">
                        {task.assigned_to && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 capitalize">
                            {task.assigned_to}
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_CLASS[task.priority]}`}>
                          {PRIORITY_BADGE[task.priority]}
                        </span>
                      </div>

                      {task.due_date && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {new Date(task.due_date + 'T12:00:00').toLocaleDateString('es-MX', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2 pt-1">
                        {col.key === 'pending' && (
                          <button
                            onClick={() => moveTask(task.id, 'in_progress')}
                            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                          >
                            <ArrowRight className="w-3 h-3" /> En proceso
                          </button>
                        )}
                        {col.key === 'in_progress' && (
                          <button
                            onClick={() => moveTask(task.id, 'done')}
                            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                          >
                            <ArrowRight className="w-3 h-3" /> Hecho
                          </button>
                        )}
                        {col.key === 'done' && (
                          <button
                            onClick={() => moveTask(task.id, 'pending')}
                            className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                          >
                            <ArrowRight className="w-3 h-3" /> Reabrir
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New task modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white dark:text-white [html.light_&]:text-gray-900">
                Nueva tarea
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white [html.light_&]:hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-500 mb-1">Título *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="input-field w-full"
                  placeholder="Título de la tarea"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-500 mb-1">Descripción</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="input-field w-full"
                  rows={3}
                  placeholder="Detalles opcionales..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-500 mb-1">Asignar a</label>
                  <select
                    value={form.assigned_to}
                    onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                    className="input-field w-full capitalize"
                  >
                    <option value="">Sin asignar</option>
                    {TEAM.map((t) => (
                      <option key={t} value={t} className="capitalize">{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-500 mb-1">Prioridad</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as Task['priority'] })}
                    className="input-field w-full"
                  >
                    <option value="urgent">🔴 Urgente</option>
                    <option value="normal">🟡 Normal</option>
                    <option value="low">🟢 Baja</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 [html.light_&]:text-gray-500 mb-1">Fecha límite</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="input-field w-full"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white [html.light_&]:text-gray-600 [html.light_&]:hover:text-gray-900"
              >
                Cancelar
              </button>
              <button
                onClick={createTask}
                disabled={saving || !form.title.trim()}
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
