'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function NewIncidentPage() {
  const router = useRouter()
  const [units, setUnits] = useState<{ id: string; number: string }[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    unit_id: '',
    title: '',
    description: '',
    priority: 'medium' as string,
    assigned_to: '',
    estimated_cost: '',
  })

  useEffect(() => {
    supabase
      .from('units')
      .select('id, number')
      .order('number')
      .then(({ data }) => setUnits(data || []))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const { error } = await supabase.from('incidents').insert({
      org_id: 'ed4308c7-2bdb-46f2-be69-7c59674838e2',
      unit_id: form.unit_id || null,
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
      status: 'open',
    })

    if (!error) {
      router.push('/maintenance')
    }
    setSaving(false)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/maintenance"
          className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Nueva incidencia</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Reportar problema o mantenimiento</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Unidad</label>
          <select
            value={form.unit_id}
            onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
            className="input-field"
          >
            <option value="">Área común / General</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>Unidad {u.number}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Título</label>
          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="input-field"
            placeholder="Descripción breve del problema"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Descripción</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            className="input-field"
            placeholder="Detalles adicionales del problema..."
          />
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Prioridad</label>
          <select
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            className="input-field"
          >
            <option value="urgent">Urgente</option>
            <option value="high">Alta</option>
            <option value="medium">Normal</option>
            <option value="low">Baja</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Asignado a</label>
          <input
            type="text"
            value={form.assigned_to}
            onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            className="input-field"
            placeholder="Nombre del responsable"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Costo estimado</label>
          <input
            type="number"
            step="0.01"
            value={form.estimated_cost}
            onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })}
            className="input-field"
            placeholder="0.00"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/maintenance"
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Guardando...' : 'Crear incidencia'}
          </button>
        </div>
      </form>
    </div>
  )
}
