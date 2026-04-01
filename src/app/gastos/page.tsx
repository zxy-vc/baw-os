'use client'

import { useEffect, useState } from 'react'
import { TrendingDown, Plus, Pencil, Trash2, X, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'

const ORG_ID = 'ed4308c7-2bdb-46f2-be69-7c59674838e2'

const CATEGORIES = ['internet', 'gas', 'luz', 'mantenimiento', 'limpieza', 'otro'] as const
type Category = typeof CATEGORIES[number]

const CATEGORY_LABELS: Record<Category, string> = {
  internet: 'Internet',
  gas: 'Gas',
  luz: 'Luz',
  mantenimiento: 'Mantenimiento',
  limpieza: 'Limpieza',
  otro: 'Otro',
}

const CATEGORY_COLORS: Record<Category, string> = {
  internet: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  gas: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  luz: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  mantenimiento: 'bg-red-500/10 text-red-400 border-red-500/20',
  limpieza: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  otro: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
}

interface Expense {
  id: string
  org_id: string
  category: Category
  scope: 'general' | 'unit'
  unit_id: string | null
  amount: number
  expense_date: string
  provider: string | null
  reference: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface UnitOption {
  id: string
  number: string
}

const emptyForm = {
  category: 'otro' as Category,
  scope: 'general' as 'general' | 'unit',
  unit_id: '' as string,
  amount: 0,
  expense_date: new Date().toISOString().split('T')[0],
  provider: '',
  reference: '',
  notes: '',
}

export default function GastosPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [units, setUnits] = useState<UnitOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)

  async function fetchExpenses() {
    setLoading(true)
    const [year, month] = selectedMonth.split('-').map(Number)
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`

    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('org_id', ORG_ID)
      .gte('expense_date', monthStart)
      .lt('expense_date', nextMonth)
      .order('expense_date', { ascending: false })

    setExpenses((data || []) as Expense[])
    setLoading(false)
  }

  async function fetchUnits() {
    const { data } = await supabase
      .from('units')
      .select('id, number')
      .order('number')
    setUnits((data || []) as UnitOption[])
  }

  useEffect(() => {
    fetchUnits()
  }, [])

  useEffect(() => {
    fetchExpenses()
  }, [selectedMonth])

  function openNew() {
    setEditingId(null)
    setForm({ ...emptyForm })
    setShowModal(true)
  }

  function openEdit(expense: Expense) {
    setEditingId(expense.id)
    setForm({
      category: expense.category,
      scope: expense.scope,
      unit_id: expense.unit_id || '',
      amount: expense.amount,
      expense_date: expense.expense_date,
      provider: expense.provider || '',
      reference: expense.reference || '',
      notes: expense.notes || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      org_id: ORG_ID,
      category: form.category,
      scope: form.scope,
      unit_id: form.scope === 'unit' && form.unit_id ? form.unit_id : null,
      amount: form.amount,
      expense_date: form.expense_date,
      provider: form.provider || null,
      reference: form.reference || null,
      notes: form.notes || null,
    }

    if (editingId) {
      await supabase.from('expenses').update(payload).eq('id', editingId)
    } else {
      await supabase.from('expenses').insert(payload)
    }

    setShowModal(false)
    setSaving(false)
    fetchExpenses()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    await supabase.from('expenses').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    setSaving(false)
    fetchExpenses()
  }

  // Summary by category
  const summaryByCategory = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = expenses
      .filter((e) => e.category === cat)
      .reduce((s, e) => s + Number(e.amount), 0)
    return acc
  }, {} as Record<Category, number>)

  const totalMonth = expenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <TrendingDown className="w-6 h-6 text-red-500" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Gastos</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Control de gastos operativos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input-field w-auto"
          />
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo gasto
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <div className="card col-span-2 sm:col-span-3 lg:col-span-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total mes</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalMonth)}</p>
        </div>
        {CATEGORIES.map((cat) => (
          <div key={cat} className="card">
            <p className="text-xs text-gray-500 dark:text-gray-400">{CATEGORY_LABELS[cat]}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {summaryByCategory[cat] > 0 ? formatCurrency(summaryByCategory[cat]) : '$0'}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-gray-400 dark:text-gray-500 animate-pulse">Cargando gastos...</div>
      ) : expenses.length === 0 ? (
        <div className="card text-center py-12">
          <TrendingDown className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No hay gastos registrados este mes</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Categoría</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Alcance</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Proveedor</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Monto</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Notas</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => {
                const unitNum = units.find((u) => u.id === expense.unit_id)?.number
                return (
                  <tr key={expense.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {formatDate(expense.expense_date)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${CATEGORY_COLORS[expense.category]}`}>
                        {CATEGORY_LABELS[expense.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {expense.scope === 'unit' && unitNum ? `Depto ${unitNum}` : 'General'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {expense.provider || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(Number(expense.amount))}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
                      {expense.notes || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEdit(expense)}
                          title="Editar"
                          className="p-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(expense)}
                          title="Eliminar"
                          className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-lg mx-4 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {editingId ? 'Editar gasto' : 'Nuevo gasto'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Categoría</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                  className="input-field w-full"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-2">Alcance</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="radio"
                      name="scope"
                      value="general"
                      checked={form.scope === 'general'}
                      onChange={() => setForm({ ...form, scope: 'general', unit_id: '' })}
                      className="accent-indigo-600"
                    />
                    General
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="radio"
                      name="scope"
                      value="unit"
                      checked={form.scope === 'unit'}
                      onChange={() => setForm({ ...form, scope: 'unit' })}
                      className="accent-indigo-600"
                    />
                    Por depto
                  </label>
                </div>
              </div>
              {form.scope === 'unit' && (
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Unidad</label>
                  <select
                    value={form.unit_id}
                    onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
                    className="input-field w-full"
                  >
                    <option value="">Seleccionar unidad...</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>Depto {u.number}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Monto</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                  className="input-field w-full"
                  min={0}
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Fecha</label>
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Proveedor</label>
                <input
                  type="text"
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  className="input-field w-full"
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Referencia</label>
                <input
                  type="text"
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  className="input-field w-full"
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="input-field w-full"
                  rows={3}
                  placeholder="Opcional"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.amount || !form.expense_date}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Eliminar gasto</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              ¿Eliminar gasto de <strong className="text-gray-900 dark:text-white">{formatCurrency(Number(deleteTarget.amount))}</strong> ({CATEGORY_LABELS[deleteTarget.category]})? Esta acción no se puede deshacer.
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
